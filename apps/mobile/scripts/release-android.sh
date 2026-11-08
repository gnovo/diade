#!/usr/bin/env bash
# Release helper for the Díade Android app. Two modes:
#
#   release-android.sh ota [message]
#       JS/asset-only change. Publishes an over-the-air update to the "production" channel
#       via EAS Update. Installed apps pick it up on next launch (applied on the following restart).
#
#   release-android.sh apk
#       Native change (new native dependency, SDK bump, permission, app.json native config).
#       Bumps android.versionCode, builds the signed prod APK and publishes it as a GitHub Release
#       (tag v<version>-<versionCode>) that Obtainium picks up.
#
# Requires: eas login (ota), gh auth login (apk), plus everything build-android-prod.sh needs.
set -euo pipefail

# A development variant must never be built or published as the release app.
if [ -n "${APP_VARIANT:-}" ] && [ "${APP_VARIANT}" != "production" ]; then
  echo "error: APP_VARIANT=${APP_VARIANT} is set. Unset it before a release build or update." >&2
  exit 1
fi

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"
MODE="${1:-}"

case "$MODE" in
  ota)
    MESSAGE="${2:-$(git log -1 --pretty=%s)}"
    # An OTA bundle is exported locally, so it must get the same production env as the APK build.
    DSN_LINE="$(grep '^EXPO_PUBLIC_SENTRY_DSN=' "$APP_DIR/.env.local" || true)"
    if [ -z "$DSN_LINE" ]; then
      echo "error: EXPO_PUBLIC_SENTRY_DSN missing from apps/mobile/.env.local" >&2
      exit 1
    fi
    export EXPO_PUBLIC_SENTRY_DSN="${DSN_LINE#EXPO_PUBLIC_SENTRY_DSN=}"
    export EXPO_PUBLIC_API_URL="https://diade-api.diade.workers.dev"
    # The update only applies to installed builds with the same native fingerprint (runtimeVersion);
    # if native code changed, use `apk` instead.
    echo "Publishing OTA update to channel 'production': $MESSAGE"
    npx eas-cli@latest update --channel production --environment production --platform android --message "$MESSAGE" --non-interactive
    ;;
  apk)
    if [ -n "$(git status --porcelain)" ]; then
      echo "error: working tree not clean; commit first so the release matches a commit." >&2
      exit 1
    fi
    command -v gh >/dev/null || { echo "error: gh CLI not found" >&2; exit 1; }

    # Bump android.versionCode (Android refuses to update to an equal or lower code).
    NEW_CODE="$(node -e '
      const fs=require("fs");const p="app.json";const j=JSON.parse(fs.readFileSync(p,"utf8"));
      j.expo.android.versionCode=(j.expo.android.versionCode||0)+1;
      fs.writeFileSync(p,JSON.stringify(j,null,2)+"\n");console.log(j.expo.android.versionCode);')"
    VERSION="$(node -p 'require("./app.json").expo.version')"
    TAG="v${VERSION}-${NEW_CODE}"

    # Re-apply app.json to the generated android/ project (signing/ABI plugins are idempotent).
    # A previous dev prebuild leaves dev sources behind, so start clean in that case.
    CLEAN=""
    grep -q "applicationId 'com.diade.app.dev'" android/app/build.gradle 2>/dev/null && CLEAN="--clean"
    npx expo prebuild --platform android --no-install $CLEAN
    bash scripts/build-android-prod.sh

    SRC="$APP_DIR/android/app/build/outputs/apk/release/app-release.apk"
    OUT="$APP_DIR/android/app/build/outputs/apk/release/diade-${VERSION}-${NEW_CODE}.apk"
    cp "$SRC" "$OUT"

    git add app.json
    git commit -m "chore(mobile): release ${TAG}"
    git tag "$TAG"
    git push origin HEAD "$TAG"
    gh release create "$TAG" "$OUT" --repo gnovo/diade --title "$TAG" \
      --notes "${2:-Díade ${VERSION} (build ${NEW_CODE})}"
    echo "Released $TAG"
    ;;
  *)
    echo "usage: $0 ota [message] | apk [notes]" >&2
    exit 1
    ;;
esac
