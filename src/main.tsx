import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// ─── Stable viewport height for edge-to-edge Android ────────────────────────
// Mixing CSS percentage heights (100%) with the dvh unit in the same element
// chain causes a layout gap on Android after system events (screenshot, app
// background/foreground switch) because the WebView reports dvh and 100% from
// different recalculation passes. We replace dvh with a JS-maintained CSS
// variable --app-h that is always window.innerHeight px and is refreshed on
// every event that can change the true visible height.
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
// ─────────────────────────────────────────────────────────────────────────────

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
