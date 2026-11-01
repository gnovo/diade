import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { User } from '@diade/domain';
import { ApiError } from '@diade/api-client';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import { TextField } from '../components/ui';

const toDomainUser = (u: { id: string; email: string; name: string; image: string | null; createdAt: string }): User => ({
  id: u.id,
  email: u.email,
  displayName: u.name,
  avatarUrl: u.image,
  createdAt: u.createdAt,
});

export const AuthScreen: React.FC = () => {
  const { signInWithToken } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleSignIn = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      Alert.alert('Required', 'Enter your email and password.');
      return;
    }
    try {
      setIsSigningIn(true);
      const { token, user } = await apiClient.signInWithEmail(trimmedEmail, password);
      setPassword('');
      await signInWithToken(token, toDomainUser(user));
    } catch (err) {
      const message =
        err instanceof ApiError && err.statusCode === 401
          ? 'That email and password do not match.'
          : err instanceof Error && err.message && !(err instanceof TypeError)
            ? err.message
            : 'Check your connection and try again.';
      Alert.alert('Could not sign in', message);
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 24, flexGrow: 1, justifyContent: 'space-between' }} keyboardShouldPersistTaps="handled">
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
            <View>
              <Text className="text-xs font-semibold text-ink-muted mb-1.5">Email</Text>
              <TextField
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                placeholder="you@example.com"
              />
            </View>
            <View>
              <Text className="text-xs font-semibold text-ink-muted mb-1.5">Password</Text>
              <TextField
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                textContentType="password"
                autoComplete="password"
                placeholder="Password"
                onSubmitEditing={handleSignIn}
                returnKeyType="go"
              />
            </View>
            <TouchableOpacity
              onPress={handleSignIn}
              disabled={isSigningIn}
              activeOpacity={0.8}
              className="bg-primary rounded-xl py-4 items-center justify-center mt-2"
            >
              {isSigningIn ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-white font-semibold text-base">Sign in</Text>}
            </TouchableOpacity>
          </View>

          <Text className="text-xs text-ink-muted text-center mb-4">
            Private to the two of you. Accounts are created by invitation only.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};
