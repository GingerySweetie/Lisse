#!/usr/bin/env bash
# Post-sync overlay: after `npx cap sync android` regenerates the
# native scaffold, inject our custom Java plugins, our MainActivity
# (registering the plugins), manifest permissions, and a stable debug
# keystore so successive APK installs upgrade in place.
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

# 1. Copy overlay Java sources into the generated app module. This
#    overwrites the boilerplate MainActivity.java that Capacitor 8
#    generates (the boilerplate doesn't register our plugin) and
#    drops our StepCounterPlugin.java alongside it.
echo "[postsync] copying overlay sources"
cp -r "$OVERLAY_DIR/app/src/main/java/." "$ANDROID_DIR/app/src/main/java/"

# 1b. Copy overlay res/ — custom adaptive icon (wisteria mark) and
#     splash drawable replace Capacitor's stock assets.
if [ -d "$OVERLAY_DIR/app/src/main/res" ]; then
  echo "[postsync] copying overlay res (icons, splash)"
  cp -r "$OVERLAY_DIR/app/src/main/res/." "$ANDROID_DIR/app/src/main/res/"
fi

# 2. Patch AndroidManifest.xml — add ACTIVITY_RECOGNITION permission
#    if it isn't already present.
MANIFEST="$ANDROID_DIR/app/src/main/AndroidManifest.xml"
if ! grep -q 'android.permission.ACTIVITY_RECOGNITION' "$MANIFEST"; then
  echo "[postsync] adding ACTIVITY_RECOGNITION permission to manifest"
  sed -i.bak \
    's|<application|<uses-permission android:name="android.permission.ACTIVITY_RECOGNITION" />\n    <application|' \
    "$MANIFEST"
  rm -f "$MANIFEST.bak"
fi

# 3. Install the stable debug keystore so successive APK installs are
#    upgrades (data preserved) rather than fresh installs (IndexedDB
#    wipe).
KEYSTORE_SRC="$OVERLAY_DIR/wisteria-debug.keystore"
if [ -f "$KEYSTORE_SRC" ]; then
  echo "[postsync] installing stable debug keystore"
  cp "$KEYSTORE_SRC" "$ANDROID_DIR/app/wisteria-debug.keystore"

  APP_GRADLE="$ANDROID_DIR/app/build.gradle"
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

# 4. Sanity check — fail loud if the plugin or MainActivity didn't land.
EXPECTED=(
  "$ANDROID_DIR/app/src/main/java/com/gingery/wisteria/MainActivity.java"
  "$ANDROID_DIR/app/src/main/java/com/gingery/wisteria/plugins/StepCounterPlugin.java"
)
for f in "${EXPECTED[@]}"; do
  if [ ! -f "$f" ]; then
    echo "[postsync] ERROR: missing $f" >&2
    exit 1
  fi
done
if ! grep -q 'registerPlugin(StepCounterPlugin.class)' \
    "$ANDROID_DIR/app/src/main/java/com/gingery/wisteria/MainActivity.java"; then
  echo "[postsync] ERROR: MainActivity.java doesn't register StepCounterPlugin" >&2
  exit 1
fi

echo "[postsync] done"


