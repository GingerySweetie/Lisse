import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// ─── Stable viewport height for edge-to-edge Android (Capacitor / MIUI) ─────
// --app-h is a JS-maintained CSS variable always equal to the true layout
// viewport height. It replaces 100dvh (which can mismatch 100% parent chains
// on Android WebView after system events) and raw 100% (which can be stale
// on MIUI after screenshot capture or background→foreground transitions).
//
// Sync sources (ordered by reliability on MIUI):
//  1. visualViewport 'resize' — fires more reliably than window.resize for
//     inset/viewport changes on mobile WebViews including MIUI's custom WebView.
//  2. window 'resize' — standard fallback.
//  3. visibilitychange (visible) / pageshow / focus — lifecycle events where
//     MIUI may have re-dispatched insets and changed the reported height.
// The native onResume() in MainActivity.kt also fires a synthetic 'resize'
// event via evaluateJavascript to cover the background→foreground case.
function syncAppHeight() {
  document.documentElement.style.setProperty('--app-h', `${window.innerHeight}px`);
}
syncAppHeight();
window.addEventListener('resize', syncAppHeight);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') syncAppHeight();
});
window.addEventListener('pageshow', syncAppHeight);
window.addEventListener('focus', syncAppHeight);
// visualViewport fires more reliably than window.resize on MIUI WebView for
// inset-only changes (status bar appearing/disappearing, screenshot overlay).
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', syncAppHeight);
}
// ─────────────────────────────────────────────────────────────────────────────

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
