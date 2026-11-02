import React from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { space as spacing, sizes } from '@diade/design-tokens';
import { useAuth } from '../context/AuthContext';
import { Button, Card, SectionLabel } from '../components/ui';
import { Icon, ThemeToggle } from '../design';

export const userInitial = (name?: string | null, email?: string | null) =>
  (name?.trim() || email?.trim() || '?').charAt(0).toUpperCase();

/** Profile and preferences, opened from the avatar button on the Us screen. */
export const ProfileScreen: React.FC<{ visible: boolean; onClose: () => void }> = ({ visible, onClose }) => {
  const { user, signOut } = useAuth();

  const confirmSignOut = () =>
    Alert.alert('Sign out?', 'Local data on this device will be removed. Changes not yet synced will be lost.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
        <View className="flex-row items-center justify-between px-4 pt-2 pb-2">
          <Text className="text-title-1 font-bold text-ink">Profile</Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close profile"
            hitSlop={8}
            className="w-11 h-11 rounded-full bg-surface-sunken items-center justify-center"
          >
            <Icon name="x" size={sizes['icon-md']} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing[4], paddingTop: spacing[4], paddingBottom: spacing[8] }}>
          <View className="items-center mb-8">
            <View className="w-20 h-20 rounded-full bg-action items-center justify-center mb-3">
              <Text className="text-3xl leading-10 font-bold text-on-action">{userInitial(user?.displayName, user?.email)}</Text>
            </View>
            {user?.displayName ? (
              <Text className="text-lg leading-7 font-semibold text-ink">{user.displayName}</Text>
            ) : null}
            <Text className="text-sm leading-5 text-ink-muted">{user?.email}</Text>
          </View>

          <Card>
            <SectionLabel>Appearance</SectionLabel>
            <ThemeToggle />
          </Card>

          <Card>
            <SectionLabel>Account</SectionLabel>
            <Text className="text-sm leading-5 text-ink-muted mb-3">
              Signing out removes local data from this device.
            </Text>
            <Button label="Sign out" variant="danger" onPress={confirmSignOut} />
          </Card>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};
