package com.gingery.wisteria.plugins

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStats
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.Drawable
import android.os.Process
import android.provider.Settings
import android.util.Base64
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.ByteArrayOutputStream
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/**
 * UsageStatsManager bridge.
 *
 *   hasPermission()      — is GET_USAGE_STATS granted (AppOps)?
 *   requestPermission()  — open system Settings → "使用情况访问" page
 *   getUsageStats(start, end)         — per-app foreground ms in window
 *   getUnlockCount(start, end)        — KEYGUARD_HIDDEN events in window
 *   getTodayUsage()      — convenience: today 00:00 → now
 *   getWeekUsage()       — last 7 days, daily totals
 *   getHourlyDistribution() — today's per-hour ms (reconstructed from
 *                            UsageEvents MOVE_TO_FG/BG pairs)
 *   getUnlocks()         — today's keyguard unlock count + first-unlock HH:MM
 *
 * Permission: android.permission.PACKAGE_USAGE_STATS — special access,
 * declared in the manifest but granted via Settings, not at install time.
 *
 * Android 11+ also needs QUERY_ALL_PACKAGES (or a <queries> block) so
 * PackageManager.getApplicationInfo succeeds for arbitrary packages —
 * otherwise app names fall back to bare package ids.
 */
@CapacitorPlugin(name = "UsageStats")
class UsageStatsPlugin : Plugin() {

    @PluginMethod
    fun hasPermission(call: PluginCall) {
        val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as? AppOpsManager
        val granted = appOps?.let {
            val mode = it.unsafeCheckOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                context.packageName
            )
            mode == AppOpsManager.MODE_ALLOWED
        } ?: false
        val ret = JSObject()
        ret.put("granted", granted)
        call.resolve(ret)
    }

    /** Open the system's "Usage access" settings page. The user flips the
     *  Wisteria switch there; we re-poll permission on the next page focus. */
    @PluginMethod
    fun requestPermission(call: PluginCall) {
        try {
            val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            call.resolve()
        } catch (e: Exception) {
            call.reject("打不开用量访问设置：${e.message}")
        }
    }

    /** Compatibility alias kept so existing JS callers don't break. */
    @PluginMethod
    fun openSettings(call: PluginCall) {
        requestPermission(call)
    }

    /** Generic per-app usage query. */
    @PluginMethod
    fun getUsageStats(call: PluginCall) {
        val start = call.getLong("startTime") ?: run {
            call.reject("startTime 必填")
            return
        }
        val end = call.getLong("endTime") ?: run {
            call.reject("endTime 必填")
            return
        }
        val mgr = usageStatsManager() ?: run {
            call.reject("UsageStatsManager 不可用")
            return
        }
        val list = try {
            mgr.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, start, end)
        } catch (e: Exception) {
            call.reject("queryUsageStats 失败：${e.message}")
            return
        }
        val out = JSObject()
        out.put("usage", buildAppUsageArray(list))
        call.resolve(out)
    }

    /** Generic unlock-count query. KEYGUARD_HIDDEN = int 18 (API 28+). */
    @PluginMethod
    fun getUnlockCount(call: PluginCall) {
        val start = call.getLong("startTime") ?: run {
            call.reject("startTime 必填")
            return
        }
        val end = call.getLong("endTime") ?: run {
            call.reject("endTime 必填")
            return
        }
        val mgr = usageStatsManager() ?: run {
            call.reject("UsageStatsManager 不可用")
            return
        }
        var count = 0
        var firstAt = -1L
        try {
            val events = mgr.queryEvents(start, end)
            val ev = UsageEvents.Event()
            while (events.hasNextEvent()) {
                events.getNextEvent(ev)
                if (ev.eventType == KEYGUARD_HIDDEN) {
                    count++
                    if (firstAt < 0) firstAt = ev.timeStamp
                }
            }
        } catch (_: Exception) {
            // ignore — older OEMs sometimes throw on queryEvents
        }
        val ret = JSObject()
        ret.put("count", count)
        if (firstAt > 0) {
            ret.put("firstAt", firstAt)
        } else {
            ret.put("firstAt", JSObject.NULL)
        }
        call.resolve(ret)
    }

    // ─── Convenience wrappers (kept for existing UI code) ──────────────

    @PluginMethod
    fun getTodayUsage(call: PluginCall) {
        val mgr = usageStatsManager() ?: run {
            call.reject("UsageStatsManager 不可用")
            return
        }
        val range = todayRange()
        val list = try {
            mgr.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, range[0], range[1])
        } catch (e: Exception) {
            call.reject("queryUsageStats 失败：${e.message}")
            return
        }
        val out = JSObject()
        out.put("usage", buildAppUsageArray(list))
        call.resolve(out)
    }

    @PluginMethod
    fun getWeekUsage(call: PluginCall) {
        val mgr = usageStatsManager() ?: run {
            call.reject("UsageStatsManager 不可用")
            return
        }
        val c = Calendar.getInstance()
        c.set(Calendar.HOUR_OF_DAY, 0)
        c.set(Calendar.MINUTE, 0)
        c.set(Calendar.SECOND, 0)
        c.set(Calendar.MILLISECOND, 0)
        c.add(Calendar.DAY_OF_YEAR, -6)
        val startWeek = c.timeInMillis
        val now = System.currentTimeMillis()

        val totalByDate = HashMap<String, Long>()
        val ownPkg = context.packageName
        val fmt = SimpleDateFormat("yyyy-MM-dd", Locale.US)

        try {
            val stats = mgr.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, startWeek, now)
            stats?.forEach { s ->
                val pkg = s.packageName ?: return@forEach
                if (pkg == ownPkg) return@forEach
                val fg = s.totalTimeInForeground
                if (fg <= 0) return@forEach
                val date = fmt.format(Date(s.firstTimeStamp))
                totalByDate[date] = (totalByDate[date] ?: 0L) + fg
            }
        } catch (e: Exception) {
            call.reject("queryUsageStats 失败：${e.message}")
            return
        }

        val days = JSArray()
        val iter = c.clone() as Calendar
        for (i in 0 until 7) {
            val date = fmt.format(iter.time)
            val day = JSObject()
            day.put("date", date)
            day.put("totalMs", totalByDate[date] ?: 0L)
            days.put(day)
            iter.add(Calendar.DAY_OF_YEAR, 1)
        }
        val ret = JSObject()
        ret.put("days", days)
        call.resolve(ret)
    }

    @PluginMethod
    fun getHourlyDistribution(call: PluginCall) {
        val mgr = usageStatsManager() ?: run {
            call.reject("UsageStatsManager 不可用")
            return
        }
        val range = todayRange()
        val startOfDay = range[0]
        val buckets = LongArray(24)
        val ownPkg = context.packageName

        try {
            val events = mgr.queryEvents(startOfDay, range[1])
            val ev = UsageEvents.Event()
            val foregroundSince = HashMap<String, Long>()
            while (events.hasNextEvent()) {
                events.getNextEvent(ev)
                val pkg = ev.packageName ?: continue
                if (pkg == ownPkg) continue
                when (ev.eventType) {
                    UsageEvents.Event.MOVE_TO_FOREGROUND -> {
                        foregroundSince[pkg] = ev.timeStamp
                    }
                    UsageEvents.Event.MOVE_TO_BACKGROUND -> {
                        foregroundSince.remove(pkg)?.let { start ->
                            distributeSpan(buckets, start, ev.timeStamp, startOfDay)
                        }
                    }
                }
            }
            val now = System.currentTimeMillis()
            foregroundSince.values.forEach { distributeSpan(buckets, it, now, startOfDay) }
        } catch (e: Exception) {
            call.reject("queryEvents 失败：${e.message}")
            return
        }

        val hours = JSArray()
        buckets.forEach { hours.put(it) }
        val ret = JSObject()
        ret.put("hours", hours)
        call.resolve(ret)
    }

    @PluginMethod
    fun getUnlocks(call: PluginCall) {
        val mgr = usageStatsManager() ?: run {
            call.reject("UsageStatsManager 不可用")
            return
        }
        val range = todayRange()
        var count = 0
        var firstAt = -1L
        try {
            val events = mgr.queryEvents(range[0], range[1])
            val ev = UsageEvents.Event()
            while (events.hasNextEvent()) {
                events.getNextEvent(ev)
                if (ev.eventType == KEYGUARD_HIDDEN) {
                    count++
                    if (firstAt < 0) firstAt = ev.timeStamp
                }
            }
        } catch (_: Exception) {
        }
        val ret = JSObject()
        ret.put("count", count)
        if (firstAt > 0) {
            val fc = Calendar.getInstance()
            fc.timeInMillis = firstAt
            ret.put(
                "firstAt",
                String.format(Locale.US, "%02d:%02d", fc.get(Calendar.HOUR_OF_DAY), fc.get(Calendar.MINUTE))
            )
        } else {
            ret.put("firstAt", JSObject.NULL)
        }
        call.resolve(ret)
    }

    // ─── Helpers ──────────────────────────────────────────────────────

    private fun usageStatsManager(): UsageStatsManager? {
        return context.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
    }

    private fun todayRange(): LongArray {
        val c = Calendar.getInstance()
        c.set(Calendar.HOUR_OF_DAY, 0)
        c.set(Calendar.MINUTE, 0)
        c.set(Calendar.SECOND, 0)
        c.set(Calendar.MILLISECOND, 0)
        return longArrayOf(c.timeInMillis, System.currentTimeMillis())
    }

    private fun distributeSpan(buckets: LongArray, startRaw: Long, end: Long, startOfDay: Long) {
        if (end <= startRaw || end <= startOfDay) return
        var start = if (startRaw < startOfDay) startOfDay else startRaw
        var cursor = start
        while (cursor < end) {
            val c = Calendar.getInstance().apply { timeInMillis = cursor }
            val hour = c.get(Calendar.HOUR_OF_DAY)
            c.set(Calendar.MINUTE, 0)
            c.set(Calendar.SECOND, 0)
            c.set(Calendar.MILLISECOND, 0)
            c.add(Calendar.HOUR_OF_DAY, 1)
            val nextHour = c.timeInMillis
            val slice = minOf(nextHour, end) - cursor
            if (hour in 0..23 && slice > 0) buckets[hour] += slice
            cursor = nextHour
        }
    }

    private fun buildAppUsageArray(stats: List<UsageStats>?): JSArray {
        val arr = JSArray()
        if (stats == null) return arr
        val pm = context.packageManager
        val ownPkg = context.packageName
        for (s in stats) {
            val pkg = s.packageName ?: continue
            if (pkg == ownPkg) continue
            val fg = s.totalTimeInForeground
            if (fg <= 0) continue
            val o = JSObject()
            o.put("packageName", pkg)
            o.put("foregroundMs", fg)
            o.put("lastTimeUsed", s.lastTimeUsed)

            var appName: String = pkg
            var iconBase64: String? = null
            try {
                val ai = pm.getApplicationInfo(pkg, 0)
                val label = pm.getApplicationLabel(ai)
                if (label.isNotEmpty()) appName = label.toString()
                iconBase64 = drawableToBase64(pm.getApplicationIcon(ai))
            } catch (_: PackageManager.NameNotFoundException) {
                // visibility restriction or uninstalled
            } catch (_: Exception) {
            }
            o.put("appName", appName)
            if (iconBase64 != null) o.put("iconPng", iconBase64)
            arr.put(o)
        }
        return arr
    }

    private fun drawableToBase64(drawable: Drawable): String? {
        return try {
            val w = drawable.intrinsicWidth.coerceIn(24, 72).coerceAtLeast(24)
            val h = drawable.intrinsicHeight.coerceIn(24, 72).coerceAtLeast(24)
            val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bmp)
            drawable.setBounds(0, 0, w, h)
            drawable.draw(canvas)
            val baos = ByteArrayOutputStream()
            bmp.compress(Bitmap.CompressFormat.PNG, 100, baos)
            Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP)
        } catch (_: Exception) {
            null
        }
    }

    companion object {
        // KEYGUARD_HIDDEN was added in API 28. Use the literal to stay
        // compatible with older compile targets.
        private const val KEYGUARD_HIDDEN = 18
    }
}
