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
 *   getHourlyDistribution() — today's per-hour ms
 *   getUnlocks()         — today's keyguard unlock count + first-unlock HH:MM
 *
 * Accuracy: every usage query reconstructs foreground time from the raw
 * UsageEvents stream — ACTIVITY_RESUMED opens a span, ACTIVITY_PAUSED /
 * ACTIVITY_STOPPED closes it, screen-off / shutdown force-close everything
 * — clipped to the asked window. The previous revision summed
 * `totalTimeInForeground` straight off `queryUsageStats(INTERVAL_DAILY,…)`,
 * which is wrong twice over: the API returns every daily bucket that
 * *intersects* the range (same package shows up repeatedly → plain summing
 * double-counts), and bucket boundaries are the system's, not local
 * midnight (week totals landed on the wrong day). Both made our numbers
 * drift far from 数字健康.
 *
 * The system only retains usage events for a few days, so windows whose
 * events have been evicted fall back to queryAndAggregateUsageStats —
 * still deduped per package, just coarser day attribution.
 *
 * Our own package is included everywhere: system screen time counts it,
 * excluding ourselves made totals run low. (Roast logic exempts Wisteria
 * separately via the JS READER_PACKAGES whitelist.)
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
        if (usageStatsManager() == null) {
            call.reject("UsageStatsManager 不可用")
            return
        }
        val out = JSObject()
        out.put("usage", buildAppUsageArray(usageForWindow(start, end)))
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
        if (usageStatsManager() == null) {
            call.reject("UsageStatsManager 不可用")
            return
        }
        val range = todayRange()
        val out = JSObject()
        out.put("usage", buildAppUsageArray(usageForWindow(range[0], range[1])))
        call.resolve(out)
    }

    @PluginMethod
    fun getWeekUsage(call: PluginCall) {
        if (usageStatsManager() == null) {
            call.reject("UsageStatsManager 不可用")
            return
        }
        val c = Calendar.getInstance()
        c.set(Calendar.HOUR_OF_DAY, 0)
        c.set(Calendar.MINUTE, 0)
        c.set(Calendar.SECOND, 0)
        c.set(Calendar.MILLISECOND, 0)
        c.add(Calendar.DAY_OF_YEAR, -6)
        val now = System.currentTimeMillis()

        // Local-midnight boundaries: bounds[i]..bounds[i+1] = day i.
        val bounds = LongArray(8)
        val iter = c.clone() as Calendar
        for (i in 0..7) {
            bounds[i] = iter.timeInMillis
            iter.add(Calendar.DAY_OF_YEAR, 1)
        }

        // One event sweep over the whole week; spans crossing midnight get
        // split across the day buckets they overlap.
        val totals = LongArray(7)
        for (s in collectForegroundSpans(bounds[0], now)) {
            for (i in 0 until 7) {
                val a = maxOf(s.start, bounds[i])
                val b = minOf(s.end, bounds[i + 1])
                if (b > a) totals[i] += b - a
            }
        }

        val fmt = SimpleDateFormat("yyyy-MM-dd", Locale.US)
        val days = JSArray()
        for (i in 0 until 7) {
            var total = totals[i]
            if (total == 0L) {
                // Events for that day already evicted (system keeps them
                // only a few days) — fall back to the deduped aggregate.
                val end = minOf(bounds[i + 1], now)
                if (end > bounds[i]) {
                    total = aggregatedStatsFallback(bounds[i], end)
                        .values.sumOf { it.totalMs }
                }
            }
            val day = JSObject()
            day.put("date", fmt.format(Date(bounds[i])))
            day.put("totalMs", total)
            days.put(day)
        }
        val ret = JSObject()
        ret.put("days", days)
        call.resolve(ret)
    }

    @PluginMethod
    fun getHourlyDistribution(call: PluginCall) {
        if (usageStatsManager() == null) {
            call.reject("UsageStatsManager 不可用")
            return
        }
        val range = todayRange()
        val buckets = LongArray(24)
        for (s in collectForegroundSpans(range[0], range[1])) {
            distributeSpan(buckets, s.start, s.end, range[0])
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

    // ─── Foreground-span engine ───────────────────────────────────────

    private class FgSpan(val pkg: String, val start: Long, val end: Long)

    private class PkgAgg(var totalMs: Long = 0L, var lastEnd: Long = 0L)

    /**
     * Rebuild per-app foreground spans inside [rangeStart, rangeEnd] from
     * the raw event stream. Events are scanned from a few hours before
     * rangeStart so an app already open at the boundary (e.g. across
     * midnight) still contributes its in-range share; spans are clipped
     * to the window before being returned.
     *
     * Spans are keyed per activity, not per package: switching from
     * activity A to activity B inside the same app fires A's PAUSED after
     * B's RESUMED on some sequences, and a package-keyed map would close
     * the whole app's span on A's exit.
     */
    private fun collectForegroundSpans(rangeStart: Long, rangeEnd: Long): List<FgSpan> {
        val mgr = usageStatsManager() ?: return emptyList()
        val clippedEnd = minOf(rangeEnd, System.currentTimeMillis())
        if (clippedEnd <= rangeStart) return emptyList()
        val events = try {
            mgr.queryEvents(rangeStart - BOUNDARY_LOOKBACK_MS, clippedEnd)
        } catch (_: Exception) {
            return emptyList()
        }

        val open = HashMap<String, Long>() // "pkg|activityClass" → resumed-at
        val raw = ArrayList<FgSpan>()

        fun closeAll(t: Long) {
            for ((key, since) in open) {
                if (t > since) raw.add(FgSpan(key.substringBefore('|'), since, t))
            }
            open.clear()
        }

        val ev = UsageEvents.Event()
        while (events.hasNextEvent()) {
            events.getNextEvent(ev)
            val pkg = ev.packageName ?: continue
            val key = pkg + "|" + (ev.className ?: "")
            when (ev.eventType) {
                // MOVE_TO_FOREGROUND/BACKGROUND are the pre-API-29 names of
                // ACTIVITY_RESUMED/PAUSED — same int values (1 / 2).
                UsageEvents.Event.MOVE_TO_FOREGROUND ->
                    if (!open.containsKey(key)) open[key] = ev.timeStamp
                UsageEvents.Event.MOVE_TO_BACKGROUND, ACTIVITY_STOPPED ->
                    open.remove(key)?.let { since ->
                        if (ev.timeStamp > since) raw.add(FgSpan(pkg, since, ev.timeStamp))
                    }
                // Screen off / shutdown ends everyone's foreground time even
                // when the OEM never delivers the PAUSED for it.
                SCREEN_NON_INTERACTIVE, DEVICE_SHUTDOWN -> closeAll(ev.timeStamp)
            }
        }
        closeAll(clippedEnd)

        val out = ArrayList<FgSpan>(raw.size)
        for (s in raw) {
            val a = maxOf(s.start, rangeStart)
            val b = minOf(s.end, clippedEnd)
            if (b > a) out.add(FgSpan(s.pkg, a, b))
        }
        return out
    }

    private fun aggregateSpans(spans: List<FgSpan>): HashMap<String, PkgAgg> {
        val byPkg = HashMap<String, PkgAgg>()
        for (s in spans) {
            val agg = byPkg.getOrPut(s.pkg) { PkgAgg() }
            agg.totalMs += s.end - s.start
            if (s.end > agg.lastEnd) agg.lastEnd = s.end
        }
        return byPkg
    }

    /** Dedup-safe fallback for windows whose events have been evicted.
     *  queryAndAggregateUsageStats merges all intersecting buckets into a
     *  single per-package entry, so unlike raw queryUsageStats it can't
     *  double-count. Same totalTimeInForeground semantics as the span
     *  engine (resumed time), keeping the two paths comparable. */
    private fun aggregatedStatsFallback(start: Long, end: Long): Map<String, PkgAgg> {
        val byPkg = HashMap<String, PkgAgg>()
        val mgr = usageStatsManager() ?: return byPkg
        val stats: Map<String, UsageStats> = try {
            mgr.queryAndAggregateUsageStats(start, end) ?: return byPkg
        } catch (_: Exception) {
            return byPkg
        }
        for ((pkg, s) in stats) {
            val fg = s.totalTimeInForeground
            if (fg <= 0) continue
            byPkg[pkg] = PkgAgg(fg, s.lastTimeUsed)
        }
        return byPkg
    }

    private fun usageForWindow(start: Long, end: Long): Map<String, PkgAgg> {
        val byPkg = aggregateSpans(collectForegroundSpans(start, end))
        if (byPkg.isNotEmpty()) return byPkg
        return aggregatedStatsFallback(start, minOf(end, System.currentTimeMillis()))
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
        val start = if (startRaw < startOfDay) startOfDay else startRaw
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

    /** One row per package, biggest first. */
    private fun buildAppUsageArray(byPkg: Map<String, PkgAgg>): JSArray {
        val arr = JSArray()
        val pm = context.packageManager
        val entries = byPkg.entries.sortedByDescending { it.value.totalMs }
        for ((pkg, agg) in entries) {
            if (agg.totalMs <= 0) continue
            val o = JSObject()
            o.put("packageName", pkg)
            o.put("foregroundMs", agg.totalMs)
            o.put("lastTimeUsed", agg.lastEnd)

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
        // Event-type values kept as literals for older compileSdk:
        // SCREEN_NON_INTERACTIVE=16, KEYGUARD_HIDDEN=18 (API 28);
        // ACTIVITY_STOPPED=23, DEVICE_SHUTDOWN=26 (API 29).
        private const val KEYGUARD_HIDDEN = 18
        private const val SCREEN_NON_INTERACTIVE = 16
        private const val ACTIVITY_STOPPED = 23
        private const val DEVICE_SHUTDOWN = 26
        // How far before a window we scan events so apps already in the
        // foreground at the boundary still get their in-range share.
        private const val BOUNDARY_LOOKBACK_MS = 12L * 60L * 60L * 1000L
    }
}
