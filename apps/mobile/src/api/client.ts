import { DiadeApiClient } from '@diade/api-client';
import { getSessionToken } from '../storage/secureStore';

// Default to local Cloudflare Worker address during development
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8787';

export const apiClient = new DiadeApiClient({
  baseUrl: API_BASE_URL,
  getAuthToken: getSessionToken,
});
