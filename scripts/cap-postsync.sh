#!/usr/bin/env bash
# Post-sync overlay: after `npx cap sync android` regenerates the
# native scaffold, inject our custom Kotlin plugins + manifest
# permissions + MainActivity plugin registrations + a stable debug
# keystore so successive APK installs are upgrades (data preserved)
# rather than fresh installs.
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

# 1. Copy Kotlin plugin sources into the generated app module.
echo "[postsync] copying overlay sources"
cp -r "$OVERLAY_DIR/app/src/main/java/." "$ANDROID_DIR/app/src/main/java/"

# 2. Patch AndroidManifest.xml — add ACTIVITY_RECOGNITION permission
#    if it isn't already present.
MANIFEST="$ANDROID_DIR/app/src/main/AndroidManifest.xml"
if ! grep -q 'android.permission.ACTIVITY_RECOGNITION' "$MANIFEST"; then
  echo "[postsync] adding ACTIVITY_RECOGNITION permission to manifest"
  # Insert just before the <application> tag.
  sed -i.bak \
    's|<application|<uses-permission android:name="android.permission.ACTIVITY_RECOGNITION" />\n    <application|' \
    "$MANIFEST"
  rm -f "$MANIFEST.bak"
fi

# 3. Patch MainActivity.kt — register our plugins.
MAIN_ACTIVITY="$ANDROID_DIR/app/src/main/java/com/gingery/wisteria/MainActivity.kt"
if [ -f "$MAIN_ACTIVITY" ]; then
  if ! grep -q 'StepCounterPlugin' "$MAIN_ACTIVITY"; then
    echo "[postsync] registering StepCounterPlugin in MainActivity"
    sed -i.bak \
      's|^package com.gingery.wisteria$|package com.gingery.wisteria\n\nimport com.gingery.wisteria.plugins.StepCounterPlugin|' \
      "$MAIN_ACTIVITY"
    sed -i.bak2 \
      's|override fun onCreate(savedInstanceState: Bundle?) {|override fun onCreate(savedInstanceState: Bundle?) {\n        registerPlugin(StepCounterPlugin::class.java)|' \
      "$MAIN_ACTIVITY"
    rm -f "$MAIN_ACTIVITY.bak" "$MAIN_ACTIVITY.bak2"
  fi
else
  echo "[postsync] WARN: MainActivity.kt not found at expected path"
fi

# 4. Install a stable debug keystore. Default behavior generates a
#    fresh ~/.android/debug.keystore on every CI runner, which means
#    each APK has a different signature and Android refuses to update
#    over the previous install (forcing uninstall → IndexedDB wipe).
#    Committing a fixed keystore is fine — debug keys aren't secrets.
KEYSTORE_SRC="$OVERLAY_DIR/wisteria-debug.keystore"
if [ -f "$KEYSTORE_SRC" ]; then
  echo "[postsync] installing stable debug keystore"
  cp "$KEYSTORE_SRC" "$ANDROID_DIR/app/wisteria-debug.keystore"

  APP_GRADLE="$ANDROID_DIR/app/build.gradle"
  if [ -f "$APP_GRADLE" ] && ! grep -q 'wisteria-debug.keystore' "$APP_GRADLE"; then
    # Inject signingConfigs.debug pointing to our committed keystore.
    # Capacitor's generated build.gradle has an `android {` block we
    # can append to via a here-doc-ish patch.
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
# Insert signingConfigs right after `android {` opening.
out = re.sub(r'(android\s*\{\s*\n)', r'\1' + patch, src, count=1)
open(p, 'w').write(out)
PY
  fi
fi

echo "[postsync] done"

