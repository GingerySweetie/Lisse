package com.gingery.wisteria

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import androidx.core.view.WindowCompat
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
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(StepCounterPlugin::class.java)
        registerPlugin(UsageStatsPlugin::class.java)
        registerPlugin(SleepEstimatePlugin::class.java)
        registerPlugin(ShareIntentPlugin::class.java)
        registerPlugin(BillSnifferPlugin::class.java)
        registerPlugin(AccessibilityCapturePlugin::class.java)
        registerPlugin(InAppBrowserPlugin::class.java)
        registerPlugin(FileSaverPlugin::class.java)
        super.onCreate(savedInstanceState)

        // Capacitor 8's BridgeActivity calls
        //   WindowCompat.setDecorFitsSystemWindows(window, false)
        // in its own onCreate, enabling edge-to-edge so the WebView extends
        // behind the status bar. We override it back to true immediately after
        // so the status bar gets its own dedicated space above the WebView.
        //
        // Benefits of fitsSystemWindows = true on this app:
        //   • env(safe-area-inset-top) is always 0 — the WebView starts
        //     cleanly below the status bar, so no JS patching is needed.
        //   • Eliminates the MIUI bug where env(safe-area-inset-top) resets
        //     to 0 after screenshot / background→foreground transitions,
        //     which caused the chat header to vanish behind the status bar.
        WindowCompat.setDecorFitsSystemWindows(window, true)

        // Colour the status bar to match the app header backgrounds
        // (.wis-chat-header / .topbar). The JS layer (@capacitor/status-bar)
        // overrides this per-page (e.g. dark themes in the bedroom section).
        // #F5F0FA = solid equivalent of rgba(245, 240, 250, 0.8) — the topbar
        // background — so the status bar merges with the header visually.
        @Suppress("DEPRECATION")
        window.statusBarColor = Color.parseColor("#F5F0FA")

        // Dark icons on the light-lavender status bar.
        WindowInsetsControllerCompat(window, window.decorView)
            .isAppearanceLightStatusBars = true
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
