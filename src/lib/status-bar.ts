import { Capacitor, registerPlugin } from '@capacitor/core';

interface SystemBarsPlugin {
  setColor(options: { color: string; dark?: boolean }): Promise<void>;
}

// Native bridge to our SystemBarsPlugin.kt overlay. Paints both the
// status bar AND the bottom navigation bar with the same colour so every
// app page can extend its palette to the phone edges without going
// edge-to-edge (which broke on MIUI).
const SystemBars = registerPlugin<SystemBarsPlugin>('SystemBars');

// Default colour = solid equivalent of the app header backgrounds
// (.wis-chat-header / .topbar). The bars visually merge with the header
// instead of forming a distinct band above/below the content.
export const STATUS_BAR_DEFAULT = '#F5F0FA';

/**
 * Set both the status bar AND the bottom navigation bar to the same colour.
 * No-op on non-native platforms so callers can invoke it unconditionally.
 *
 * @param color  Hex string, e.g. '#F5F0FA' or '#2a1f3e'
 * @param dark   true  → the supplied colour is LIGHT → use dark icons.
 *               false → the supplied colour is DARK → use light icons.
 */
export async function setStatusBarColor(
  color: string,
  dark = true,
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await SystemBars.setColor({ color, dark });
  } catch {
    // Best-effort; failure to paint the bars must not break the UI.
  }
}

/** Restore the default lavender bars (call when leaving themed pages). */
export function resetStatusBar(): Promise<void> {
  return setStatusBarColor(STATUS_BAR_DEFAULT, true);
}
