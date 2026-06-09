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
 * last booted. To turn that into "steps today" we persist the sensor's
 * value at the moment we first see it each calendar day; subsequent
 * readings minus that baseline = today's steps.
 *
 * Edge cases:
 *   - Phone reboots during the day → sensor counter resets to 0. Detected
 *     when newReading < baseline; we reset baseline to the new lower value
 *     and treat steps_today as starting fresh from there.
 *   - User opens the app before any sensor event arrived today → getSteps()
 *     returns the last known value (could be 0). Listener auto-starts in
 *     load() so the first event lands quickly once she moves.
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
    private var lastCumulative: Float = -1f

    private val prefs: SharedPreferences
        get() = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    override fun load() {
        sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        stepSensor = sensorManager?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
        todaySteps = prefs.getInt(KEY_LAST_TODAY_STEPS, 0)
        if (getPermissionState("activity") == PermissionState.GRANTED) {
            registerSensor()
        }
    }

    @PluginMethod
    fun getSteps(call: PluginCall) {
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

        val baseline: Float = when {
            // Day rolled over since we last saw an event.
            storedDay != today -> {
                prefs.edit()
                    .putString(KEY_BASELINE_DAY, today)
                    .putFloat(KEY_BASELINE_VALUE, cumulative)
                    .apply()
                cumulative
            }
            // Phone rebooted during the day — sensor counter reset to 0.
            cumulative + 1f < storedBaseline -> {
                prefs.edit().putFloat(KEY_BASELINE_VALUE, cumulative).apply()
                cumulative
            }
            else -> storedBaseline
        }

        val diff = (cumulative - baseline).toInt().coerceAtLeast(0)
        todaySteps = diff
        lastCumulative = cumulative
        prefs.edit().putInt(KEY_LAST_TODAY_STEPS, diff).apply()

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
    }
}
