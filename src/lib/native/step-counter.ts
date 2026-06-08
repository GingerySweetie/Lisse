import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/**
 * StepCounter — thin TS wrapper around the native Android plugin that
 * reads `Sensor.TYPE_STEP_COUNTER`. On non-Android (web preview, iOS,
 * desktop) every call resolves to zero / no-op so the same code can
 * run in the browser without crashing.
 */
export interface StepCounterPlugin {
  /** Returns total steps since the device last booted (sensor value). */
  getSteps(): Promise<{ steps: number }>;
  /** Begin listening for step deltas. Required for the stepUpdate event. */
  start(): Promise<void>;
  /** Stop listening. */
  stop(): Promise<void>;
  /** Subscribe to step deltas emitted by the sensor. */
  addListener(
    event: 'stepUpdate',
    cb: (data: { steps: number }) => void,
  ): Promise<PluginListenerHandle>;
}

const StepCounter = registerPlugin<StepCounterPlugin>('StepCounter');

export default StepCounter;
