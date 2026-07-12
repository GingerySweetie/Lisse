package com.gingery.wisteria

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.getcapacitor.BridgeActivity
import com.gingery.wisteria.plugins.AccessibilityCapturePlugin
import com.gingery.wisteria.plugins.BillSnifferPlugin
import com.gingery.wisteria.plugins.FileSaverPlugin
import com.gingery.wisteria.plugins.InAppBrowserPlugin
import com.gingery.wisteria.plugins.ShareIntentPlugin
import com.gingery.wisteria.plugins.SleepEstimatePlugin
import com.gingery.wisteria.plugins.StepCounterPlugin
import com.gingery.wisteria.plugins.UsageStatsPlugin

class MainActivity : BridgeActivity() {

    /**
     * Cache the last known non-zero inset values (in physical px) so we can
     * re-inject them when MIUI sends a bogus inset dispatch with top = 0.
     *
     * On MIUI 14, after screenshot capture or background→foreground transitions,
     * the system re-dispatches WindowInsets with systemBars.top = 0, which
     * propagates into the WebView and sets env(safe-area-inset-top) = 0.
     * The header then loses its status-bar padding and slides into the status
     * bar area.  Caching and re-injecting the last non-zero value prevents
     * the CSS variables from ever seeing 0 after the first correct dispatch.
     */
    private var lastTopPx = 0
    private var lastBottomPx = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        // ── Edge-to-edge MUST be configured before super.onCreate() ──────────
        // super.onCreate() creates the WebView and bakes in the fitsSystemWindows
        // mode at that instant.  Calling setDecorFitsSystemWindows(false) after
        // the WebView exists leaves MIUI with a stale clipped-layout record that
        // it reverts to during lifecycle events, producing the inset mismatch.
        WindowCompat.setDecorFitsSystemWindows(window, false)
        @Suppress("DEPRECATION")
        window.statusBarColor = Color.TRANSPARENT

        registerPlugin(StepCounterPlugin::class.java)
        registerPlugin(UsageStatsPlugin::class.java)
        registerPlugin(SleepEstimatePlugin::class.java)
        registerPlugin(ShareIntentPlugin::class.java)
        registerPlugin(BillSnifferPlugin::class.java)
        registerPlugin(AccessibilityCapturePlugin::class.java)
        registerPlugin(InAppBrowserPlugin::class.java)
        registerPlugin(FileSaverPlugin::class.java)
        super.onCreate(savedInstanceState)

        // Icon appearance only; does not affect WebView layout dimensions.
        WindowInsetsControllerCompat(window, window.decorView)
            .isAppearanceLightStatusBars = true

        // ── Intercept every WindowInsets dispatch ─────────────────────────────
        // MIUI sometimes dispatches insets with systemBars.top = 0 (a platform
        // bug), which reaches the WebView and resets env(safe-area-inset-top)
        // to 0 — the header then has no status-bar padding and disappears into
        // the system bar.
        //
        // Strategy:
        //   1. Cache the last non-zero inset values the first time they arrive.
        //   2. On every subsequent dispatch, if the incoming top is 0 (MIUI
        //      bug), use the cached non-zero value instead.
        //   3. Write --safe-top / --safe-bottom CSS variables directly into the
        //      WebView so CSS never relies on env() after that first dispatch.
        ViewCompat.setOnApplyWindowInsetsListener(window.decorView) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())

            // Only update the cache when values are non-zero (real insets).
            if (bars.top > 0) lastTopPx = bars.top
            if (bars.bottom > 0) lastBottomPx = bars.bottom

            // Use cached values: if MIUI sends top=0 we silently restore the
            // last known good value so CSS never sees 0 after initial load.
            val injectTop = if (lastTopPx > 0) lastTopPx else bars.top
            val injectBottom = if (lastBottomPx > 0) lastBottomPx else bars.bottom
            injectSafeArea(injectTop, injectBottom)

            ViewCompat.onApplyWindowInsets(view, insets)
        }
    }

    override fun onResume() {
        super.onResume()
        // Force native inset re-dispatch, then re-inject the cached insets so
        // --safe-top / --safe-bottom are up to date BEFORE any CSS repaint.
        // Also fire a synthetic resize so syncAppHeight() in main.tsx re-reads
        // window.innerHeight and updates --app-h.
        window.decorView.post {
            ViewCompat.requestApplyInsets(window.decorView)
            bridge?.webView?.post {
                if (lastTopPx > 0) {
                    injectSafeArea(lastTopPx, lastBottomPx)
                }
                bridge?.webView?.evaluateJavascript(
                    "window.dispatchEvent(new Event('resize'));",
                    null
                )
            }
        }
    }

    /**
     * Write --safe-top and --safe-bottom directly into the WebView's document
     * root.  Converts native physical pixels to CSS logical pixels using the
     * page's devicePixelRatio so the values match what env() would report.
     */
    private fun injectSafeArea(topPx: Int, bottomPx: Int) {
        // Escape: don't inject before the WebView has a page loaded.
        val wv = bridge?.webView ?: return
        wv.evaluateJavascript(
            """(function(){
                var dpr = window.devicePixelRatio || 1;
                document.documentElement.style.setProperty('--safe-top',    (${topPx}    / dpr) + 'px');
                document.documentElement.style.setProperty('--safe-bottom', (${bottomPx} / dpr) + 'px');
            })();""",
            null
        )
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val instance = bridge.getPlugin("ShareIntent")?.instance
        if (instance is ShareIntentPlugin) {
            instance.handleNewIntent(intent)
        }
    }
}
