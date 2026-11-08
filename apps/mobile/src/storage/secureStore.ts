import type { Space, User } from '@diade/domain';
import * as SecureStore from 'expo-secure-store';

const KEYS = {
  SESSION_TOKEN: 'diade_session_token',
  USER_DATA: 'diade_user_data',
  CURRENT_SPACE: 'diade_current_space',
} as const;

export async function getSessionToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEYS.SESSION_TOKEN);
  } catch (error) {
    console.error('Failed to read session token from SecureStore:', error);
    return null;
  }
}

export async function setSessionToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEYS.SESSION_TOKEN, token);
  } catch (error) {
    console.error('Failed to save session token to SecureStore:', error);
  }
}

export async function clearSessionToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEYS.SESSION_TOKEN);
  } catch (error) {
    console.error('Failed to delete session token from SecureStore:', error);
  }
}

export async function getStoredUser(): Promise<User | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEYS.USER_DATA);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error('Failed to read user data from SecureStore:', error);
    return null;
  }
}

export async function setStoredUser(user: User): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEYS.USER_DATA, JSON.stringify(user));
  } catch (error) {
    console.error('Failed to save user data to SecureStore:', error);
  }
}

export async function getStoredSpace(): Promise<Space | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEYS.CURRENT_SPACE);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error('Failed to read space data from SecureStore:', error);
    return null;
  }
}

export async function setStoredSpace(space: Space): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEYS.CURRENT_SPACE, JSON.stringify(space));
  } catch (error) {
    console.error('Failed to save space data to SecureStore:', error);
  }
}

export async function clearAllSessionData(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEYS.SESSION_TOKEN);
    await SecureStore.deleteItemAsync(KEYS.USER_DATA);
    await SecureStore.deleteItemAsync(KEYS.CURRENT_SPACE);
  } catch (error) {
    console.error('Failed to clear session data from SecureStore:', error);
  }
}
