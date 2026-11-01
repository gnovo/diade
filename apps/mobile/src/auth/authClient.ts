import { createAuthClient } from 'better-auth/client';
import { expoClient } from '@better-auth/expo/client';
import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from '../api/client';

// Google sign-in runs in the browser through the API's /api/auth routes and returns
// to the app via the scheme of the current runtime (diade:// or exp:// in Expo Go). The Expo plugin keeps the resulting session in SecureStore.
export const authClient = createAuthClient({
  baseURL: API_BASE_URL,
  plugins: [
    expoClient({
      scheme: 'diade',
      storagePrefix: 'diade',
      storage: SecureStore,
    }),
  ],
});
