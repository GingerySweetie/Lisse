#!/usr/bin/env bash
# Post-sync overlay: after `npx cap sync android` regenerates the
# native scaffold, inject our custom Kotlin + Java plugins, our
# MainActivity (registering the plugins), manifest permissions +
# intent filters, gradle Kotlin support, and a stable debug keystore
# so successive APK installs upgrade in place.
#
# Lives outside the gitignored /android/ tree so the source of truth
# survives CI runs. Idempotent — re-running this on an already
# patched android/ is safe.
set -euo pipefail

ANDROID_DIR="$(pwd)/android"
OVERLAY_DIR="$(pwd)/native-android-overlay"

if [ ! -d "$ANDROID_DIR" ]; then
  echo "[postsync] android/ missing — run 'npx cap sync android' first" >&2
  exit 1
fi

# 1. Copy overlay sources (Kotlin + Java) into the generated app module.
#    Overwrites the boilerplate MainActivity that Capacitor 8 generates
#    (the boilerplate doesn't register our plugins). Capacitor 8 may
#    generate MainActivity.java; we replace it with the Kotlin version.
echo "[postsync] copying overlay sources"
# Wipe any pre-existing MainActivity from Capacitor scaffolding so a
# stray .java doesn't clash with our .kt.
rm -f "$ANDROID_DIR/app/src/main/java/com/gingery/wisteria/MainActivity.java" \
      "$ANDROID_DIR/app/src/main/java/com/gingery/wisteria/MainActivity.kt" \
      "$ANDROID_DIR/app/src/main/java/com/gingery/wisteria/plugins/"*.java \
      "$ANDROID_DIR/app/src/main/java/com/gingery/wisteria/plugins/"*.kt 2>/dev/null || true
cp -r "$OVERLAY_DIR/app/src/main/java/." "$ANDROID_DIR/app/src/main/java/"

# 1b. Copy overlay res/ — custom adaptive icon (wisteria mark) and
#     splash drawable replace Capacitor's stock assets.
if [ -d "$OVERLAY_DIR/app/src/main/res" ]; then
  echo "[postsync] copying overlay res (icons, splash)"
  cp -r "$OVERLAY_DIR/app/src/main/res/." "$ANDROID_DIR/app/src/main/res/"
  # @capacitor/splash-screen ships a stock drawable/splash.png. Our
  # overlay provides splash.xml with the same resource name → gradle's
  # resource merger fails with "Duplicate resources". Drop the PNG so
  # our XML wins.
  find "$ANDROID_DIR/app/src/main/res" -type f -name 'splash.png' -delete || true
  # Capacitor 8 scaffolds .webp launcher icons in every mipmap-*. Our
  # overlay drops .png at the same resource names — gradle then sees
  # "ic_launcher.webp" + "ic_launcher.png" in the same folder and
  # bails with "Duplicate resources". Sweep the webp originals out
  # after the cp so our PNGs win.
  find "$ANDROID_DIR/app/src/main/res" -type d -name 'mipmap-*' \
    -not -name 'mipmap-anydpi-*' | while read -r d; do
    rm -f "$d/ic_launcher.webp" "$d/ic_launcher_round.webp" \
          "$d/ic_launcher_foreground.webp" 2>/dev/null || true
  done
fi

# 2. Patch AndroidManifest.xml:
#    - ACTIVITY_RECOGNITION (step counter sensor)
#    - PACKAGE_USAGE_STATS (special access, granted via Settings)
#    - QUERY_ALL_PACKAGES (so app labels resolve on Android 11+)
#    - Share intent filter on MainActivity for SEND + SEND_MULTIPLE
#    - BillSnifferService registration
MANIFEST="$ANDROID_DIR/app/src/main/AndroidManifest.xml"
ensure_tools_ns() {
  if ! grep -q 'xmlns:tools=' "$MANIFEST"; then
    sed -i.bak \
      's|<manifest |<manifest xmlns:tools="http://schemas.android.com/tools" |' \
      "$MANIFEST"
    rm -f "$MANIFEST.bak"
  fi
}
if ! grep -q 'android.permission.ACTIVITY_RECOGNITION' "$MANIFEST"; then
  echo "[postsync] adding ACTIVITY_RECOGNITION permission"
  sed -i.bak \
    's|<application|<uses-permission android:name="android.permission.ACTIVITY_RECOGNITION" />\n    <application|' \
    "$MANIFEST"
  rm -f "$MANIFEST.bak"
fi
if ! grep -q 'android.permission.PACKAGE_USAGE_STATS' "$MANIFEST"; then
  echo "[postsync] adding PACKAGE_USAGE_STATS permission"
  ensure_tools_ns
  sed -i.bak \
    's|<application|<uses-permission android:name="android.permission.PACKAGE_USAGE_STATS" tools:ignore="ProtectedPermissions" />\n    <application|' \
    "$MANIFEST"
  rm -f "$MANIFEST.bak"
fi
if ! grep -q 'android.permission.QUERY_ALL_PACKAGES' "$MANIFEST"; then
  echo "[postsync] adding QUERY_ALL_PACKAGES permission"
  ensure_tools_ns
  sed -i.bak \
    's|<application|<uses-permission android:name="android.permission.QUERY_ALL_PACKAGES" tools:ignore="QueryAllPackagesPermission" />\n    <application|' \
    "$MANIFEST"
  rm -f "$MANIFEST.bak"
fi

# Inject share intent-filter + BillSnifferService registration via Python.
python3 - "$MANIFEST" << 'PY'
import sys, re
p = sys.argv[1]
src = open(p).read()

share_filter = """            <intent-filter>
                <action android:name="android.intent.action.SEND" />
                <action android:name="android.intent.action.SEND_MULTIPLE" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="text/plain" />
                <data android:mimeType="application/epub+zip" />
                <data android:mimeType="application/zip" />
                <data android:mimeType="application/octet-stream" />
            </intent-filter>
"""
if "android.intent.action.SEND" not in src:
    src = re.sub(
        r'(<activity\b[^>]*MainActivity[^>]*>)(.*?)(</activity>)',
        lambda m: m.group(1) + m.group(2) + share_filter + m.group(3),
        src,
        count=1,
        flags=re.DOTALL,
    )

sniffer_service = """        <service
            android:name="com.gingery.wisteria.plugins.BillSnifferService"
            android:label="Wisteria 账单识别"
            android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE"
            android:exported="true">
            <intent-filter>
                <action android:name="android.service.notification.NotificationListenerService" />
            </intent-filter>
        </service>
"""
if "BillSnifferService" not in src:
    src = re.sub(r'(\s*</application>)', '\n' + sniffer_service + r'\1', src, count=1)

# PaymentAccessibilityService registration. The service is declared so it
# can be bound, but it stays inert until the user (a) turns on the in-app
# toggle and (b) flips the system-level accessibility switch. Default OFF.
access_service = """        <service
            android:name="com.gingery.wisteria.plugins.PaymentAccessibilityService"
            android:label="Wisteria 支付识别"
            android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE"
            android:exported="true">
            <intent-filter>
                <action android:name="android.accessibilityservice.AccessibilityService" />
            </intent-filter>
            <meta-data
                android:name="android.accessibilityservice"
                android:resource="@xml/payment_accessibility_config" />
        </service>
"""
if "PaymentAccessibilityService" not in src:
    src = re.sub(r'(\s*</application>)', '\n' + access_service + r'\1', src, count=1)

# InAppBrowserActivity registration. singleTask so switching out of the
# app and back doesn't recreate the WebView (preserves cookies + any
# WebSocket / SSE connection the page has open).
browser_activity = """        <activity
            android:name="com.gingery.wisteria.plugins.InAppBrowserActivity"
            android:launchMode="singleTask"
            android:exported="false"
            android:hardwareAccelerated="true"
            android:configChanges="orientation|screenSize|keyboardHidden" />
"""
if "InAppBrowserActivity" not in src:
    src = re.sub(r'(\s*</application>)', '\n' + browser_activity + r'\1', src, count=1)

open(p, 'w').write(src)
PY

# 3. Configure Kotlin support in app/build.gradle.
APP_GRADLE="$ANDROID_DIR/app/build.gradle"
if [ -f "$APP_GRADLE" ]; then
  python3 - "$APP_GRADLE" << 'PY'
import sys, re
p = sys.argv[1]
src = open(p).read()

if "kotlin-android" not in src:
    src = re.sub(
        r"(apply plugin: 'com\.android\.application')",
        r"\1\napply plugin: 'kotlin-android'",
        src,
        count=1,
    )

# Kotlin stdlib + localbroadcastmanager (used by BillSnifferPlugin).
kotlin_block = """    implementation 'org.jetbrains.kotlin:kotlin-stdlib:1.9.24'
    implementation 'androidx.localbroadcastmanager:localbroadcastmanager:1.1.0'
"""
if "kotlin-stdlib" not in src:
    src = re.sub(
        r"(dependencies\s*\{\s*\n)",
        r"\1" + kotlin_block,
        src,
        count=1,
    )

open(p, 'w').write(src)
PY
fi

# 3b. Project-level build.gradle: add Kotlin gradle plugin classpath.
PROJECT_GRADLE="$ANDROID_DIR/build.gradle"
if [ -f "$PROJECT_GRADLE" ]; then
  python3 - "$PROJECT_GRADLE" << 'PY'
import sys, re
p = sys.argv[1]
src = open(p).read()
if "kotlin-gradle-plugin" not in src:
    src = re.sub(
        r"(classpath 'com\.android\.tools\.build:gradle[^']*')",
        r"\1\n        classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.24'",
        src,
        count=1,
    )
    open(p, 'w').write(src)
PY
fi

# 4. Install the stable debug keystore so successive APK installs are
#    upgrades (data preserved) rather than fresh installs (IndexedDB
#    wipe).
KEYSTORE_SRC="$OVERLAY_DIR/wisteria-debug.keystore"
if [ -f "$KEYSTORE_SRC" ]; then
  echo "[postsync] installing stable debug keystore"
  cp "$KEYSTORE_SRC" "$ANDROID_DIR/app/wisteria-debug.keystore"

  if [ -f "$APP_GRADLE" ] && ! grep -q 'wisteria-debug.keystore' "$APP_GRADLE"; then
    python3 - "$APP_GRADLE" << 'PY'
import sys, re
p = sys.argv[1]
src = open(p).read()
patch = """
    signingConfigs {
        debug {
            storeFile file('wisteria-debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
"""
out = re.sub(r'(android\s*\{\s*\n)', r'\1' + patch, src, count=1)
open(p, 'w').write(out)
PY
  fi
fi

# 5. Sanity check — fail loud if a plugin or MainActivity didn't land.
EXPECTED=(
  "$ANDROID_DIR/app/src/main/java/com/gingery/wisteria/MainActivity.kt"
  "$ANDROID_DIR/app/src/main/java/com/gingery/wisteria/plugins/StepCounterPlugin.kt"
  "$ANDROID_DIR/app/src/main/java/com/gingery/wisteria/plugins/UsageStatsPlugin.kt"
  "$ANDROID_DIR/app/src/main/java/com/gingery/wisteria/plugins/SleepEstimatePlugin.kt"
  "$ANDROID_DIR/app/src/main/java/com/gingery/wisteria/plugins/ShareIntentPlugin.java"
  "$ANDROID_DIR/app/src/main/java/com/gingery/wisteria/plugins/BillSnifferPlugin.java"
  "$ANDROID_DIR/app/src/main/java/com/gingery/wisteria/plugins/BillSnifferService.java"
  "$ANDROID_DIR/app/src/main/java/com/gingery/wisteria/plugins/AccessibilityCapturePlugin.kt"
  "$ANDROID_DIR/app/src/main/java/com/gingery/wisteria/plugins/PaymentAccessibilityService.kt"
  "$ANDROID_DIR/app/src/main/res/xml/payment_accessibility_config.xml"
  "$ANDROID_DIR/app/src/main/java/com/gingery/wisteria/plugins/InAppBrowserPlugin.kt"
  "$ANDROID_DIR/app/src/main/java/com/gingery/wisteria/plugins/InAppBrowserActivity.kt"
)
for f in "${EXPECTED[@]}"; do
  if [ ! -f "$f" ]; then
    echo "[postsync] ERROR: missing $f" >&2
    exit 1
  fi
done
for marker in 'registerPlugin(StepCounterPlugin' \
              'registerPlugin(SleepEstimatePlugin' \
              'registerPlugin(ShareIntentPlugin' \
              'registerPlugin(BillSnifferPlugin' \
              'registerPlugin(UsageStatsPlugin' \
              'registerPlugin(AccessibilityCapturePlugin' \
              'registerPlugin(InAppBrowserPlugin'; do
  if ! grep -q "$marker" \
      "$ANDROID_DIR/app/src/main/java/com/gingery/wisteria/MainActivity.kt"; then
    echo "[postsync] ERROR: MainActivity.kt doesn't $marker" >&2
    exit 1
  fi
done

echo "[postsync] done"
