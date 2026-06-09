package com.gingery.wisteria.plugins;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import androidx.localbroadcastmanager.content.LocalBroadcastManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.List;
import java.util.Set;

/**
 * BillSniffer — drives the BillSnifferService from JS.
 *
 *   isEnabled()       : has the user granted notification-listener access?
 *   openSettings()    : launch the system page where she grants it
 *   getPendingBills() : drain bills captured while the web layer was idle
 *   'billCaptured'    : event fires when a new bill arrives live
 *
 * The web layer (BillReceiver component) drains on mount + listens for
 * the live event so no payment ever falls through the cracks.
 */
@CapacitorPlugin(name = "BillSniffer")
public class BillSnifferPlugin extends Plugin {

    private BroadcastReceiver receiver;

    @Override
    public void load() {
        receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context ctx, Intent intent) {
                if (intent == null) return;
                JSObject bill = new JSObject();
                bill.put("amount", intent.getDoubleExtra("amount", 0));
                bill.put("merchant", intent.getStringExtra("merchant"));
                bill.put("source", intent.getStringExtra("source"));
                bill.put("timestamp", intent.getLongExtra("timestamp", 0));
                notifyListeners("billCaptured", bill);
            }
        };
        LocalBroadcastManager.getInstance(getContext())
            .registerReceiver(receiver, new IntentFilter(BillSnifferService.ACTION_BILL));
    }

    @Override
    protected void handleOnDestroy() {
        if (receiver != null) {
            LocalBroadcastManager.getInstance(getContext()).unregisterReceiver(receiver);
        }
    }

    @PluginMethod
    public void isEnabled(PluginCall call) {
        String pkg = getContext().getPackageName();
        Set<String> enabled =
            NotificationManagerCompat.getEnabledListenerPackages(getContext());
        JSObject r = new JSObject();
        r.put("enabled", enabled.contains(pkg));
        call.resolve(r);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("打不开通知监听设置：" + e.getMessage());
        }
    }

    @PluginMethod
    public void getPendingBills(PluginCall call) {
        List<BillSnifferService.CapturedBill> drained = BillSnifferService.drain();
        JSArray arr = new JSArray();
        for (BillSnifferService.CapturedBill b : drained) {
            JSObject o = new JSObject();
            o.put("amount", b.amount);
            o.put("merchant", b.merchant);
            o.put("source", b.source);
            o.put("timestamp", b.timestamp);
            arr.put(o);
        }
        JSObject r = new JSObject();
        r.put("bills", arr);
        call.resolve(r);
    }
}
