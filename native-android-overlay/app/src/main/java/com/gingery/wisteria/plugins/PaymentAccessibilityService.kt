package com.gingery.wisteria.plugins

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.content.SharedPreferences
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import java.util.regex.Pattern

/**
 * Pure screen-reader fallback for payment flows that DON'T fire a
 * notification — Alipay 零钱 / 当面付, WeChat 扫一扫 + 钱包. Scope is
 * deliberately paranoid:
 *
 *   - Only active when the foreground package is Alipay or WeChat.
 *     Any other foreground → return immediately, read nothing.
 *   - Only walk text nodes; never screenshots, never images, never
 *     uploads anything.
 *   - Looks for the exact moment of "支付成功 / 付款成功" + an adjacent
 *     amount node, captures (amount + timestamp + source), then
 *     immediately drops all node references — no caching of page content.
 *   - Honors the JS-side toggle via SharedPreferences. The default
 *     stored value is false; nothing fires until the user actively
 *     opts in in the in-app settings page AND grants the system-level
 *     accessibility permission.
 *
 * Not registered in the manifest until the user explicitly enables it
 * (see cap-postsync.sh injection — currently inert).
 */
class PaymentAccessibilityService : AccessibilityService() {

    private val amountPattern: Pattern = Pattern.compile(
        "[¥￥]\\s?(\\d+(?:\\.\\d+)?)|(\\d+(?:\\.\\d+)?)\\s?元"
    )
    private val successKeywords = listOf("支付成功", "付款成功")
    private var lastCaptureMs = 0L

    private val prefs: SharedPreferences
        get() = getSharedPreferences("bill_sniffer_access", MODE_PRIVATE)

    override fun onServiceConnected() {
        super.onServiceConnected()
        // The service-info is mostly declared in
        // accessibility_service_config.xml; nothing to do here.
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return

        // P3 toggle gate. If the user has it off in Settings, do nothing.
        if (!prefs.getBoolean("enabled", false)) return

        val pkg = event.packageName?.toString() ?: return
        if (pkg != "com.eg.android.AlipayGphone" && pkg != "com.tencent.mm") {
            return
        }

        if (event.eventType != AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED &&
            event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
        ) return

        val root = rootInActiveWindow ?: return

        // Rate-limit: at most one capture per 5 seconds. Successive WINDOW_
        // CONTENT_CHANGED events while the user lingers on the success page
        // would otherwise spam captures.
        if (System.currentTimeMillis() - lastCaptureMs < 5_000L) return

        try {
            if (!hasSuccessIndicator(root)) return
            val amount = findAmount(root) ?: return
            if (amount <= 0 || amount > 100_000) return

            val source = if (pkg == "com.eg.android.AlipayGphone") "alipay" else "wechat"
            lastCaptureMs = System.currentTimeMillis()

            // Hand off to BillSnifferPlugin via the same broadcast the
            // NotificationListener uses. Single ingestion point on the JS side.
            val broadcast = Intent(BillSnifferService.ACTION_BILL).apply {
                putExtra("amount", amount)
                putExtra("merchant", if (source == "alipay") "支付宝(扫码)" else "微信(扫码)")
                putExtra("source", source)
                putExtra("kind", "expense")
                putExtra("timestamp", lastCaptureMs)
            }
            LocalBroadcastManager.getInstance(applicationContext).sendBroadcast(broadcast)
        } finally {
            // We never retain `root` or any descendant after this method
            // returns — the AccessibilityNodeInfo objects are unowned past
            // the event window.
        }
    }

    override fun onInterrupt() { /* no-op */ }

    private fun hasSuccessIndicator(root: AccessibilityNodeInfo): Boolean {
        // Walk depth-limited. Early-exit on first hit.
        return walkUntil(root, depthLimit = 12) { node ->
            val txt = node.text?.toString() ?: return@walkUntil false
            successKeywords.any { kw -> txt.contains(kw) }
        }
    }

    private fun findAmount(root: AccessibilityNodeInfo): Double? {
        var found: Double? = null
        walkUntil(root, depthLimit = 12) { node ->
            val txt = node.text?.toString() ?: return@walkUntil false
            val m = amountPattern.matcher(txt)
            if (m.find()) {
                val raw = (m.group(1) ?: m.group(2)) ?: return@walkUntil false
                try {
                    val v = raw.toDouble()
                    if (v > 0) {
                        found = v
                        return@walkUntil true
                    }
                } catch (_: Exception) {
                }
            }
            false
        }
        return found
    }

    /** Pre-order traversal capped by depthLimit. Returns true as soon as
     *  predicate matches on any node. */
    private fun walkUntil(
        node: AccessibilityNodeInfo?,
        depthLimit: Int,
        predicate: (AccessibilityNodeInfo) -> Boolean,
    ): Boolean {
        if (node == null || depthLimit < 0) return false
        if (predicate(node)) return true
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            if (walkUntil(child, depthLimit - 1, predicate)) return true
        }
        return false
    }
}
