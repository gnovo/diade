#!/usr/bin/env bash
# Builds the production Android release APK with source maps uploaded to Sentry.
#
# Secrets are never stored in the repo:
#   - SENTRY_AUTH_TOKEN: read from 1Password (Employee/diade-mobile), unless already in the environment.
#     Only used at build time for the source map upload.
#   - Release signing: ~/.gradle/gradle.properties (DIADE_RELEASE_*), see plugins/with-diade-release-signing.js
#   - EXPO_PUBLIC_SENTRY_DSN: read from 1Password (Employee/diade-mobile), unless already in the environment
#     (public by design, but kept out of git).
set -euo pipefail

# A development variant must never be built or published as the release app.
if [ -n "${APP_VARIANT:-}" ] && [ "${APP_VARIANT}" != "production" ]; then
  echo "error: APP_VARIANT=${APP_VARIANT} is set. Unset it before a release build or update." >&2
  exit 1
fi

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROD_API_URL="https://diade-api.diade.workers.dev"

# shellcheck source=op-secrets.sh
. "$APP_DIR/scripts/op-secrets.sh"
load_secret SENTRY_AUTH_TOKEN
load_secret EXPO_PUBLIC_SENTRY_DSN

export EXPO_PUBLIC_API_URL="$PROD_API_URL"

if grep -q "applicationId 'com.diade.app.dev'" "$APP_DIR/android/app/build.gradle"; then
  echo "error: android/ was generated for the dev variant. Regenerate it for production first:" >&2
  echo "  cd apps/mobile && npx expo prebuild --platform android --clean --no-install" >&2
  exit 1
fi

cd "$APP_DIR/android"
./gradlew assembleRelease --no-daemon

APK="$APP_DIR/android/app/build/outputs/apk/release/app-release.apk"
echo "Built: $APK"
shasum -a 256 "$APK"
