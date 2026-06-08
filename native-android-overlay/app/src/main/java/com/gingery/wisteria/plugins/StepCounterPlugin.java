package com.gingery.wisteria.plugins;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bridges Android's Sensor.TYPE_STEP_COUNTER to the JS side.
 *
 * The system sensor reports total steps since the device booted. Survives
 * app restarts (until reboot). We expose:
 *   - getSteps() — immediate snapshot of currentSteps
 *   - start()    — register the listener
 *   - stop()     — unregister
 *   - emits "stepUpdate" event on every sensor delta.
 *
 * Requires the ACTIVITY_RECOGNITION runtime permission. The system
 * prompts on first sensor access.
 */
@CapacitorPlugin(name = "StepCounter")
public class StepCounterPlugin extends Plugin implements SensorEventListener {
    private SensorManager sensorManager;
    private Sensor stepSensor;
    private float currentSteps = 0f;

    @Override
    public void load() {
        sensorManager = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        if (sensorManager != null) {
            stepSensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
        }
    }

    @PluginMethod
    public void getSteps(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("steps", (int) currentSteps);
        call.resolve(ret);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (sensorManager != null && stepSensor != null) {
            sensorManager.registerListener(this, stepSensor, SensorManager.SENSOR_DELAY_UI);
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (sensorManager != null) {
            sensorManager.unregisterListener(this);
        }
        call.resolve();
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (event != null && event.values != null && event.values.length > 0) {
            currentSteps = event.values[0];
            JSObject data = new JSObject();
            data.put("steps", (int) currentSteps);
            notifyListeners("stepUpdate", data);
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {
        // no-op
    }
}
