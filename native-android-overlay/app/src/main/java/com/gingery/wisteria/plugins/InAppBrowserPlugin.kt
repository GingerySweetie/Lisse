package com.gingery.wisteria.plugins

import android.content.Intent
import android.webkit.CookieManager
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

    /**
     * 读 CookieManager 全局单例里某 URL 的 cookie. CapacitorCookies
     * 在某些 Android / OEM WebView 上跟内置浏览器 Activity 的 jar
     * 不是同一份 (用户在 InAppBrowserActivity 登录拿到的 MUSIC_U 那
     * 边读不到), 这条直通 android.webkit.CookieManager.getInstance()
     * 兜底, 进程级单例无论哪个 WebView 写的都看得到.
     *
     * 返回 cookieString (原 header) + cookies (name → value map),
     * 调用方拿其中的 MUSIC_U 接管登录态。
     */
    @PluginMethod
    fun getCookies(call: PluginCall) {
        val url = call.getString("url") ?: run {
            call.reject("url 不能空")
            return
        }
        try {
            val mgr = CookieManager.getInstance()
            // 强制 flush 一下 — 刚登录的 cookie 偶尔还在内存没落地
            try { mgr.flush() } catch (_: Exception) {}
            val cookieString = mgr.getCookie(url) ?: ""
            val parsed = JSObject()
            if (cookieString.isNotEmpty()) {
                for (kv in cookieString.split(";")) {
                    val eq = kv.indexOf('=')
                    if (eq < 0) continue
                    val k = kv.substring(0, eq).trim()
                    val v = kv.substring(eq + 1).trim()
                    if (k.isNotEmpty()) parsed.put(k, v)
                }
            }
            val ret = JSObject()
            ret.put("cookieString", cookieString)
            ret.put("cookies", parsed)
            call.resolve(ret)
        } catch (e: Exception) {
            call.reject("读 cookie 失败: ${e.message}")
        }
    }
}
