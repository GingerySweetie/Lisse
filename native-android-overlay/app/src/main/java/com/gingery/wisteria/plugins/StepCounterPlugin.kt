package com.gingery.wisteria.plugins

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Bridges Android's Sensor.TYPE_STEP_COUNTER to the JS side.
 *
 * The system sensor reports total steps since the device booted; it
 * survives app restarts (until reboot). We expose:
 *   - getSteps() — immediate snapshot of currentSteps
 *   - start() — register the listener
 *   - stop()  — unregister
 *   - emits a "stepUpdate" event for live reactivity
 *
 * Requires the ACTIVITY_RECOGNITION runtime permission (handled at
 * the JS layer via Capacitor's permission API where applicable, or by
 * the user manually toggling it in Android settings on first run).
 */
@CapacitorPlugin(name = "StepCounter")
class StepCounterPlugin : Plugin(), SensorEventListener {
    private var sensorManager: SensorManager? = null
    private var stepSensor: Sensor? = null
    private var currentSteps: Float = 0f

    override fun load() {
        sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
        stepSensor = sensorManager?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
    }

    @PluginMethod
    fun getSteps(call: PluginCall) {
        val ret = JSObject()
        ret.put("steps", currentSteps.toInt())
        call.resolve(ret)
    }

    @PluginMethod
    fun start(call: PluginCall) {
        stepSensor?.let {
            sensorManager?.registerListener(this, it, SensorManager.SENSOR_DELAY_UI)
        }
        call.resolve()
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        sensorManager?.unregisterListener(this)
        call.resolve()
    }

    override fun onSensorChanged(event: SensorEvent?) {
        event?.let {
            currentSteps = it.values[0]
            val data = JSObject()
            data.put("steps", currentSteps.toInt())
            notifyListeners("stepUpdate", data)
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
}
