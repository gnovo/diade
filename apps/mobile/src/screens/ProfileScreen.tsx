import { sizes } from '@diade/design-tokens';
import type { LanguagePreference } from '@diade/i18n';
import Constants from 'expo-constants';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, Share, Text, View } from 'react-native';
import { apiClient } from '../api/client';
import { NutritionSettingsScreen } from '../components/NutritionSettingsScreen';
import { Sheet } from '../components/Sheet';
import { TrainingSettingsScreen } from '../components/TrainingViews';
import { Button, SectionLabel, Segmented } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useNutrition } from '../context/NutritionContext';
import { useTraining } from '../context/TrainingContext';
import { inviteState } from '../data/invite';
import { Icon, ThemeToggle, useColor, useThemePreference } from '../design';
import { useLanguagePreference } from '../i18n';
import { CalendarSettingsScreen } from './CalendarSettingsScreen';

export const userInitial = (name?: string | null, email?: string | null) =>
  (name?.trim() || email?.trim() || '?').charAt(0).toUpperCase();

/** A grouped list of rows with hairline dividers, like the iOS settings groups. */
const Group: React.FC<{ children: React.ReactNode[] }> = ({ children }) => (
  <View className="bg-surface rounded-lg border border-border mb-5 overflow-hidden">
    {React.Children.toArray(children).map((child, index) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: toArray() output is static and positional
      <View key={index}>
        {index > 0 ? <View className="h-px bg-border mx-4" /> : null}
        {child}
      </View>
    ))}
  </View>
);

/** A tappable row: label on the left, the current value and a chevron on the right. */
const SettingRow: React.FC<{
  label: string;
  value?: string;
  onPress: () => void;
  expanded?: boolean;
  children?: React.ReactNode;
}> = ({ label, value, onPress, expanded, children }) => {
  const inkMuted = useColor('ink-muted');
  return (
    <View>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={value ? `${label}, ${value}` : label}
        accessibilityState={expanded === undefined ? undefined : { expanded }}
        className="flex-row items-center min-h-[56px] px-4 active:opacity-70"
      >
        <Text className="flex-1 text-base font-semibold text-ink">{label}</Text>
        {value ? <Text className="text-sm text-ink-muted mr-2">{value}</Text> : null}
        <View style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}>
          <Icon name="chevron-right" size={sizes['icon-sm']} color={inkMuted} />
        </View>
      </Pressable>
      {expanded ? <View className="px-4 pb-4">{children}</View> : null}
    </View>
  );
};

/** Profile and preferences: a sheet over Today, opened from the greeting. */
export const ProfileScreen: React.FC<{ visible: boolean; onClose: () => void }> = ({
  visible,
  onClose,
}) => {
  const { t } = useTranslation();
  const { user, space, members, signOut, updateSpace } = useAuth();
  const { preference, setPreference } = useLanguagePreference();
  const { preference: themePreference } = useThemePreference();
  const inkMuted = useColor('ink-muted');
  const [generating, setGenerating] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [nutritionOpen, setNutritionOpen] = useState(false);
  const nutrition = useNutrition();
  const [trainingOpen, setTrainingOpen] = useState(false);
  const { training } = useTraining();
  const [open, setOpen] = useState<'appearance' | 'language' | null>(null);

  const invite = inviteState(space, members.length, new Date());
  const partner = members.find((m) => m.userId !== user?.id);

  const generateInvite = async () => {
    if (!space) return;
    try {
      setGenerating(true);
      const res = await apiClient.createInviteCode();
      await updateSpace({ ...space, inviteCode: res.inviteCode, inviteExpiresAt: res.expiresAt });
    } catch (err) {
      Alert.alert(
        t('profile.inviteError'),
        (err instanceof Error && err.message) || t('common.checkConnection'),
      );
    } finally {
      setGenerating(false);
    }
  };

  const shareInvite = () => {
    if (invite.kind === 'valid')
      Share.share({ message: t('profile.inviteShareMessage', { code: invite.code }) });
  };

  const confirmSignOut = () =>
    Alert.alert(t('profile.signOutTitle'), t('profile.signOutBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.signOut'), style: 'destructive', onPress: () => signOut() },
    ]);

  const toggle = (row: 'appearance' | 'language') =>
    setOpen((current) => (current === row ? null : row));
  const languageName =
    preference === 'en'
      ? 'English'
      : preference === 'pt-PT'
        ? 'Português'
        : t('profile.languageSystem');
  const version = Constants.expoConfig?.version;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('profile.title')}
      closeLabel={t('profile.close')}
    >
      <View className="flex-row items-center mb-8">
        <View className="w-16 h-16 rounded-full bg-action items-center justify-center mr-4">
          <Text className="text-3xl leading-10 font-bold text-on-action">
            {userInitial(user?.displayName, user?.email)}
          </Text>
        </View>
        <View className="flex-1">
          {user?.displayName ? (
            <Text className="text-title-3 font-bold text-ink" numberOfLines={1}>
              {user.displayName}
            </Text>
          ) : null}
          <Text className="text-sm leading-5 text-ink-muted" numberOfLines={1}>
            {user?.email}
          </Text>
        </View>
      </View>

      <SectionLabel>{t('profile.sectionUs')}</SectionLabel>
      <Group>
        {partner ? (
          <View className="flex-row items-center min-h-[56px] px-4 py-2">
            <View className="w-10 h-10 rounded-full bg-brand-mint items-center justify-center mr-3">
              <Text className="text-base font-semibold text-brand-deep">
                {userInitial(partner.displayName)}
              </Text>
            </View>
            <Text className="flex-1 text-base font-semibold text-ink" numberOfLines={1}>
              {partner.displayName}
            </Text>
          </View>
        ) : (
          <View className="flex-row items-center min-h-[72px] px-4 py-3">
            <View className="w-10 h-10 rounded-full border border-dashed border-border-strong items-center justify-center mr-3">
              <Icon name="plus" size={sizes['icon-md']} color={inkMuted} />
            </View>
            <View className="flex-1 mr-3">
              <Text className="text-base font-semibold text-ink">{t('profile.invitePartner')}</Text>
              {invite.kind === 'valid' ? (
                <>
                  <Text selectable className="text-sm text-ink-muted mt-0.5">
                    {invite.code}
                    {invite.expiresAt
                      ? ` · ${t('today.inviteValidUntil', { date: invite.expiresAt.toLocaleDateString() })}`
                      : ''}
                  </Text>
                  <Pressable
                    onPress={generateInvite}
                    disabled={generating}
                    accessibilityRole="button"
                    hitSlop={8}
                    className="mt-1 active:opacity-70"
                  >
                    <Text className="text-sm font-semibold text-action">
                      {t('profile.inviteNew')}
                    </Text>
                  </Pressable>
                </>
              ) : (
                <Text className="text-sm text-ink-muted mt-0.5">{t('profile.inviteExpired')}</Text>
              )}
            </View>
            {invite.kind === 'valid' ? (
              <Button small label={t('profile.inviteShare')} onPress={shareInvite} />
            ) : (
              <Button
                small
                label={t('profile.inviteNew')}
                onPress={generateInvite}
                disabled={generating}
              />
            )}
          </View>
        )}
        <SettingRow label={t('googleCalendar.manage')} onPress={() => setCalendarOpen(true)} />
      </Group>

      <SectionLabel>{t('profile.sectionYou')}</SectionLabel>
      <Group>
        <SettingRow
          label={t('theme.appearance')}
          value={t(`theme.${themePreference}`)}
          expanded={open === 'appearance'}
          onPress={() => toggle('appearance')}
        >
          <ThemeToggle />
        </SettingRow>
        <SettingRow
          label={t('profile.language')}
          value={languageName}
          expanded={open === 'language'}
          onPress={() => toggle('language')}
        >
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
        </SettingRow>
        <SettingRow
          label={t('nutrition.title')}
          value={nutrition.active ? t('nutrition.on') : t('nutrition.off')}
          onPress={() => setNutritionOpen(true)}
        />
        <SettingRow
          label={t('training.title')}
          value={training ? t('nutrition.on') : t('nutrition.off')}
          onPress={() => setTrainingOpen(true)}
        />
      </Group>

      <Button label={t('profile.signOut')} variant="danger" onPress={confirmSignOut} />
      {version ? (
        <Text className="text-xs leading-4 text-ink-muted text-center mt-4">
          {t('profile.version', { version })}
        </Text>
      ) : null}
      <CalendarSettingsScreen visible={calendarOpen} onClose={() => setCalendarOpen(false)} />
      <NutritionSettingsScreen visible={nutritionOpen} onClose={() => setNutritionOpen(false)} />
      <TrainingSettingsScreen visible={trainingOpen} onClose={() => setTrainingOpen(false)} />
    </Sheet>
  );
};
