package com.gingery.wisteria

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
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

        // No edge-to-edge. WebView sits between the system bars (default
        // Android behaviour), which eliminates the MIUI WindowInsets sync
        // issues entirely. Status bar + navigation bar are painted with
        // #F5F0FA (light lavender = solid equivalent of header background),
        // and the JS SystemBarsPlugin bridge overrides both per route
        // (e.g. dark bedroom themes).
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
