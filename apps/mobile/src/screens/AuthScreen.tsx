import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';

export const AuthScreen: React.FC = () => {
  const { signInWithToken } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleGoogleSignIn = async () => {
    try {
      setIsSigningIn(true);
      // In development / demo mode, authenticate with a test session
      // In production, triggers Google OAuth redirect / native browser sheet
      const mockUser = {
        id: 'user_goncalo',
        email: 'goncalo.novo@protonmail.com',
        displayName: 'Gonçalo',
        avatarUrl: null,
        createdAt: new Date().toISOString(),
      };
      await signInWithToken('mock_session_token_dev', mockUser);
    } catch (err: any) {
      Alert.alert('Sign-In Error', err?.message || 'Could not authenticate with Google');
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas justify-between px-6 py-8">
      {/* Top Branding Section */}
      <View className="items-center mt-12">
        {/* The Dyad Symbol Placeholder */}
        <View className="w-20 h-20 items-center justify-center mb-6">
          <View className="flex-row items-center">
            <View className="w-9 h-9 rounded-full bg-secondary opacity-90 -mr-2" />
            <View className="w-9 h-9 rounded-full bg-primary -ml-2" />
          </View>
        </View>

        <Text className="text-3xl font-bold text-ink tracking-tight mb-2">Díade</Text>
        <Text className="text-base text-ink-muted text-center px-4">
          Two distinct elements. One shared space.
        </Text>
      </View>

      {/* Value Pillars */}
      <View className="bg-surface rounded-2xl p-6 border border-border">
        <View className="flex-row items-center mb-4">
          <View className="w-2.5 h-2.5 rounded-full bg-primary mr-3" />
          <Text className="text-sm font-medium text-ink">
            Coordinate everyday life &amp; shared calendar
          </Text>
        </View>

        <View className="flex-row items-center mb-4">
          <View className="w-2.5 h-2.5 rounded-full bg-secondary mr-3" />
          <Text className="text-sm font-medium text-ink">
            Real-time grocery &amp; household lists
          </Text>
        </View>

        <View className="flex-row items-center">
          <View className="w-2.5 h-2.5 rounded-full bg-primary mr-3" />
          <Text className="text-sm font-medium text-ink">
            Private by design for exactly two people
          </Text>
        </View>
      </View>

      {/* Action Section */}
      <View className="mb-6">
        <TouchableOpacity
          onPress={handleGoogleSignIn}
          disabled={isSigningIn}
          activeOpacity={0.8}
          className="bg-primary rounded-xl py-4 items-center justify-center flex-row shadow-sm"
        >
          {isSigningIn ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <View className="w-6 h-6 rounded-full bg-white items-center justify-center mr-3">
                <Text className="text-xs font-bold text-primary">G</Text>
              </View>
              <Text className="text-white font-semibold text-base">Continue with Google</Text>
            </>
          )}
        </TouchableOpacity>

        <Text className="text-xs text-ink-muted text-center mt-4">
          Private &amp; encrypted. No ads. No public sign-up.
        </Text>
      </View>
    </SafeAreaView>
  );
};
