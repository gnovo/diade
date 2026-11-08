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
#       (tag v<version>-<versionCode>) that Obtainium picks up. Main is protected, so this pushes a
#       chore/release-<tag> branch and a DRAFT release; merge that PR, then run `publish`.
#
#   release-android.sh publish <tag>
#       After the release PR is merged: publishes the draft, tagging the merged commit on main.
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
    # shellcheck source=op-secrets.sh
    . "$APP_DIR/scripts/op-secrets.sh"
    load_secret EXPO_PUBLIC_SENTRY_DSN
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

    # main is protected (changes go through a pull request), so the bump goes on a branch and the
    # release stays a draft, which Obtainium does not see, until that PR is merged.
    ORIG="$(git rev-parse --abbrev-ref HEAD)"
    BRANCH="chore/release-${TAG}"
    git switch -c "$BRANCH"
    git add app.json
    git commit -m "chore(mobile): release ${TAG}"
    git push -u origin "$BRANCH"
    gh release create "$TAG" "$OUT" --repo gnovo/diade --title "$TAG" --draft \
      --notes "${2:-Díade ${VERSION} (build ${NEW_CODE})}"
    git switch "$ORIG"
    echo "Built $TAG as a DRAFT release. Next:"
    echo "  1. Open and merge a PR from $BRANCH: https://github.com/gnovo/diade/pull/new/$BRANCH"
    echo "  2. Then run: bash scripts/release-android.sh publish $TAG"
    ;;
  publish)
    TAG="${2:?usage: $0 publish <tag>}"
    git fetch -q origin main
    # The tag must point at the merged bump commit, so find it on main (squash merges add " (#N)").
    COMMIT="$(git log origin/main -50 --format='%H %s' | grep -F "chore(mobile): release ${TAG}" | head -1 | cut -d' ' -f1)"
    [ -n "$COMMIT" ] || {
      echo "error: no 'release ${TAG}' commit on origin/main yet. Merge the release PR first." >&2
      exit 1
    }
    gh release edit "$TAG" --repo gnovo/diade --draft=false --target "$COMMIT"
    echo "Published $TAG; Obtainium will offer it."
    ;;
  *)
    echo "usage: $0 ota [message] | apk [notes] | publish <tag>" >&2
    exit 1
    ;;
esac
