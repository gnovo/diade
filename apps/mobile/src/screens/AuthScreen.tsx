import type { User } from '@diade/domain';
import type React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authClient } from '../auth/authClient';
import { useAuth } from '../context/AuthContext';
import { Button, Logo } from '../design';

// A root-relative callback is resolved by the Expo plugin for the current runtime: diade:// in a
// standalone build, exp://<dev-server> in Expo Go. A hardcoded diade:// cannot return to Expo Go.
const APP_CALLBACK_URL = '/';

const toDomainUser = (u: {
  id: string;
  email: string;
  name: string;
  image?: string | null;
  createdAt: Date | string;
}): User => ({
  id: u.id,
  email: u.email,
  displayName: u.name,
  avatarUrl: u.image ?? null,
  createdAt: new Date(u.createdAt).toISOString(),
});

export const AuthScreen: React.FC = () => {
  const { t } = useTranslation();
  const { signInWithToken } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleGoogleSignIn = async () => {
    try {
      setIsSigningIn(true);
      // Opens Google in the browser; the Expo plugin stores the session when the browser returns.
      const result = await authClient.signIn.social({
        provider: 'google',
        callbackURL: APP_CALLBACK_URL,
      });
      if (result.error) {
        Alert.alert(t('auth.couldNotSignIn'), result.error.message || t('auth.googleNotCompleted'));
        return;
      }

      const { data } = await authClient.getSession();
      if (!data?.session?.token || !data.user) {
        // Browser closed or cancelled before the session was created.
        return;
      }
      await signInWithToken(data.session.token, toDomainUser(data.user));
    } catch (err) {
      const message =
        err instanceof Error && err.message ? err.message : t('common.checkConnection');
      Alert.alert(t('auth.couldNotSignIn'), message);
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
            {t('auth.tagline')}
          </Text>
        </View>

        <View className="bg-surface rounded-lg p-6 border border-border my-8 gap-5">
          <View className="gap-1">
            <Text className="text-xl leading-7 font-bold text-ink text-center">
              {t('auth.welcome')}
            </Text>
            <Text className="text-sm leading-5 text-ink-muted text-center">
              {t('auth.signInPrompt')}
            </Text>
          </View>
          <Button
            label={t('auth.signInWithGoogle')}
            onPress={handleGoogleSignIn}
            disabled={isSigningIn}
            loading={isSigningIn}
            variant="primary"
            style={{ width: '100%' }}
          />
        </View>

        <View className="mb-4 gap-1">
          <Text className="text-sm leading-5 text-ink-muted text-center">
            {t('auth.justForTwo')}
          </Text>
          <Text className="text-sm leading-5 text-ink-muted text-center">
            {t('auth.useInvitedAccount')}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
};
