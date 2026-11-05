import React, { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { space as spacing, sizes } from '@diade/design-tokens';
import type { LanguagePreference } from '@diade/i18n';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Button, Card, Segmented, SectionLabel } from '../components/ui';
import { useLanguagePreference } from '../i18n';
import { Icon, ThemeToggle } from '../design';
import { CalendarSettingsScreen } from './CalendarSettingsScreen';

export const userInitial = (name?: string | null, email?: string | null) =>
  (name?.trim() || email?.trim() || '?').charAt(0).toUpperCase();

/** Profile and preferences, opened from the avatar button on the Us screen. */
export const ProfileScreen: React.FC<{ visible: boolean; onClose: () => void }> = ({ visible, onClose }) => {
  const { t } = useTranslation();
  const { user, space, members, signOut, updateSpace } = useAuth();
  const { preference, setPreference } = useLanguagePreference();
  const [generating, setGenerating] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  // The invite is only relevant until the second member has joined.
  const awaitingPartner = !!space && members.length < 2;
  const expiresAt = space?.inviteExpiresAt ? new Date(space.inviteExpiresAt) : null;
  const inviteValid = !!space?.inviteCode && (!expiresAt || expiresAt.getTime() > Date.now());

  const generateInvite = async () => {
    if (!space) return;
    try {
      setGenerating(true);
      const res = await apiClient.createInviteCode();
      await updateSpace({ ...space, inviteCode: res.inviteCode, inviteExpiresAt: res.expiresAt });
    } catch (err: any) {
      Alert.alert(t('profile.inviteError'), err?.message || t('common.checkConnection'));
    } finally {
      setGenerating(false);
    }
  };

  const shareInvite = () => {
    if (space) Share.share({ message: t('profile.inviteShareMessage', { code: space.inviteCode }) });
  };

  const confirmSignOut = () =>
    Alert.alert(t('profile.signOutTitle'), t('profile.signOutBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.signOut'), style: 'destructive', onPress: () => signOut() },
    ]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
        <View className="flex-row items-center justify-between px-4 pt-2 pb-2">
          <Text className="text-title-1 font-bold text-ink">{t('profile.title')}</Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('profile.close')}
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
            <SectionLabel>{t('theme.appearance')}</SectionLabel>
            <ThemeToggle />
          </Card>

          <Card>
            <SectionLabel>{t('profile.language')}</SectionLabel>
            <Segmented<LanguagePreference>
              value={preference}
              onChange={setPreference}
              options={[
                { value: 'system', label: t('profile.languageSystem') },
                // Language names are shown in their own language so they can always be found.
                { value: 'en', label: 'English' },
                { value: 'pt-PT', label: 'Português' },
              ]}
            />
          </Card>

          {awaitingPartner ? (
            <Card>
              <SectionLabel>{t('profile.invitePartner')}</SectionLabel>
              {inviteValid && space ? (
                <>
                  <Text selectable className="text-3xl leading-10 font-bold text-ink tracking-widest mb-1">
                    {space.inviteCode}
                  </Text>
                  {expiresAt ? (
                    <Text className="text-sm leading-5 text-ink-muted mb-3">
                      {t('profile.inviteExpires', { date: expiresAt.toLocaleDateString() })}
                    </Text>
                  ) : null}
                  <Button label={t('profile.inviteShare')} onPress={shareInvite} />
                  <View className="h-2" />
                  <Button
                    label={t('profile.inviteNew')}
                    variant="ghost"
                    onPress={generateInvite}
                    disabled={generating}
                  />
                </>
              ) : (
                <>
                  <Text className="text-sm leading-5 text-ink-muted mb-3">{t('profile.inviteExpired')}</Text>
                  <Button label={t('profile.inviteNew')} onPress={generateInvite} disabled={generating} />
                </>
              )}
            </Card>
          ) : null}

          <Card>
            <SectionLabel>{t('googleCalendar.manage')}</SectionLabel>
            <Text className="text-sm leading-5 text-ink-muted mb-3">{t('googleCalendar.manageNote')}</Text>
            <Button label={t('googleCalendar.open')} variant="ghost" onPress={() => setCalendarOpen(true)} />
          </Card>

          <Card>
            <SectionLabel>{t('profile.account')}</SectionLabel>
            <Text className="text-sm leading-5 text-ink-muted mb-3">
              {t('profile.accountNote')}
            </Text>
            <Button label={t('profile.signOut')} variant="danger" onPress={confirmSignOut} />
          </Card>
        </ScrollView>
        <CalendarSettingsScreen visible={calendarOpen} onClose={() => setCalendarOpen(false)} />
      </SafeAreaView>
    </Modal>
  );
};
