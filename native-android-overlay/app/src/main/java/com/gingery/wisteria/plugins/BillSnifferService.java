package com.gingery.wisteria.plugins;

import android.app.Notification;
import android.content.Intent;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import androidx.localbroadcastmanager.content.LocalBroadcastManager;

import java.util.LinkedList;
import java.util.Queue;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * NotificationListenerService — reads payment notifications from Alipay
 * (com.eg.android.AlipayGphone) and WeChat (com.tencent.mm), pulls out
 * amount + merchant, and either:
 *   - dispatches a local broadcast for BillSnifferPlugin to forward to JS
 *     (when the app is in foreground), or
 *   - queues the capture for getPendingBills() to drain later (cold).
 *
 * The user must enable "通知使用权 → Wisteria" in system Settings; until
 * then this service is never bound and no events flow.
 */
public class BillSnifferService extends NotificationListenerService {

    public static final String ACTION_BILL = "com.gingery.wisteria.BILL_CAPTURED";

    private static final Pattern AMOUNT = Pattern.compile("[¥￥]\\s?(\\d+(?:\\.\\d+)?)");
    // 给/向/到/付给 + merchant (max 16 chars, stop at common punctuation).
    private static final Pattern MERCHANT_GIVE =
        Pattern.compile("(?:给|向|到|付给)([^,，。 \\n]{1,16})");

    /** Static capture queue — drained by BillSnifferPlugin.getPendingBills().
     *  Bounded; if too many bills pile up without the app draining we drop
     *  oldest to keep memory under control. */
    private static final Queue<CapturedBill> PENDING = new LinkedList<>();
    private static final int MAX_PENDING = 64;
    // Dedup window: the same payment can fire 2+ notifications (支付成功
    // + 账单).
    private static final long DEDUP_WINDOW_MS = 5_000L;
    private static CapturedBill lastCapture = null;

    public static class CapturedBill {
        public final double amount;
        public final String merchant;
        public final String source;   // "alipay" or "wechat"
        public final long timestamp;

        public CapturedBill(double amount, String merchant, String source, long ts) {
            this.amount = amount;
            this.merchant = merchant;
            this.source = source;
            this.timestamp = ts;
        }
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null) return;
        String pkg = sbn.getPackageName();
        String source;
        if ("com.eg.android.AlipayGphone".equals(pkg)) source = "alipay";
        else if ("com.tencent.mm".equals(pkg)) source = "wechat";
        else return;

        Notification n = sbn.getNotification();
        if (n == null) return;
        Bundle extras = n.extras;
        if (extras == null) return;

        CharSequence title = extras.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence text = extras.getCharSequence(Notification.EXTRA_TEXT);
        CharSequence bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
        String body =
            ((title != null) ? title.toString() : "")
            + " "
            + ((bigText != null) ? bigText.toString()
               : (text != null) ? text.toString() : "");

        // Only treat as a payment when the body smells like one.
        if (!looksLikePayment(body, source)) return;

        Matcher m = AMOUNT.matcher(body);
        if (!m.find()) return;
        double amount;
        try {
            amount = Double.parseDouble(m.group(1));
        } catch (Exception e) {
            return;
        }
        if (amount <= 0 || amount > 100_000) return;

        String merchant = null;
        Matcher mm = MERCHANT_GIVE.matcher(body);
        if (mm.find()) merchant = mm.group(1).trim();
        if (merchant == null || merchant.isEmpty()) {
            merchant = source.equals("alipay") ? "支付宝" : "微信";
        }

        long now = System.currentTimeMillis();
        if (lastCapture != null
            && now - lastCapture.timestamp < DEDUP_WINDOW_MS
            && Math.abs(lastCapture.amount - amount) < 0.001
            && merchant.equals(lastCapture.merchant)) {
            return;
        }
        CapturedBill bill = new CapturedBill(amount, merchant, source, now);
        lastCapture = bill;

        synchronized (PENDING) {
            PENDING.add(bill);
            while (PENDING.size() > MAX_PENDING) PENDING.poll();
        }

        Intent broadcast = new Intent(ACTION_BILL);
        broadcast.putExtra("amount", amount);
        broadcast.putExtra("merchant", merchant);
        broadcast.putExtra("source", source);
        broadcast.putExtra("timestamp", now);
        LocalBroadcastManager.getInstance(getApplicationContext()).sendBroadcast(broadcast);
    }

    private boolean looksLikePayment(String body, String source) {
        if (body == null || body.isEmpty()) return false;
        // Both apps say "支付" or "付款" or "已支付" in real payment receipts;
        // chat / friend-request notifications never do.
        return body.contains("支付")
            || body.contains("付款")
            || body.contains("已扣")
            || body.contains("消费");
    }

    /** Drain and return the captured queue. Called by the plugin. */
    public static java.util.List<CapturedBill> drain() {
        java.util.List<CapturedBill> out = new java.util.ArrayList<>();
        synchronized (PENDING) {
            while (!PENDING.isEmpty()) out.add(PENDING.poll());
        }
        return out;
    }
}
