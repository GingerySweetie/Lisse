#!/usr/bin/env bash
# Post-sync overlay: after `npx cap sync android` regenerates the
# native scaffold, inject our custom Java + Kotlin plugins, our
# MainActivity (registering the plugins), manifest permissions +
# intent filters, gradle Kotlin support, Health Connect dep, and a
# stable debug keystore so successive APK installs upgrade in place.
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

# 1. Copy overlay Java + Kotlin sources into the generated app module.
#    This overwrites the boilerplate MainActivity.java that Capacitor 8
#    generates (the boilerplate doesn't register our plugins) and
#    drops our plugin sources alongside it.
echo "[postsync] copying overlay sources"
cp -r "$OVERLAY_DIR/app/src/main/java/." "$ANDROID_DIR/app/src/main/java/"

# 1b. Copy overlay res/ — custom adaptive icon (wisteria mark) and
#     splash drawable replace Capacitor's stock assets.
if [ -d "$OVERLAY_DIR/app/src/main/res" ]; then
  echo "[postsync] copying overlay res (icons, splash)"
  cp -r "$OVERLAY_DIR/app/src/main/res/." "$ANDROID_DIR/app/src/main/res/"
  # @capacitor/splash-screen ships a stock drawable/splash.png. Our
  # overlay provides splash.xml with the same resource name → gradle's
  # resource merger fails with "Duplicate resources". Drop the PNG so
  # our XML wins. Same for ic_launcher PNGs in mipmap-*: keep them as
  # legacy fallback so Android < 26 still has an icon.
  find "$ANDROID_DIR/app/src/main/res" -type f -name 'splash.png' -delete || true
fi

# 2. Patch AndroidManifest.xml:
#    - ACTIVITY_RECOGNITION (step counter)
#    - health.READ_SLEEP (Health Connect sleep read)
#    - Share intent filter on MainActivity for SEND + SEND_MULTIPLE
#    - Health Connect privacy policy queries entry
MANIFEST="$ANDROID_DIR/app/src/main/AndroidManifest.xml"
if ! grep -q 'android.permission.ACTIVITY_RECOGNITION' "$MANIFEST"; then
  echo "[postsync] adding ACTIVITY_RECOGNITION permission"
  sed -i.bak \
    's|<application|<uses-permission android:name="android.permission.ACTIVITY_RECOGNITION" />\n    <application|' \
    "$MANIFEST"
  rm -f "$MANIFEST.bak"
fi
if ! grep -q 'android.permission.health.READ_SLEEP' "$MANIFEST"; then
  echo "[postsync] adding Health Connect READ_SLEEP permission"
  sed -i.bak \
    's|<application|<uses-permission android:name="android.permission.health.READ_SLEEP" />\n    <application|' \
    "$MANIFEST"
  rm -f "$MANIFEST.bak"
fi
if ! grep -q 'android.permission.health.READ_STEPS' "$MANIFEST"; then
  echo "[postsync] adding Health Connect READ_STEPS permission"
  sed -i.bak \
    's|<application|<uses-permission android:name="android.permission.health.READ_STEPS" />\n    <application|' \
    "$MANIFEST"
  rm -f "$MANIFEST.bak"
fi
if ! grep -q 'android.permission.PACKAGE_USAGE_STATS' "$MANIFEST"; then
  echo "[postsync] adding PACKAGE_USAGE_STATS permission"
  # tools:ignore is needed because this is a special access permission
  # that lint flags as protected; the user grants it via Settings, not
  # at install time.
  if ! grep -q 'xmlns:tools=' "$MANIFEST"; then
    sed -i.bak \
      's|<manifest |<manifest xmlns:tools="http://schemas.android.com/tools" |' \
      "$MANIFEST"
    rm -f "$MANIFEST.bak"
  fi
  sed -i.bak \
    's|<application|<uses-permission android:name="android.permission.PACKAGE_USAGE_STATS" tools:ignore="ProtectedPermissions" />\n    <application|' \
    "$MANIFEST"
  rm -f "$MANIFEST.bak"
fi

# Inject Health Connect <queries> + share intent-filter +
# BillSnifferService registration via Python.
python3 - "$MANIFEST" << 'PY'
import sys, re
p = sys.argv[1]
src = open(p).read()

# Health Connect package queries — required so the SDK can discover the
# HC service on the device.
hc_queries = """    <queries>
        <package android:name="com.google.android.apps.healthdata" />
        <intent>
            <action android:name="androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE" />
        </intent>
    </queries>
"""
if "androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE" not in src:
    # Insert before <application>.
    src = re.sub(r'(\s*<application\b)', '\n' + hc_queries + r'\1', src, count=1)

# Share intent-filter inside MainActivity's <activity> block.
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
    # Insert before the closing </activity> of MainActivity.
    src = re.sub(
        r'(<activity\b[^>]*MainActivity[^>]*>)(.*?)(</activity>)',
        lambda m: m.group(1) + m.group(2) + share_filter + m.group(3),
        src,
        count=1,
        flags=re.DOTALL,
    )

# BillSnifferService registration — must live inside <application>.
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
    # Insert before </application>.
    src = re.sub(r'(\s*</application>)', '\n' + sniffer_service + r'\1', src, count=1)

open(p, 'w').write(src)
PY

# 3. Configure Kotlin support + Health Connect dep in app/build.gradle.
APP_GRADLE="$ANDROID_DIR/app/build.gradle"
if [ -f "$APP_GRADLE" ]; then
  python3 - "$APP_GRADLE" << 'PY'
import sys, re
p = sys.argv[1]
src = open(p).read()

# Apply kotlin-android plugin.
if "kotlin-android" not in src:
    src = re.sub(
        r"(apply plugin: 'com\.android\.application')",
        r"\1\napply plugin: 'kotlin-android'",
        src,
        count=1,
    )

# Add Kotlin stdlib + Health Connect deps.
hc_block = """    implementation 'org.jetbrains.kotlin:kotlin-stdlib:1.9.24'
    implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3'
    implementation 'androidx.health.connect:connect-client:1.1.0'
    implementation 'androidx.localbroadcastmanager:localbroadcastmanager:1.1.0'
"""
if "androidx.health.connect:connect-client" not in src:
    # Inject inside the dependencies { } block — find the opening brace.
    src = re.sub(
        r"(dependencies\s*\{\s*\n)",
        r"\1" + hc_block,
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

# 3c. Bump minSdkVersion to 26: Health Connect (androidx.health.connect:
#     connect-client:1.1.0) declares minSdk 26 in its manifest, so the
#     app must be at least 26 or the manifest merger fails. Android 8.0
#     covers > 99% of in-use devices.
VARS_GRADLE="$ANDROID_DIR/variables.gradle"
if [ -f "$VARS_GRADLE" ]; then
  echo "[postsync] bumping minSdkVersion to 26 for Health Connect"
  sed -i.bak -E 's/(minSdkVersion *= *)[0-9]+/\126/' "$VARS_GRADLE"
  rm -f "$VARS_GRADLE.bak"
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
  "$ANDROID_DIR/app/src/main/java/com/gingery/wisteria/MainActivity.java"
  "$ANDROID_DIR/app/src/main/java/com/gingery/wisteria/plugins/StepCounterPlugin.java"
  "$ANDROID_DIR/app/src/main/java/com/gingery/wisteria/plugins/ShareIntentPlugin.java"
  "$ANDROID_DIR/app/src/main/java/com/gingery/wisteria/plugins/SleepPlugin.kt"
  "$ANDROID_DIR/app/src/main/java/com/gingery/wisteria/plugins/BillSnifferPlugin.java"
  "$ANDROID_DIR/app/src/main/java/com/gingery/wisteria/plugins/BillSnifferService.java"
  "$ANDROID_DIR/app/src/main/java/com/gingery/wisteria/plugins/UsageStatsPlugin.java"
)
for f in "${EXPECTED[@]}"; do
  if [ ! -f "$f" ]; then
    echo "[postsync] ERROR: missing $f" >&2
    exit 1
  fi
done
for marker in 'registerPlugin(StepCounterPlugin.class)' \
              'registerPlugin(SleepPlugin.class)' \
              'registerPlugin(ShareIntentPlugin.class)' \
              'registerPlugin(BillSnifferPlugin.class)' \
              'registerPlugin(UsageStatsPlugin.class)'; do
  if ! grep -q "$marker" \
      "$ANDROID_DIR/app/src/main/java/com/gingery/wisteria/MainActivity.java"; then
    echo "[postsync] ERROR: MainActivity.java doesn't $marker" >&2
    exit 1
  fi
done

echo "[postsync] done"
