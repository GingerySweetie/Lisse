package com.gingery.wisteria.plugins

import android.graphics.Color
import androidx.core.view.WindowInsetsControllerCompat
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Native bridge for painting the status bar AND bottom navigation bar
 * with the same colour, so each app page can extend its palette all the
 * way to the phone edges without going edge-to-edge (which caused MIUI
 * WindowInsets sync issues).
 *
 * JS API: SystemBars.setColor({ color: '#DCC9EA', dark: true })
 *   color  — hex string, applied to both statusBarColor and
 *            navigationBarColor
 *   dark   — true when the supplied colour is LIGHT (dark icons render
 *            on top). false for dark backgrounds (light icons).
 */
@CapacitorPlugin(name = "SystemBars")
class SystemBarsPlugin : Plugin() {

    @PluginMethod
    fun setColor(call: PluginCall) {
        val color = call.getString("color")
        if (color == null) {
            call.reject("color is required")
            return
        }
        val dark = call.getBoolean("dark", true) ?: true
        val a = activity
        if (a == null) {
            call.reject("no activity")
            return
        }
        a.runOnUiThread {
            try {
                val parsed = Color.parseColor(color)
                @Suppress("DEPRECATION")
                a.window.statusBarColor = parsed
                @Suppress("DEPRECATION")
                a.window.navigationBarColor = parsed
                val controller = WindowInsetsControllerCompat(a.window, a.window.decorView)
                controller.isAppearanceLightStatusBars = dark
                controller.isAppearanceLightNavigationBars = dark
                call.resolve()
            } catch (e: IllegalArgumentException) {
                call.reject("invalid color: $color")
            }
        }
    }
}
