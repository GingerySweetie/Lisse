package com.gingery.wisteria.plugins

import android.content.Context
import android.content.Intent
import android.provider.Settings
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Surface for the PaymentAccessibilityService — checks system enablement
 * + opens system Settings + flips the in-app toggle (mirrored to the
 * service's SharedPreferences).
 *
 * The service itself stays inert unless BOTH:
 *   - The user enabled "辅助功能 → Wisteria 支付识别" in system Settings
 *   - setEnabled(true) was called from JS
 */
@CapacitorPlugin(name = "AccessibilityCapture")
class AccessibilityCapturePlugin : Plugin() {

    private val prefs
        get() = context.getSharedPreferences("bill_sniffer_access", Context.MODE_PRIVATE)

    @PluginMethod
    fun isEnabledInSystem(call: PluginCall) {
        val enabled = isAccessibilityServiceEnabled()
        val r = JSObject()
        r.put("enabled", enabled)
        call.resolve(r)
    }

    @PluginMethod
    fun openAccessibilitySettings(call: PluginCall) {
        try {
            val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            call.resolve()
        } catch (e: Exception) {
            call.reject("打不开辅助功能设置：${e.message}")
        }
    }

    @PluginMethod
    fun setEnabled(call: PluginCall) {
        val on = call.getBoolean("enabled") ?: false
        prefs.edit().putBoolean("enabled", on).apply()
        call.resolve()
    }

    @PluginMethod
    fun getEnabled(call: PluginCall) {
        val r = JSObject()
        r.put("enabled", prefs.getBoolean("enabled", false))
        call.resolve(r)
    }

    private fun isAccessibilityServiceEnabled(): Boolean {
        val serviceId =
            "${context.packageName}/com.gingery.wisteria.plugins.PaymentAccessibilityService"
        val enabledServices = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
        ) ?: return false
        return enabledServices
            .split(":")
            .any { it.equals(serviceId, ignoreCase = true) }
    }
}
