import * as Sentry from '@sentry/react-native';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  // The dev build is tagged so its events can be filtered out of production's.
  environment: process.env.EXPO_PUBLIC_APP_ENV ?? (__DEV__ ? 'development' : 'production'),
  tracesSampleRate: __DEV__ ? 1.0 : 0.1,
  sendDefaultPii: false,
});