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
import com.gingery.wisteria.plugins.SystemBarsPlugin
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
        registerPlugin(SystemBarsPlugin::class.java)
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

        // Paint BOTH status bar and bottom navigation bar with the same
        // default colour (#F5F0FA — solid equivalent of the header/topbar
        // background) so they visually merge with the app content instead
        // of forming distinct system-chrome bands. The JS SystemBarsPlugin
        // bridge overrides both per route (e.g. dark bedroom themes).
        val defaultColor = Color.parseColor("#F5F0FA")
        @Suppress("DEPRECATION")
        window.statusBarColor = defaultColor
        @Suppress("DEPRECATION")
        window.navigationBarColor = defaultColor
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.isAppearanceLightStatusBars = true
        controller.isAppearanceLightNavigationBars = true
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
