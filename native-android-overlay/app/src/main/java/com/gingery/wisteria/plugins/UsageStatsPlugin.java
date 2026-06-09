package com.gingery.wisteria.plugins;

import android.app.AppOpsManager;
import android.app.usage.UsageStats;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.os.Process;
import android.provider.Settings;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.util.Calendar;
import java.util.List;

/**
 * UsageStatsPlugin — wraps Android's UsageStatsManager.queryUsageStats.
 *
 * PACKAGE_USAGE_STATS is a "special access" permission; manifest
 * declaration alone is not enough. The user must enable it via
 * Settings → Special app access → Usage access → Wisteria.
 *
 * Methods:
 *   hasPermission()   — is GET_USAGE_STATS granted via AppOps?
 *   openSettings()    — launch the system Usage Access settings
 *   getTodayUsage()   — return foreground time per app for today
 */
@CapacitorPlugin(name = "UsageStats")
public class UsageStatsPlugin extends Plugin {

    @PluginMethod
    public void hasPermission(PluginCall call) {
        AppOpsManager appOps = (AppOpsManager) getContext().getSystemService(Context.APP_OPS_SERVICE);
        boolean granted = false;
        if (appOps != null) {
            int mode = appOps.unsafeCheckOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                getContext().getPackageName()
            );
            granted = (mode == AppOpsManager.MODE_ALLOWED);
        }
        JSObject r = new JSObject();
        r.put("granted", granted);
        call.resolve(r);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("打不开用量访问设置：" + e.getMessage());
        }
    }

    @PluginMethod
    public void getTodayUsage(PluginCall call) {
        UsageStatsManager m = (UsageStatsManager)
            getContext().getSystemService(Context.USAGE_STATS_SERVICE);
        if (m == null) {
            call.reject("UsageStatsManager 不可用");
            return;
        }
        Calendar c = Calendar.getInstance();
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        long startOfDay = c.getTimeInMillis();
        long now = System.currentTimeMillis();

        List<UsageStats> stats;
        try {
            stats = m.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, startOfDay, now);
        } catch (Exception e) {
            call.reject("queryUsageStats 失败：" + e.getMessage());
            return;
        }

        PackageManager pm = getContext().getPackageManager();
        String ownPkg = getContext().getPackageName();

        JSArray arr = new JSArray();
        if (stats != null) {
            for (UsageStats s : stats) {
                if (s == null) continue;
                long fg = s.getTotalTimeInForeground();
                if (fg <= 0) continue;
                String pkg = s.getPackageName();
                if (pkg == null) continue;
                if (pkg.equals(ownPkg)) continue; // skip self
                JSObject o = new JSObject();
                o.put("packageName", pkg);
                o.put("foregroundMs", fg);
                o.put("lastTimeUsed", s.getLastTimeUsed());

                String appName = pkg;
                String iconBase64 = null;
                try {
                    ApplicationInfo ai = pm.getApplicationInfo(pkg, 0);
                    appName = pm.getApplicationLabel(ai).toString();
                    Drawable icon = pm.getApplicationIcon(ai);
                    iconBase64 = drawableToBase64(icon);
                } catch (Exception ignored) {
                    // pkg might be a system fragment without metadata
                }
                o.put("appName", appName);
                if (iconBase64 != null) o.put("iconPng", iconBase64);
                arr.put(o);
            }
        }
        JSObject ret = new JSObject();
        ret.put("usage", arr);
        call.resolve(ret);
    }

    /** Render the app icon to a small PNG so the WebView can show it
     *  inline. Capped at 72×72 to keep payload modest. */
    private String drawableToBase64(Drawable drawable) {
        try {
            int w = Math.min(72, Math.max(24, drawable.getIntrinsicWidth()));
            int h = Math.min(72, Math.max(24, drawable.getIntrinsicHeight()));
            Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(bmp);
            drawable.setBounds(0, 0, w, h);
            drawable.draw(canvas);
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            bmp.compress(Bitmap.CompressFormat.PNG, 100, baos);
            return Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP);
        } catch (Exception e) {
            return null;
        }
    }
}
