/**
 * Build variants of the app, chosen with the APP_VARIANT environment variable.
 *
 * - unset or "production": the app exactly as app.json defines it. Nothing is changed, on purpose:
 *   the runtimeVersion is the native fingerprint, which is a hash of this resolved config, so any
 *   difference here would stop over-the-air updates from reaching installed release builds.
 * - "dev": a separate app that installs beside the release app and talks to the dev backend.
 *
 * Self-contained on purpose: Expo compiles this file by itself and cannot resolve local imports from it.
 * The logic is exported so vitest can cover it. Only type imports from expo, which are erased.
 */
import type { ConfigContext, ExpoConfig } from 'expo/config';

export type AppVariant = 'production' | 'dev';

export function resolveVariant(raw: string | undefined): AppVariant {
  if (raw === undefined || raw === '' || raw === 'production') return 'production';
  if (raw === 'dev') return 'dev';
  // A typo must not quietly produce a production-identical (or wrongly identified) build.
  throw new Error(`Unknown APP_VARIANT "${raw}". Use "dev", or leave it unset for production.`);
}

export const DEV_APP_ID = 'com.diade.app.dev';

export function applyVariant(base: ExpoConfig, variant: AppVariant): ExpoConfig {
  if (variant === 'production') return base;
  return {
    ...base,
    name: 'Díade Dev',
    // Distinct URL scheme so sign-in returns to this app and not the release app.
    scheme: 'diade-dev',
    ios: { ...base.ios, bundleIdentifier: DEV_APP_ID },
    android: { ...base.android, package: DEV_APP_ID },
    // Development builds load their JavaScript from Metro and never take production updates.
    updates: { enabled: false },
    extra: { ...base.extra, appVariant: 'dev' },
  };
}

// app.json stays the source of truth for the production app. APP_VARIANT=dev builds the dev variant.
export default ({ config }: ConfigContext): ExpoConfig =>
  applyVariant(config as ExpoConfig, resolveVariant(process.env.APP_VARIANT));
