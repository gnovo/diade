import type React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useColor } from '../design';

export const SpaceSetupScreen: React.FC = () => {
  const { t } = useTranslation();
  const { updateSpace, signOut } = useAuth();
  const placeholderColor = useColor('ink-muted');
  const onAction = useColor('on-action');
  const action = useColor('action');

  const [spaceName, setSpaceName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  const handleCreateSpace = async () => {
    if (!spaceName.trim()) {
      Alert.alert(t('common.required'), t('spaceSetup.nameRequired'));
      return;
    }

    try {
      setIsCreating(true);
      const res = await apiClient.createSpace({ name: spaceName.trim() });
      await updateSpace(res.space);
      Alert.alert(
        t('spaceSetup.created'),
        t('spaceSetup.createdBody', { code: res.space.inviteCode }),
      );
    } catch (err) {
      Alert.alert(
        t('spaceSetup.couldNotCreate'),
        (err instanceof Error && err.message) || t('common.checkConnection'),
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinSpace = async () => {
    if (!inviteCode.trim()) {
      Alert.alert(t('common.required'), t('spaceSetup.codeRequired'));
      return;
    }

    try {
      setIsJoining(true);
      const res = await apiClient.joinSpace({ inviteCode: inviteCode.trim().toUpperCase() });
      await updateSpace(res.space);
      Alert.alert(t('spaceSetup.joined'), t('spaceSetup.joinedBody', { name: res.space.name }));
    } catch (err) {
      Alert.alert(
        t('spaceSetup.joinError'),
        (err instanceof Error && err.message) || t('spaceSetup.invalidCode'),
      );
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        {/* Header */}
        <View className="mb-8">
          <Text className="text-2xl font-bold text-ink mb-1">{t('spaceSetup.title')}</Text>
          <Text className="text-sm text-ink-muted">{t('spaceSetup.subtitle')}</Text>
        </View>

        {/* Option 1: Create a Space */}
        <View className="bg-surface rounded-2xl p-6 border border-border mb-6 shadow-sm">
          <Text className="text-lg font-bold text-ink mb-1">{t('spaceSetup.createTitle')}</Text>
          <Text className="text-sm text-ink-muted mb-4">{t('spaceSetup.createBody')}</Text>

          <Text className="text-sm font-semibold text-ink-muted mb-2 tracking-wider">
            {t('spaceSetup.spaceName')}
          </Text>
          <TextInput
            value={spaceName}
            onChangeText={setSpaceName}
            placeholder={t('spaceSetup.spaceNamePlaceholder')}
            placeholderTextColor={placeholderColor}
            className="bg-bg border border-border rounded-xl px-4 py-3 text-ink text-base mb-4"
          />

          <TouchableOpacity
            onPress={handleCreateSpace}
            disabled={isCreating}
            activeOpacity={0.8}
            className="bg-action rounded-xl py-3.5 items-center justify-center"
          >
            {isCreating ? (
              <ActivityIndicator color={onAction} />
            ) : (
              <Text className="text-on-action font-semibold text-sm">
                {t('spaceSetup.createButton')}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Divider */}
        <View className="flex-row items-center my-2 mb-6">
          <View className="flex-1 h-px bg-border" />
          <Text className="mx-4 text-sm font-semibold text-ink-muted">{t('spaceSetup.or')}</Text>
          <View className="flex-1 h-px bg-border" />
        </View>

        {/* Option 2: Join a Space */}
        <View className="bg-surface rounded-2xl p-6 border border-border mb-8 shadow-sm">
          <Text className="text-lg font-bold text-ink mb-1">{t('spaceSetup.joinTitle')}</Text>
          <Text className="text-sm text-ink-muted mb-4">{t('spaceSetup.joinBody')}</Text>

          <Text className="text-sm font-semibold text-ink-muted mb-2 tracking-wider">
            {t('spaceSetup.inviteCode')}
          </Text>
          <TextInput
            value={inviteCode}
            onChangeText={(text) => setInviteCode(text.toUpperCase())}
            placeholder={t('spaceSetup.inviteCodePlaceholder')}
            placeholderTextColor={placeholderColor}
            autoCapitalize="characters"
            maxLength={8}
            className="bg-bg border border-border rounded-xl px-4 py-3 text-ink text-base font-semibold tracking-[2px] mb-4"
          />

          <TouchableOpacity
            onPress={handleJoinSpace}
            disabled={isJoining}
            activeOpacity={0.8}
            className="border border-action rounded-xl py-3.5 items-center justify-center bg-surface"
          >
            {isJoining ? (
              <ActivityIndicator color={action} />
            ) : (
              <Text className="text-action font-semibold text-sm">
                {t('spaceSetup.joinButton')}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Sign Out Link */}
        <TouchableOpacity onPress={signOut} className="items-center py-2">
          <Text className="text-sm text-ink-muted">{t('spaceSetup.signOut')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};
