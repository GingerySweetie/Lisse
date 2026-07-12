import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

/** Default: app primary lavender — used by every non-bedroom page. */
export const STATUS_BAR_DEFAULT = '#F4ECF6';

/**
 * Set status bar background colour + icon style.
 * No-ops on non-native platforms so the call is safe to use everywhere.
 *
 * @param color  Hex colour string e.g. '#F4ECF6'
 * @param dark   true → dark icons (use on light backgrounds)
 *               false → light icons (use on dark backgrounds)
 */
export async function setStatusBarColor(
  color: string,
  dark = true,
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await StatusBar.setBackgroundColor({ color });
    await StatusBar.setStyle({ style: dark ? Style.Light : Style.Dark });
  } catch {
    // Non-fatal; best-effort only.
  }
}

/** Restore the default lavender status bar (call when leaving dark pages). */
export function resetStatusBar(): Promise<void> {
  return setStatusBarColor(STATUS_BAR_DEFAULT, true);
}
