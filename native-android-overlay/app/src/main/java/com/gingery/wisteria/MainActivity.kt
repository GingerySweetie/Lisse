package com.gingery.wisteria

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.getcapacitor.BridgeActivity
import com.gingery.wisteria.plugins.AccessibilityCapturePlugin
import com.gingery.wisteria.plugins.BillSnifferPlugin
import com.gingery.wisteria.plugins.InAppBrowserPlugin
import com.gingery.wisteria.plugins.ShareIntentPlugin
import com.gingery.wisteria.plugins.SleepEstimatePlugin
import com.gingery.wisteria.plugins.StepCounterPlugin
import com.gingery.wisteria.plugins.UsageStatsPlugin

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // ── Edge-to-edge MUST be configured before super.onCreate() ──────────
        //
        // super.onCreate() creates the WebView and bakes in the current
        // "fitsSystemWindows" mode. If we call setDecorFitsSystemWindows(false)
        // afterwards (as we used to), MIUI's WebView implementation keeps the
        // original layout where window.innerHeight = screen_height - status_bar.
        // After screenshot capture or background→foreground transitions, MIUI
        // re-dispatches WindowInsets; the WebView oscillates between the two
        // heights and leaves visible top/bottom whitespace.
        //
        // By calling this BEFORE super.onCreate() the WebView is initialised
        // in edge-to-edge mode from the start: window.innerHeight = screen_height,
        // env(safe-area-inset-top) = status_bar_height from the very first frame,
        // and MIUI never has an "old" fitsSystemWindows state to revert to.
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
        super.onCreate(savedInstanceState)

        // Icon appearance only — does not affect WebView layout dimensions.
        WindowInsetsControllerCompat(window, window.decorView)
            .isAppearanceLightStatusBars = true
    }

    override fun onResume() {
        super.onResume()
        // On MIUI, WindowInsets are not automatically re-dispatched to the
        // WebView after the app returns from background or after the screenshot
        // capture preview is dismissed.  Force a native inset re-dispatch,
        // then fire a JS resize event so the web layer (syncAppHeight in
        // main.tsx) re-reads window.innerHeight and updates --app-h.
        //
        // The double-post ensures we run after the current frame *and* after
        // the WebView's own layout pass triggered by requestApplyInsets.
        window.decorView.post {
            ViewCompat.requestApplyInsets(window.decorView)
            bridge?.webView?.post {
                bridge?.webView?.evaluateJavascript(
                    "window.dispatchEvent(new Event('resize'));",
                    null
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        // Forward warm-start shares to ShareIntentPlugin so it can fire the
        // shareReceived event to the web layer.
        val instance = bridge.getPlugin("ShareIntent")?.instance
        if (instance is ShareIntentPlugin) {
            instance.handleNewIntent(intent)
        }
    }
}
