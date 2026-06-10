package com.gingery.wisteria.plugins

import android.Manifest
import android.content.Context
import android.content.SharedPreferences
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Step counter bridge — SensorManager + Sensor.TYPE_STEP_COUNTER.
 *
 * TYPE_STEP_COUNTER reports the cumulative step count since the device
 * last booted; the hardware keeps counting while the app is dead. To turn
 * that into "steps today" we keep a per-day baseline and report
 * cumulative − baseline.
 *
 * Where the baseline is anchored is what makes or breaks accuracy. The
 * old revision anchored it at "the first sensor event the app saw each
 * day", which silently discarded every step taken before the app was
 * first opened that day — systematically lower than the system's own
 * counter (often by thousands). Instead, on day rollover we anchor at the
 * LAST cumulative value seen on a previous day: everything the hardware
 * counted between then and now happened since the app last looked, and
 * (phones being asleep at night) almost all of it belongs to today.
 *
 * Edge cases:
 *   - Reboot overnight (counter went backwards across days) → baseline 0;
 *     everything since boot counts as today.
 *   - Reboot mid-day → bank today's count so far into a carry, baseline 0,
 *     keep adding on top instead of starting over.
 *   - getSteps() before the day's first sensor event → returns 0 rather
 *     than serving yesterday's persisted count as today's. The sensor
 *     delivers a reading shortly after listener registration, so the
 *     window where this matters is seconds wide.
 *
 * Permission: android.permission.ACTIVITY_RECOGNITION (Android 10+).
 */
@CapacitorPlugin(
    name = "StepCounter",
    permissions = [
        Permission(
            alias = "activity",
            strings = [Manifest.permission.ACTIVITY_RECOGNITION]
        )
    ]
)
class StepCounterPlugin : Plugin(), SensorEventListener {

    private var sensorManager: SensorManager? = null
    private var stepSensor: Sensor? = null
    private var todaySteps: Int = 0

    private val prefs: SharedPreferences
        get() = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    override fun load() {
        sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        stepSensor = sensorManager?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
        // Only trust the persisted count if it was computed today.
        todaySteps = if (prefs.getString(KEY_BASELINE_DAY, null) == todayKey()) {
            prefs.getInt(KEY_LAST_TODAY_STEPS, 0)
        } else {
            0
        }
        if (getPermissionState("activity") == PermissionState.GRANTED) {
            registerSensor()
        }
    }

    @PluginMethod
    fun getSteps(call: PluginCall) {
        if (prefs.getString(KEY_BASELINE_DAY, null) != todayKey()) {
            // Day rolled over and no sensor event yet — the in-memory value
            // is yesterday's.
            todaySteps = 0
        }
        val ret = JSObject()
        ret.put("steps", todaySteps)
        call.resolve(ret)
    }

    /** Compatibility shim: the old plugin had start() to register the
     *  listener and asked for permission. We still expose it so older JS
     *  callers don't break, and so that pages can re-trigger the
     *  permission prompt explicitly. */
    @PluginMethod
    fun start(call: PluginCall) {
        if (getPermissionState("activity") != PermissionState.GRANTED) {
            requestPermissionForAlias("activity", call, "permissionCallback")
            return
        }
        registerSensor()
        call.resolve()
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        sensorManager?.unregisterListener(this)
        call.resolve()
    }

    @PermissionCallback
    private fun permissionCallback(call: PluginCall) {
        if (getPermissionState("activity") == PermissionState.GRANTED) {
            registerSensor()
            call.resolve()
        } else {
            call.reject("ACTIVITY_RECOGNITION 没批准，步数读不到")
        }
    }

    private fun registerSensor() {
        val mgr = sensorManager ?: return
        val sensor = stepSensor ?: return
        mgr.registerListener(this, sensor, SensorManager.SENSOR_DELAY_UI)
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (event == null || event.values.isEmpty()) return
        val cumulative = event.values[0]
        val today = todayKey()
        val storedDay = prefs.getString(KEY_BASELINE_DAY, null)
        val storedBaseline = prefs.getFloat(KEY_BASELINE_VALUE, -1f)
        val lastSeen = prefs.getFloat(KEY_LAST_CUMULATIVE, -1f)

        var carry = prefs.getInt(KEY_CARRY_STEPS, 0)
        val baseline: Float
        when {
            // First event of a new calendar day. Anchor at the last value we
            // saw on a previous day so steps walked before the app was opened
            // today still count. (Steps taken before midnight on the gap day
            // get attributed to today too — unavoidable without a background
            // service, and tiny compared to what the old anchor discarded.)
            storedDay != today -> {
                baseline = when {
                    lastSeen < 0f -> cumulative          // first run ever — no history
                    cumulative + 1f < lastSeen -> 0f     // rebooted since we last looked
                    else -> lastSeen
                }
                carry = 0
                prefs.edit()
                    .putString(KEY_BASELINE_DAY, today)
                    .putFloat(KEY_BASELINE_VALUE, baseline)
                    .putInt(KEY_CARRY_STEPS, 0)
                    .apply()
            }
            // Mid-day reboot: counter restarted from 0. Bank what we had
            // already counted today and keep adding on top of it.
            cumulative + 1f < storedBaseline -> {
                carry = prefs.getInt(KEY_LAST_TODAY_STEPS, 0)
                baseline = 0f
                prefs.edit()
                    .putFloat(KEY_BASELINE_VALUE, 0f)
                    .putInt(KEY_CARRY_STEPS, carry)
                    .apply()
            }
            else -> baseline = storedBaseline
        }

        val diff = carry + (cumulative - baseline).toInt().coerceAtLeast(0)
        todaySteps = diff
        prefs.edit()
            .putInt(KEY_LAST_TODAY_STEPS, diff)
            .putFloat(KEY_LAST_CUMULATIVE, cumulative)
            .apply()

        val data = JSObject()
        data.put("steps", diff)
        notifyListeners("stepUpdate", data)
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
        // no-op
    }

    private fun todayKey(): String {
        return SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
    }

    companion object {
        private const val PREFS = "step_counter"
        private const val KEY_BASELINE_DAY = "baseline_day"
        private const val KEY_BASELINE_VALUE = "baseline_value"
        private const val KEY_LAST_TODAY_STEPS = "last_today_steps"
        private const val KEY_LAST_CUMULATIVE = "last_cumulative"
        private const val KEY_CARRY_STEPS = "carry_steps"
    }
}
