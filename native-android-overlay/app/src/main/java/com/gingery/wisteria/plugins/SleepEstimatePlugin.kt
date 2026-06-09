package com.gingery.wisteria.plugins

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Process
import android.provider.Settings
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * SleepEstimatePlugin — option A from the spec.
 *
 * No native sleep API on Android. We derive an estimate from screen
 * lock/unlock events: the longest continuous non-interactive span
 * starting after 18:00 yesterday and ending before 14:00 today is
 * taken as last night's sleep. Doesn't distinguish deep / light.
 *
 * Event types used (added in API 28):
 *   SCREEN_NON_INTERACTIVE = 16  → start of a sleep candidate span
 *   SCREEN_INTERACTIVE     = 15  → end of a sleep candidate span
 *   KEYGUARD_HIDDEN        = 18  → end of a sleep candidate span (unlock)
 *
 * Permission: same PACKAGE_USAGE_STATS as UsageStatsPlugin. The user
 * grants it once via Settings → Usage access; we share the grant.
 */
@CapacitorPlugin(name = "Sleep")
class SleepEstimatePlugin : Plugin() {

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

    /** Compatibility shims so existing JS callers don't break — the
     *  old plugin reported availability via Health Connect; on native
     *  estimation it's always "available" once the permission is granted. */
    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val ret = JSObject()
        ret.put("available", true)
        call.resolve(ret)
    }

    @PluginMethod
    fun getLastSleep(call: PluginCall) {
        estimateLastNightSleep(call)
    }

    @PluginMethod
    fun estimateLastNightSleep(call: PluginCall) {
        val mgr = context.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
        if (mgr == null) {
            call.reject("UsageStatsManager 不可用")
            return
        }

        val now = System.currentTimeMillis()
        // Look back from 18:00 yesterday. That window comfortably brackets
        // any reasonable sleep schedule including late-night people.
        val start = startOfYesterdayEvening()
        val events = try {
            mgr.queryEvents(start, now)
        } catch (e: Exception) {
            call.reject("queryEvents 失败：${e.message}")
            return
        }

        // Walk events; build a list of (off, on) pairs where "off" is the
        // first NON_INTERACTIVE event and "on" is the next INTERACTIVE or
        // KEYGUARD_HIDDEN event after it.
        data class Span(val off: Long, val on: Long) {
            val ms: Long get() = on - off
        }
        val spans = mutableListOf<Span>()
        var offCandidate: Long? = null

        val ev = UsageEvents.Event()
        while (events.hasNextEvent()) {
            events.getNextEvent(ev)
            when (ev.eventType) {
                SCREEN_NON_INTERACTIVE -> {
                    if (offCandidate == null) offCandidate = ev.timeStamp
                }
                SCREEN_INTERACTIVE, KEYGUARD_HIDDEN -> {
                    val off = offCandidate
                    if (off != null && ev.timeStamp > off) {
                        spans.add(Span(off, ev.timeStamp))
                        offCandidate = null
                    }
                }
            }
        }
        // If the screen is still off at query time, close the last span at now.
        offCandidate?.let { off ->
            if (now > off) spans.add(Span(off, now))
        }

        // Pick the best sleep candidate:
        //   - duration ≥ 3h
        //   - starts after 18:00 yesterday (relaxed) and before 06:00 today
        //   - ends after 03:00 today
        // Among matches, take the LONGEST. Fall back to any longest span
        // ≥ 3h if no window match.
        val sleepWindowOk = spans.filter { isWithinSleepWindow(it.off, it.on) && it.ms >= MIN_SLEEP_MS }
        val best = sleepWindowOk.maxByOrNull { it.ms }
            ?: spans.filter { it.ms >= MIN_SLEEP_MS }.maxByOrNull { it.ms }

        val ret = JSObject()
        if (best == null) {
            ret.put("session", JSObject.NULL)
            ret.put("startTime", JSObject.NULL)
            ret.put("endTime", JSObject.NULL)
            ret.put("durationMinutes", 0)
        } else {
            val isoFmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.US)
                .apply { timeZone = TimeZone.getDefault() }
            val startIso = isoFmt.format(Date(best.off))
            val endIso = isoFmt.format(Date(best.on))
            val minutes = best.ms / 60_000L
            ret.put("startTime", startIso)
            ret.put("endTime", endIso)
            ret.put("durationMinutes", minutes)
            // Backward-compat shape: a `session` object with the same fields.
            val session = JSObject()
            session.put("startTime", startIso)
            session.put("endTime", endIso)
            session.put("durationMinutes", minutes)
            ret.put("session", session)
        }
        call.resolve(ret)
    }

    private fun startOfYesterdayEvening(): Long {
        val c = Calendar.getInstance()
        c.add(Calendar.DAY_OF_YEAR, -1)
        c.set(Calendar.HOUR_OF_DAY, 18)
        c.set(Calendar.MINUTE, 0)
        c.set(Calendar.SECOND, 0)
        c.set(Calendar.MILLISECOND, 0)
        return c.timeInMillis
    }

    /** Sleep window: starts between yesterday 18:00 and today 06:00,
     *  ends between today 03:00 and today 14:00. */
    private fun isWithinSleepWindow(off: Long, on: Long): Boolean {
        val today0 = todayMidnight()
        val yesterday18 = today0 - 6L * H
        val today06 = today0 + 6L * H
        val today03 = today0 + 3L * H
        val today14 = today0 + 14L * H
        return off in yesterday18..today06 && on in today03..today14
    }

    private fun todayMidnight(): Long {
        val c = Calendar.getInstance()
        c.set(Calendar.HOUR_OF_DAY, 0)
        c.set(Calendar.MINUTE, 0)
        c.set(Calendar.SECOND, 0)
        c.set(Calendar.MILLISECOND, 0)
        return c.timeInMillis
    }

    companion object {
        // Event type constants — keep as int literals for older compileSdk.
        // API 28+ values: SCREEN_INTERACTIVE=15, SCREEN_NON_INTERACTIVE=16, KEYGUARD_HIDDEN=18.
        private const val SCREEN_INTERACTIVE = 15
        private const val SCREEN_NON_INTERACTIVE = 16
        private const val KEYGUARD_HIDDEN = 18
        private const val H = 60L * 60L * 1000L
        private const val MIN_SLEEP_MS = 3L * H
    }
}
