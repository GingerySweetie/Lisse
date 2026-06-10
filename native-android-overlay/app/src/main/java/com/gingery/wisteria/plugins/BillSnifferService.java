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

import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedList;
import java.util.List;
import java.util.Queue;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * NotificationListenerService — reads payment notifications and surfaces
 * them as captured bills.
 *
 * Three sources:
 *   - alipay:  com.eg.android.AlipayGphone
 *   - wechat:  com.tencent.mm
 *   - bank:    any package listed in BANK_PACKAGES (initially empty;
 *              the user identifies real packages via the debug log
 *              and we add them one-by-one, never guessing)
 *
 * Every notification from EVERY package is now written to the debug
 * ring buffer regardless of whether we can parse it. That's how the
 * user finds 招行's actual package + sample text — open the log,
 * pay once, read out what landed. No more blind regex guessing.
 *
 * Junk filter: payment-looking words inside marketing notifications
 * (红包 / 失效 / 领券 / 优惠 / 立减 / 抢票 / 健康证明) get dropped
 * before we even look for an amount, so "你有4元红包今晚失效" never
 * becomes a phantom ¥4 expense.
 *
 * Direction: 消费/支出/扣款 → expense (default); 收入/转入/退款/到账
 * → income. Default is expense when neither markers found.
 */
public class BillSnifferService extends NotificationListenerService {

    private static final String TAG = "BillSniffer";
    public static final String ACTION_BILL = "com.gingery.wisteria.BILL_CAPTURED";
    private static final String PREFS = "bill_sniffer";
    private static final String KEY_DEBUG_LOG = "debug_log";
    private static final int DEBUG_LOG_MAX = 30;

    // ─── Known packages ──────────────────────────────────────────────
    private static final String PKG_ALIPAY = "com.eg.android.AlipayGphone";
    private static final String PKG_WECHAT = "com.tencent.mm";

    /** Bank packages identified from real-world debug logs. KEEP THIS
     *  EMPTY until the user confirms an actual package name. Adding
     *  speculative ids breaks more than it helps. */
    private static final Set<String> BANK_PACKAGES = new HashSet<>(Arrays.asList(
        // "com.cmbchina.ccd.pluto.cmbActivity",  // 招行 — to verify
    ));

    // ─── Junk filter (P2) ────────────────────────────────────────────
    private static final Pattern JUNK = Pattern.compile(
        "红包|失效|领券|优惠|立减|抢票|健康证明|" +
        "邀请|领取|抽奖|中奖|福利|活动通知|签到"
    );

    // ─── Amount patterns (cover Alipay/WeChat + bank formats) ────────
    // Alipay/WeChat: ¥36.00, ￥36, 5.00 元
    private static final Pattern AMOUNT_YUAN_SIGN =
        Pattern.compile("[¥￥]\\s?(\\d+(?:\\.\\d+)?)");
    private static final Pattern AMOUNT_YUAN_WORD =
        Pattern.compile("(\\d+(?:\\.\\d+)?)\\s?元");
    // Bank: 消费人民币36.00元 / 支出36.00元 / 扣款人民币¥36 / 交易金额36.00
    private static final Pattern AMOUNT_BANK = Pattern.compile(
        "(?:消费|支出|扣款|交易金额|付款|转账金额|交易).{0,12}?" +
        "(?:人民币|RMB|CNY)?\\s?[¥￥]?\\s?(\\d+(?:\\.\\d+)?)\\s?元?"
    );

    // ─── Direction markers ───────────────────────────────────────────
    private static final Pattern EXPENSE_MARKER =
        Pattern.compile("消费|支出|扣款|付款|已付|已扣");
    private static final Pattern INCOME_MARKER =
        Pattern.compile("收入|转入|退款|入账|到账|收款");

    // 给/向/到/付给/收款方 + merchant (max 16 chars, stops at punctuation).
    private static final Pattern MERCHANT_GIVE = Pattern.compile(
        "(?:给|向|到|付给|收款方|商户|交易商户)[：: ]?([^,，。 \\n]{1,16})"
    );

    private static final Queue<CapturedBill> PENDING = new LinkedList<>();
    private static final int MAX_PENDING = 64;
    private static final long DEDUP_WINDOW_MS = 5_000L;
    private static CapturedBill lastCapture = null;

    public static class CapturedBill {
        public final double amount;
        public final String merchant;
        public final String source;   // "alipay" | "wechat" | "bank"
        public final String kind;     // "expense" | "income"
        public final long timestamp;

        public CapturedBill(
            double amount, String merchant, String source, String kind, long ts
        ) {
            this.amount = amount;
            this.merchant = merchant;
            this.source = source;
            this.kind = kind;
            this.timestamp = ts;
        }
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null) return;
        String pkg = sbn.getPackageName();
        if (pkg == null) return;

        Notification n = sbn.getNotification();
        if (n == null) return;
        Bundle extras = n.extras;
        if (extras == null) return;

        // Build body from every reasonable text field.
        CharSequence title = extras.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence text = extras.getCharSequence(Notification.EXTRA_TEXT);
        CharSequence bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
        CharSequence subText = extras.getCharSequence(Notification.EXTRA_SUB_TEXT);
        CharSequence infoText = extras.getCharSequence(Notification.EXTRA_INFO_TEXT);
        StringBuilder bb = new StringBuilder();
        if (title != null) bb.append(title).append(' ');
        if (bigText != null) bb.append(bigText).append(' ');
        if (text != null) bb.append(text).append(' ');
        if (subText != null) bb.append(subText).append(' ');
        if (infoText != null) bb.append(infoText).append(' ');
        String body = bb.toString();

        // Always log — this is how the user discovers the real bank
        // package name and the real notification text.
        logDebug(pkg, body);

        // Resolve source. Unknown packages → don't try to parse anything.
        // The debug log entry above is the takeaway.
        String source = resolveSource(pkg);
        if (source == null) return;

        // Junk filter — applies to every source so a fake "红包" alert from
        // any app can't become a bill.
        if (JUNK.matcher(body).find()) {
            Log.d(TAG, "skip junk: " + body);
            return;
        }

        // Amount extraction. Try ¥-prefix first (most unambiguous), then
        // bare "X元", then bank-style "消费/支出X元".
        String amountStr = findFirstGroup(body, AMOUNT_YUAN_SIGN);
        if (amountStr == null) amountStr = findFirstGroup(body, AMOUNT_YUAN_WORD);
        if (amountStr == null) amountStr = findFirstGroup(body, AMOUNT_BANK);
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

        // Direction. EXPENSE wins ties (most payment receipts don't say
        // "income" explicitly and we default to expense anyway).
        String kind = "expense";
        if (INCOME_MARKER.matcher(body).find()
            && !EXPENSE_MARKER.matcher(body).find()) {
            kind = "income";
        }

        // Merchant.
        String merchant = null;
        Matcher mm = MERCHANT_GIVE.matcher(body);
        if (mm.find()) merchant = mm.group(1).trim();
        if (merchant == null || merchant.isEmpty()) {
            switch (source) {
                case "alipay": merchant = "支付宝"; break;
                case "wechat": merchant = "微信"; break;
                case "bank":   merchant = "银行卡"; break;
                default:       merchant = source;
            }
        }

        long now = System.currentTimeMillis();
        if (lastCapture != null
            && now - lastCapture.timestamp < DEDUP_WINDOW_MS
            && Math.abs(lastCapture.amount - amount) < 0.001
            && merchant.equals(lastCapture.merchant)) {
            Log.d(TAG, "dedup: " + amount + " " + merchant);
            return;
        }
        CapturedBill bill = new CapturedBill(amount, merchant, source, kind, now);
        lastCapture = bill;

        synchronized (PENDING) {
            PENDING.add(bill);
            while (PENDING.size() > MAX_PENDING) PENDING.poll();
        }

        Log.d(TAG, "captured: " + source + " " + kind + " ¥" + amount + " " + merchant);

        Intent broadcast = new Intent(ACTION_BILL);
        broadcast.putExtra("amount", amount);
        broadcast.putExtra("merchant", merchant);
        broadcast.putExtra("source", source);
        broadcast.putExtra("kind", kind);
        broadcast.putExtra("timestamp", now);
        LocalBroadcastManager.getInstance(getApplicationContext()).sendBroadcast(broadcast);
    }

    /** Returns "alipay" | "wechat" | "bank" | null. */
    private String resolveSource(String pkg) {
        if (PKG_ALIPAY.equals(pkg)) return "alipay";
        if (PKG_WECHAT.equals(pkg)) return "wechat";
        if (BANK_PACKAGES.contains(pkg)) return "bank";
        return null;
    }

    private String findFirstGroup(String haystack, Pattern p) {
        Matcher m = p.matcher(haystack);
        return m.find() ? m.group(1) : null;
    }

    /** Append a line to the persisted debug log. Bounded ring buffer of
     *  DEBUG_LOG_MAX so prefs don't grow without bound. */
    private void logDebug(String pkg, String body) {
        try {
            SharedPreferences sp = getSharedPreferences(PREFS, MODE_PRIVATE);
            String raw = sp.getString(KEY_DEBUG_LOG, "[]");
            JSONArray arr = new JSONArray(raw);
            JSONObject entry = new JSONObject();
            entry.put("ts", System.currentTimeMillis());
            entry.put("pkg", pkg);
            // For backward-compat with the existing UI that reads "source".
            String src = resolveSource(pkg);
            entry.put("source", src == null ? pkg : src);
            String trimmed = body.length() > 240 ? body.substring(0, 240) : body;
            entry.put("body", trimmed);
            arr.put(entry);
            while (arr.length() > DEBUG_LOG_MAX) arr.remove(0);
            sp.edit().putString(KEY_DEBUG_LOG, arr.toString()).apply();
        } catch (Exception e) {
            // ignore — debug failure must not affect capture path
        }
    }

    public static List<CapturedBill> drain() {
        List<CapturedBill> out = new java.util.ArrayList<>();
        synchronized (PENDING) {
            while (!PENDING.isEmpty()) out.add(PENDING.poll());
        }
        return out;
    }
}
