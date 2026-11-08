#!/usr/bin/env bash
# Builds and runs the DEVELOPMENT variant on a connected Android device: "Díade Dev"
# (com.diade.app.dev), installed beside the release app and never touching it.
#
#   scripts/run-android-dev.sh            talks to the deployed dev API (diade-api-dev, Neon `dev` branch)
#   scripts/run-android-dev.sh --local    talks to `wrangler dev` on this Mac (adb reverse tcp:8787)
#
# Override the dev API with DIADE_DEV_API_URL. Pick a device with ANDROID_SERIAL when several are attached.
#
# android/ is generated, so it holds one variant at a time. This regenerates it for the dev variant when
# needed (a clean prebuild, a few minutes). Before building the release app again, regenerate it for
# production: `npx expo prebuild --platform android --clean --no-install` with APP_VARIANT unset
# (build-android-prod.sh refuses to build while android/ is the dev variant).
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

API_URL="${DIADE_DEV_API_URL:-https://diade-api-dev.diade.workers.dev}"
LOCAL=0
if [ "${1:-}" = "--local" ]; then
  API_URL="http://localhost:8787"
  LOCAL=1
fi

export APP_VARIANT=dev
export EXPO_PUBLIC_APP_ENV=dev
export EXPO_PUBLIC_API_URL="$API_URL"

if ! grep -q "applicationId 'com.diade.app.dev'" android/app/build.gradle 2>/dev/null; then
  echo "android/ is not the dev variant: running a clean prebuild for it."
  npx expo prebuild --platform android --clean --no-install
fi

if [ "$LOCAL" = 1 ]; then
  ADB=(adb)
  [ -n "${ANDROID_SERIAL:-}" ] && ADB=(adb -s "$ANDROID_SERIAL")
  "${ADB[@]}" reverse tcp:8787 tcp:8787
fi

echo "Dev app -> $API_URL"
RUN=(npx expo run:android --variant debug)
[ -n "${ANDROID_SERIAL:-}" ] && RUN+=(--device "$ANDROID_SERIAL")
exec "${RUN[@]}"
