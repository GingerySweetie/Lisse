import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/**
 * BillSniffer — bridge over Android's NotificationListenerService that
 * reads Alipay / WeChat payment notifications. On non-Android every
 * method resolves to a safe default so the same code runs in the
 * browser preview.
 */

export interface CapturedBill {
  amount: number;
  merchant: string;
  source: 'alipay' | 'wechat';
  timestamp: number;
}

export interface DebugLogEntry {
  /** Notification timestamp (ms). */
  ts: number;
  /** "alipay" | "wechat". */
  source: string;
  /** Combined notification body (title + bigText + text + subText + info). */
  body: string;
}

export interface BillSnifferPlugin {
  /** True if the user has granted notification-listener access to us. */
  isEnabled(): Promise<{ enabled: boolean }>;
  /** Launch the system Settings → 通知使用权 page so she can flip the switch. */
  openSettings(): Promise<void>;
  /** Drain bills captured while no JS listener was attached. */
  getPendingBills(): Promise<{ bills: CapturedBill[] }>;
  /** Debug: ring buffer of the last ~20 raw notifications observed from
   *  the target apps, regardless of whether they parsed into a bill. */
  getDebugLog(): Promise<{ entries: DebugLogEntry[] }>;
  addListener(
    event: 'billCaptured',
    cb: (bill: CapturedBill) => void,
  ): Promise<PluginListenerHandle>;
}

const BillSniffer = registerPlugin<BillSnifferPlugin>('BillSniffer');
export default BillSniffer;
