#!/usr/bin/env bash
# Builds the production Android release APK with source maps uploaded to Sentry.
#
# Secrets are never stored in the repo:
#   - SENTRY_AUTH_TOKEN: taken from the environment, or from ~/.android-keys/sentry-auth-token
#     (create that file yourself, chmod 600). Only used at build time for the source map upload.
#   - Release signing: ~/.gradle/gradle.properties (DIADE_RELEASE_*), see plugins/with-diade-release-signing.js
#   - EXPO_PUBLIC_SENTRY_DSN: read from apps/mobile/.env.local (public by design, but kept out of git).
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROD_API_URL="https://diade-api.diade.workers.dev"
TOKEN_FILE="$HOME/.android-keys/sentry-auth-token"

if [ -z "${SENTRY_AUTH_TOKEN:-}" ] && [ -f "$TOKEN_FILE" ]; then
  SENTRY_AUTH_TOKEN="$(tr -d '[:space:]' < "$TOKEN_FILE")"
  export SENTRY_AUTH_TOKEN
fi
if [ -z "${SENTRY_AUTH_TOKEN:-}" ]; then
  echo "error: no Sentry auth token. Set SENTRY_AUTH_TOKEN or write it to $TOKEN_FILE" >&2
  exit 1
fi

DSN_LINE="$(grep '^EXPO_PUBLIC_SENTRY_DSN=' "$APP_DIR/.env.local" || true)"
if [ -z "$DSN_LINE" ]; then
  echo "error: EXPO_PUBLIC_SENTRY_DSN missing from apps/mobile/.env.local" >&2
  exit 1
fi
EXPO_PUBLIC_SENTRY_DSN="${DSN_LINE#EXPO_PUBLIC_SENTRY_DSN=}"

export EXPO_PUBLIC_API_URL="$PROD_API_URL"
export EXPO_PUBLIC_SENTRY_DSN

cd "$APP_DIR/android"
./gradlew assembleRelease --no-daemon

APK="$APP_DIR/android/app/build/outputs/apk/release/app-release.apk"
echo "Built: $APK"
shasum -a 256 "$APK"
