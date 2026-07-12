package com.gingery.wisteria

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
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
        registerPlugin(StepCounterPlugin::class.java)
        registerPlugin(UsageStatsPlugin::class.java)
        registerPlugin(SleepEstimatePlugin::class.java)
        registerPlugin(ShareIntentPlugin::class.java)
        registerPlugin(BillSnifferPlugin::class.java)
        registerPlugin(AccessibilityCapturePlugin::class.java)
        registerPlugin(InAppBrowserPlugin::class.java)
        super.onCreate(savedInstanceState)

        // The WebView does NOT extend behind the status bar (default
        // fitsSystemWindows = true).  The status bar gets its own fixed space
        // and we colour it to match the app palette.
        //
        // This completely eliminates the MIUI edge-to-edge / safe-area inset
        // reset issue: env(safe-area-inset-top) is always 0 in this mode, the
        // WebView starts cleanly below the status bar, no JS patching needed.
        //
        // The JS layer (@capacitor/status-bar) will override this colour
        // per-page (e.g. dark themes in the bedroom section).
        @Suppress("DEPRECATION")
        window.statusBarColor = Color.parseColor("#F4ECF6") // app primary lavender

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
