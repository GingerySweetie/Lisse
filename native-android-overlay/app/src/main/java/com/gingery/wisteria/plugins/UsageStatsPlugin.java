package com.gingery.wisteria.plugins;

import android.app.AppOpsManager;
import android.app.usage.UsageEvents;
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
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * UsageStatsPlugin — wraps Android's UsageStatsManager.
 *
 * Methods:
 *   hasPermission()         — is GET_USAGE_STATS granted?
 *   openSettings()          — launch Usage Access settings
 *   getTodayUsage()         — foreground time per app today
 *   getWeekUsage()          — total foreground per day for last 7 days
 *   getHourlyDistribution() — 24-element array of today's per-hour ms
 *   getUnlocks()            — keyguard unlock count + first-unlock time
 *
 * Android 11+ package visibility requires QUERY_ALL_PACKAGES (or a
 * <queries> block) for getApplicationInfo() to succeed against arbitrary
 * packages — without it most app names fall back to the raw package
 * string. cap-postsync.sh injects both.
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
        long[] range = todayRange();
        List<UsageStats> stats;
        try {
            stats = m.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, range[0], range[1]);
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
                if (pkg.equals(ownPkg)) continue;
                JSObject o = new JSObject();
                o.put("packageName", pkg);
                o.put("foregroundMs", fg);
                o.put("lastTimeUsed", s.getLastTimeUsed());

                String appName = pkg;
                String iconBase64 = null;
                try {
                    ApplicationInfo ai = pm.getApplicationInfo(pkg, 0);
                    CharSequence label = pm.getApplicationLabel(ai);
                    if (label != null && label.length() > 0) {
                        appName = label.toString();
                    }
                    Drawable icon = pm.getApplicationIcon(ai);
                    iconBase64 = drawableToBase64(icon);
                } catch (Exception ignored) {
                    // package visibility restriction or uninstalled
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

    @PluginMethod
    public void getWeekUsage(PluginCall call) {
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
        c.add(Calendar.DAY_OF_YEAR, -6);
        long startWeek = c.getTimeInMillis();
        long now = System.currentTimeMillis();

        Map<String, Long> totalByDate = new HashMap<>();
        String ownPkg = getContext().getPackageName();
        SimpleDateFormat fmt = new SimpleDateFormat("yyyy-MM-dd", Locale.US);

        try {
            List<UsageStats> stats = m.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, startWeek, now);
            if (stats != null) {
                for (UsageStats s : stats) {
                    if (s == null || s.getPackageName() == null) continue;
                    if (s.getPackageName().equals(ownPkg)) continue;
                    long fg = s.getTotalTimeInForeground();
                    if (fg <= 0) continue;
                    String date = fmt.format(new Date(s.getFirstTimeStamp()));
                    Long prev = totalByDate.get(date);
                    totalByDate.put(date, (prev == null ? 0L : prev) + fg);
                }
            }
        } catch (Exception e) {
            call.reject("queryUsageStats 失败：" + e.getMessage());
            return;
        }

        JSArray days = new JSArray();
        Calendar iter = (Calendar) c.clone();
        for (int i = 0; i < 7; i++) {
            String date = fmt.format(iter.getTime());
            JSObject day = new JSObject();
            day.put("date", date);
            Long t = totalByDate.get(date);
            day.put("totalMs", t == null ? 0L : t);
            days.put(day);
            iter.add(Calendar.DAY_OF_YEAR, 1);
        }
        JSObject ret = new JSObject();
        ret.put("days", days);
        call.resolve(ret);
    }

    @PluginMethod
    public void getHourlyDistribution(PluginCall call) {
        UsageStatsManager m = (UsageStatsManager)
            getContext().getSystemService(Context.USAGE_STATS_SERVICE);
        if (m == null) {
            call.reject("UsageStatsManager 不可用");
            return;
        }
        long[] range = todayRange();
        long startOfDay = range[0];

        long[] buckets = new long[24];
        String ownPkg = getContext().getPackageName();

        // Reconstruct hourly distribution from UsageEvents — far more
        // accurate than INTERVAL_HOURLY (which only retains short windows).
        // Track each foreground session and split it across hour boundaries.
        try {
            UsageEvents events = m.queryEvents(startOfDay, range[1]);
            UsageEvents.Event ev = new UsageEvents.Event();
            Map<String, Long> foregroundSince = new HashMap<>();
            while (events.hasNextEvent()) {
                events.getNextEvent(ev);
                String pkg = ev.getPackageName();
                if (pkg == null || pkg.equals(ownPkg)) continue;
                int type = ev.getEventType();
                if (type == UsageEvents.Event.MOVE_TO_FOREGROUND) {
                    foregroundSince.put(pkg, ev.getTimeStamp());
                } else if (type == UsageEvents.Event.MOVE_TO_BACKGROUND) {
                    Long start = foregroundSince.remove(pkg);
                    if (start != null) {
                        distributeSpan(buckets, start, ev.getTimeStamp(), startOfDay);
                    }
                }
            }
            // Apps still in foreground at query time get split up to now.
            long now = System.currentTimeMillis();
            for (Long start : foregroundSince.values()) {
                if (start != null) distributeSpan(buckets, start, now, startOfDay);
            }
        } catch (Exception e) {
            call.reject("queryEvents 失败：" + e.getMessage());
            return;
        }

        JSArray hours = new JSArray();
        for (int i = 0; i < 24; i++) hours.put(buckets[i]);
        JSObject ret = new JSObject();
        ret.put("hours", hours);
        call.resolve(ret);
    }

    private void distributeSpan(long[] buckets, long start, long end, long startOfDay) {
        if (end <= start) return;
        if (end <= startOfDay) return;
        if (start < startOfDay) start = startOfDay;
        // Walk hour boundaries from start to end.
        long cursor = start;
        while (cursor < end) {
            Calendar c = Calendar.getInstance();
            c.setTimeInMillis(cursor);
            int hour = c.get(Calendar.HOUR_OF_DAY);
            c.set(Calendar.MINUTE, 0);
            c.set(Calendar.SECOND, 0);
            c.set(Calendar.MILLISECOND, 0);
            c.add(Calendar.HOUR_OF_DAY, 1);
            long nextHour = c.getTimeInMillis();
            long slice = Math.min(nextHour, end) - cursor;
            if (hour >= 0 && hour < 24 && slice > 0) {
                buckets[hour] += slice;
            }
            cursor = nextHour;
        }
    }

    @PluginMethod
    public void getUnlocks(PluginCall call) {
        UsageStatsManager m = (UsageStatsManager)
            getContext().getSystemService(Context.USAGE_STATS_SERVICE);
        if (m == null) {
            call.reject("UsageStatsManager 不可用");
            return;
        }
        long[] range = todayRange();

        int count = 0;
        long firstAt = -1;
        try {
            UsageEvents events = m.queryEvents(range[0], range[1]);
            UsageEvents.Event ev = new UsageEvents.Event();
            // KEYGUARD_HIDDEN = 18, added in API 28. Use the literal so
            // we still compile on older targets (min is API 26).
            final int KEYGUARD_HIDDEN = 18;
            while (events.hasNextEvent()) {
                events.getNextEvent(ev);
                if (ev.getEventType() == KEYGUARD_HIDDEN) {
                    count++;
                    if (firstAt < 0) firstAt = ev.getTimeStamp();
                }
            }
        } catch (Exception ignored) {
            // queryEvents may throw on some OEMs / older APIs.
        }

        JSObject ret = new JSObject();
        ret.put("count", count);
        if (firstAt > 0) {
            Calendar fc = Calendar.getInstance();
            fc.setTimeInMillis(firstAt);
            ret.put("firstAt", String.format(
                Locale.US, "%02d:%02d",
                fc.get(Calendar.HOUR_OF_DAY), fc.get(Calendar.MINUTE)
            ));
        } else {
            ret.put("firstAt", JSObject.NULL);
        }
        call.resolve(ret);
    }

    private long[] todayRange() {
        Calendar c = Calendar.getInstance();
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        return new long[]{ c.getTimeInMillis(), System.currentTimeMillis() };
    }

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
