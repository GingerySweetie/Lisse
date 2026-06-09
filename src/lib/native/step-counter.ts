import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/**
 * StepCounter — bridge over Android's TYPE_STEP_COUNTER hardware sensor.
 *
 * The native plugin persists a baseline per calendar day so `getSteps()`
 * returns today's step count (not the boot-cumulative value the sensor
 * actually reports). The `stepUpdate` event also fires today's count.
 *
 * Permission: ACTIVITY_RECOGNITION (Android 10+). Call start() once to
 * trigger the runtime prompt the first time.
 */
export interface StepCounterPlugin {
  /** Today's step count (cumulative since today's local midnight). */
  getSteps(): Promise<{ steps: number }>;
  /** Register the sensor listener. Triggers the permission prompt on
   *  first call if ACTIVITY_RECOGNITION hasn't been granted. */
  start(): Promise<void>;
  stop(): Promise<void>;
  addListener(
    event: 'stepUpdate',
    cb: (data: { steps: number }) => void,
  ): Promise<PluginListenerHandle>;
}

const StepCounter = registerPlugin<StepCounterPlugin>('StepCounter');

export default StepCounter;
