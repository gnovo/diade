import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';

export const SpaceSetupScreen: React.FC = () => {
  const { updateSpace, signOut } = useAuth();

  const [spaceName, setSpaceName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  const handleCreateSpace = async () => {
    if (!spaceName.trim()) {
      Alert.alert('Required', 'Please enter a name for your space');
      return;
    }

    try {
      setIsCreating(true);
      const res = await apiClient.createSpace({ name: spaceName.trim() });
      await updateSpace(res.space);
      Alert.alert(
        'Space Created!',
        `Your invite code is: ${res.space.inviteCode}\nShare this with your partner to connect.`,
      );
    } catch (err: any) {
      Alert.alert('Could not create space', err?.message || 'Check your connection and try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinSpace = async () => {
    if (!inviteCode.trim()) {
      Alert.alert('Required', 'Please enter the 8-character invite code');
      return;
    }

    try {
      setIsJoining(true);
      const res = await apiClient.joinSpace({ inviteCode: inviteCode.trim().toUpperCase() });
      await updateSpace(res.space);
      Alert.alert('Connected!', `You have joined "${res.space.name}".`);
    } catch (err: any) {
      Alert.alert('Join Error', err?.message || 'Invalid or expired invite code');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        {/* Header */}
        <View className="mb-8">
          <Text className="text-2xl font-bold text-ink mb-1">Space Setup</Text>
          <Text className="text-sm text-ink-muted">
            Díade is a shared space for exactly two people.
          </Text>
        </View>

        {/* Option 1: Create a Space */}
        <View className="bg-surface rounded-2xl p-6 border border-border mb-6 shadow-sm">
          <Text className="text-lg font-bold text-ink mb-1">Create a New Space</Text>
          <Text className="text-sm text-ink-muted mb-4">
            Start a fresh space and generate an invite code for your partner.
          </Text>

          <Text className="text-xs font-semibold text-ink-muted mb-2 tracking-wider">
            SPACE NAME
          </Text>
          <TextInput
            value={spaceName}
            onChangeText={setSpaceName}
            placeholder="e.g. Our Home, Casa"
            placeholderTextColor="#94A3B8"
            className="bg-canvas border border-border rounded-xl px-4 py-3 text-ink text-base mb-4"
          />

          <TouchableOpacity
            onPress={handleCreateSpace}
            disabled={isCreating}
            activeOpacity={0.8}
            className="bg-primary rounded-xl py-3.5 items-center justify-center"
          >
            {isCreating ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text className="text-white font-semibold text-sm">Create &amp; Get Code</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Divider */}
        <View className="flex-row items-center my-2 mb-6">
          <View className="flex-1 h-px bg-border" />
          <Text className="mx-4 text-xs font-semibold text-ink-muted">OR</Text>
          <View className="flex-1 h-px bg-border" />
        </View>

        {/* Option 2: Join a Space */}
        <View className="bg-surface rounded-2xl p-6 border border-border mb-8 shadow-sm">
          <Text className="text-lg font-bold text-ink mb-1">Join Existing Space</Text>
          <Text className="text-sm text-ink-muted mb-4">
            Enter the 8-character invite code provided by your partner.
          </Text>

          <Text className="text-xs font-semibold text-ink-muted mb-2 tracking-wider">
            INVITE CODE
          </Text>
          <TextInput
            value={inviteCode}
            onChangeText={(text) => setInviteCode(text.toUpperCase())}
            placeholder="e.g. ABC123XY"
            placeholderTextColor="#94A3B8"
            autoCapitalize="characters"
            maxLength={8}
            className="bg-canvas border border-border rounded-xl px-4 py-3 text-ink text-base font-mono mb-4"
          />

          <TouchableOpacity
            onPress={handleJoinSpace}
            disabled={isJoining}
            activeOpacity={0.8}
            className="border border-primary rounded-xl py-3.5 items-center justify-center bg-surface"
          >
            {isJoining ? (
              <ActivityIndicator color="#0D4F46" />
            ) : (
              <Text className="text-primary font-semibold text-sm">Join Space</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Sign Out Link */}
        <TouchableOpacity onPress={signOut} className="items-center py-2">
          <Text className="text-xs text-ink-muted">Sign out of this account</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};
