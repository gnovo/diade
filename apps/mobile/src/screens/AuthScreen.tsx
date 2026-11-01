import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { User } from '@diade/domain';
import { useAuth } from '../context/AuthContext';
import { authClient } from '../auth/authClient';

const APP_CALLBACK_URL = 'diade://';

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
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
      <View className="flex-1 p-6 justify-between">
        <View className="items-center mt-12">
          <View className="w-20 h-20 items-center justify-center mb-6">
            <View className="flex-row items-center">
              <View className="w-9 h-9 rounded-full bg-secondary opacity-90 -mr-2" />
              <View className="w-9 h-9 rounded-full bg-primary -ml-2" />
            </View>
          </View>
          <Text className="text-3xl font-bold text-ink tracking-tight mb-2">Díade</Text>
          <Text className="text-base text-ink-muted text-center px-4">Two distinct elements. One shared space.</Text>
        </View>

        <View className="bg-surface rounded-2xl p-6 border border-border my-8 gap-4">
          <TouchableOpacity
            onPress={handleGoogleSignIn}
            disabled={isSigningIn}
            activeOpacity={0.8}
            accessibilityRole="button"
            className="bg-primary rounded-xl py-4 items-center justify-center"
          >
            {isSigningIn ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text className="text-white font-semibold text-base">Continue with Google</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text className="text-xs text-ink-muted text-center mb-4">
          Private to the two of you. Sign in with the Google account you were invited with.
        </Text>
      </View>
    </SafeAreaView>
  );
};
