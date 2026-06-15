package com.gingery.wisteria.plugins

import android.content.Intent
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Launches the in-app browser activity. All state — URL, UA override,
 * auto-inject rules, saved bookmarklets — is passed through intent
 * extras, so the activity doesn't need to reach back into the Capacitor
 * bridge or Dexie. The page selecting "open" should already have
 * looked up the relevant data on the JS side.
 *
 * The activity is declared singleTask in the manifest, so calling open()
 * again while it's running just routes the new URL into the existing
 * WebView — preserves cookies, scroll position, and (importantly) any
 * websocket / SSE connections the page has.
 */
@CapacitorPlugin(name = "InAppBrowser")
class InAppBrowserPlugin : Plugin() {

    @PluginMethod
    fun open(call: PluginCall) {
        val url = call.getString("url") ?: run {
            call.reject("url 不能空")
            return
        }
        val ua = call.getString("userAgent")
        val autoInjects = call.getArray("autoInjects")?.toString() ?: "[]"
        val savedScripts = call.getArray("savedScripts")?.toString() ?: "[]"

        val intent = Intent(context, InAppBrowserActivity::class.java).apply {
            putExtra("url", url)
            if (!ua.isNullOrEmpty()) putExtra("ua", ua)
            putExtra("autoInjects", autoInjects)
            putExtra("savedScripts", savedScripts)
            // singleTask is declared in the manifest; FLAG_ACTIVITY_NEW_TASK
            // is required when launching from a non-Activity Context.
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        try {
            context.startActivity(intent)
            val ret = JSObject()
            ret.put("ok", true)
            call.resolve(ret)
        } catch (e: Exception) {
            call.reject("打不开浏览器: ${e.message}")
        }
    }
}
