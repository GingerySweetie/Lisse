import { registerPlugin } from '@capacitor/core';

/**
 * AccessibilityCapture — scoped screen reader fallback for payment
 * flows that don't fire a system notification (Alipay 零钱 / 当面付,
 * WeChat 扫一扫). See PaymentAccessibilityService.kt for the strict
 * scope.
 *
 * Two-gate enablement:
 *   1. The user toggles it ON in /bill-sources (we mirror this to
 *      SharedPreferences via setEnabled). Default OFF.
 *   2. The user enables "辅助功能 → Wisteria 支付识别" in system
 *      Settings (use openAccessibilitySettings to jump there).
 *
 * Captured bills enter the same broadcast that the notification
 * listener uses, so BillReceiver picks them up identically.
 */
export interface AccessibilityCapturePlugin {
  /** True if Wisteria's accessibility service is enabled in the system. */
  isEnabledInSystem(): Promise<{ enabled: boolean }>;
  /** Launch system Settings → 辅助功能. */
  openAccessibilitySettings(): Promise<void>;
  /** Current in-app toggle (mirrors a SharedPreferences flag). */
  getEnabled(): Promise<{ enabled: boolean }>;
  /** Persist the in-app toggle. */
  setEnabled(args: { enabled: boolean }): Promise<void>;
}

const AccessibilityCapture =
  registerPlugin<AccessibilityCapturePlugin>('AccessibilityCapture');
export default AccessibilityCapture;
