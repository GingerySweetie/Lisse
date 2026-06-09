package com.gingery.wisteria.plugins;

import android.app.Notification;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;
import androidx.localbroadcastmanager.content.LocalBroadcastManager;

import org.json.JSONArray;
import org.json.JSONObject;

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
 * Also persists a small ring buffer of recently observed notifications
 * to SharedPreferences, drained via the plugin's getDebugLog() method —
 * gives the user a way to see what's actually arriving so we can debug
 * filter mismatches without ADB.
 *
 * The user must enable "通知使用权 → Wisteria" in system Settings; until
 * then this service is never bound and no events flow.
 */
public class BillSnifferService extends NotificationListenerService {

    private static final String TAG = "BillSniffer";
    public static final String ACTION_BILL = "com.gingery.wisteria.BILL_CAPTURED";
    private static final String PREFS = "bill_sniffer";
    private static final String KEY_DEBUG_LOG = "debug_log";
    private static final int DEBUG_LOG_MAX = 20;

    // Amount: ¥/￥ before the number, OR "数字 元" after. Permissive.
    private static final Pattern AMOUNT_YUAN_SIGN =
        Pattern.compile("[¥￥]\\s?(\\d+(?:\\.\\d+)?)");
    private static final Pattern AMOUNT_YUAN_WORD =
        Pattern.compile("(\\d+(?:\\.\\d+)?)\\s?元");
    // 给/向/到/付给 + merchant (max 16 chars, stop at common punctuation).
    private static final Pattern MERCHANT_GIVE =
        Pattern.compile("(?:给|向|到|付给)([^,，。 \\n]{1,16})");
    // Income markers — skip these so a 红包 doesn't get logged as an expense.
    // (Could be re-routed to bills.kind='income' later; for now we drop.)
    private static final Pattern INCOME_MARKER =
        Pattern.compile("收到红包|领取红包|退款|转入|收益|到账(?!的)|入账");

    private static final Queue<CapturedBill> PENDING = new LinkedList<>();
    private static final int MAX_PENDING = 64;
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

        // Build body from every reasonable text field. Different apps fill
        // different ones (some use BIG_TEXT, some SUB_TEXT, some INFO_TEXT).
        CharSequence title = extras.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence text = extras.getCharSequence(Notification.EXTRA_TEXT);
        CharSequence bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
        CharSequence subText = extras.getCharSequence(Notification.EXTRA_SUB_TEXT);
        CharSequence infoText = extras.getCharSequence(Notification.EXTRA_INFO_TEXT);
        StringBuilder bodyBuilder = new StringBuilder();
        if (title != null) bodyBuilder.append(title).append(' ');
        if (bigText != null) bodyBuilder.append(bigText).append(' ');
        if (text != null) bodyBuilder.append(text).append(' ');
        if (subText != null) bodyBuilder.append(subText).append(' ');
        if (infoText != null) bodyBuilder.append(infoText).append(' ');
        String body = bodyBuilder.toString();

        logDebug(source, body);

        // Drop incoming-money notifications (red packets / refunds / interest).
        if (INCOME_MARKER.matcher(body).find()) {
            Log.d(TAG, "skip income: " + body);
            return;
        }

        // Find an amount. ¥-prefixed wins over bare "X 元" since it's more
        // unambiguous; either is acceptable.
        Matcher m = AMOUNT_YUAN_SIGN.matcher(body);
        String amountStr = m.find() ? m.group(1) : null;
        if (amountStr == null) {
            Matcher m2 = AMOUNT_YUAN_WORD.matcher(body);
            if (m2.find()) amountStr = m2.group(1);
        }
        if (amountStr == null) {
            Log.d(TAG, "no amount: " + body);
            return;
        }
        double amount;
        try {
            amount = Double.parseDouble(amountStr);
        } catch (Exception e) {
            return;
        }
        if (amount <= 0 || amount > 100_000) {
            Log.d(TAG, "amount out of range: " + amount);
            return;
        }

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
            Log.d(TAG, "dedup: " + amount + " " + merchant);
            return;
        }
        CapturedBill bill = new CapturedBill(amount, merchant, source, now);
        lastCapture = bill;

        synchronized (PENDING) {
            PENDING.add(bill);
            while (PENDING.size() > MAX_PENDING) PENDING.poll();
        }

        Log.d(TAG, "captured: " + source + " ¥" + amount + " " + merchant);

        Intent broadcast = new Intent(ACTION_BILL);
        broadcast.putExtra("amount", amount);
        broadcast.putExtra("merchant", merchant);
        broadcast.putExtra("source", source);
        broadcast.putExtra("timestamp", now);
        LocalBroadcastManager.getInstance(getApplicationContext()).sendBroadcast(broadcast);
    }

    /** Append one line to the persisted debug log so the user can see
     *  what notifications came in. Bounded ring buffer of DEBUG_LOG_MAX. */
    private void logDebug(String source, String body) {
        try {
            SharedPreferences sp = getSharedPreferences(PREFS, MODE_PRIVATE);
            String raw = sp.getString(KEY_DEBUG_LOG, "[]");
            JSONArray arr = new JSONArray(raw);
            JSONObject entry = new JSONObject();
            entry.put("ts", System.currentTimeMillis());
            entry.put("source", source);
            // Truncate body to 200 chars to keep prefs small.
            String trimmed = body.length() > 200 ? body.substring(0, 200) : body;
            entry.put("body", trimmed);
            arr.put(entry);
            while (arr.length() > DEBUG_LOG_MAX) arr.remove(0);
            sp.edit().putString(KEY_DEBUG_LOG, arr.toString()).apply();
        } catch (Exception e) {
            // ignore — debug log failure must not affect capture path.
        }
    }

    public static java.util.List<CapturedBill> drain() {
        java.util.List<CapturedBill> out = new java.util.ArrayList<>();
        synchronized (PENDING) {
            while (!PENDING.isEmpty()) out.add(PENDING.poll());
        }
        return out;
    }
}
