import React, { useState } from 'react';
import { View, Text, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { User } from '@diade/domain';
import { useAuth } from '../context/AuthContext';
import { authClient } from '../auth/authClient';
import { Button, Logo, ThemeToggle } from '../design';

// A root-relative callback is resolved by the Expo plugin for the current runtime: diade:// in a
// standalone build, exp://<dev-server> in Expo Go. A hardcoded diade:// cannot return to Expo Go.
const APP_CALLBACK_URL = '/';

const toDomainUser = (u: { id: string; email: string; name: string; image?: string | null; createdAt: Date | string }): User => ({
  id: u.id,
  email: u.email,
  displayName: u.name,
  avatarUrl: u.image ?? null,
  createdAt: new Date(u.createdAt).toISOString(),
});

export const AuthScreen: React.FC = () => {
  const { signInWithToken } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleGoogleSignIn = async () => {
    try {
      setIsSigningIn(true);
      // Opens Google in the browser; the Expo plugin stores the session when the browser returns.
      const result = await authClient.signIn.social({ provider: 'google', callbackURL: APP_CALLBACK_URL });
      if (result.error) {
        Alert.alert('Could not sign in', result.error.message || 'Google sign-in was not completed.');
        return;
      }

      const { data } = await authClient.getSession();
      if (!data?.session?.token || !data.user) {
        // Browser closed or cancelled before the session was created.
        return;
      }
      await signInWithToken(data.session.token, toDomainUser(data.user));
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : 'Check your connection and try again.';
      Alert.alert('Could not sign in', message);
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
      <View className="flex-1 p-6 justify-between">
        <View className="items-center mt-12">
          <Logo variant="stacked" height={112} />
          <Text className="text-base leading-6 text-ink-muted text-center px-4 mt-6">
            Two distinct elements. One shared space.
          </Text>
        </View>

        <View className="bg-surface rounded-lg p-6 border border-border my-8 gap-4">
          <Button
            label="Continue with Google"
            onPress={handleGoogleSignIn}
            disabled={isSigningIn}
            loading={isSigningIn}
            variant="primary"
            style={{ width: '100%' }}
          />
        </View>

        <View className="gap-2 mb-2">
          <ThemeToggle />
        </View>

        <Text className="text-sm text-ink-muted text-center mb-4">
          Private to the two of you. Sign in with the Google account you were invited with.
        </Text>
      </View>
    </SafeAreaView>
  );
};
