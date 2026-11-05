import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { sizes } from '@diade/design-tokens';
import {
  describeImportantDate,
  elapsedDays,
  parseDateOnly,
  sortImportantDates,
  type ImportantDate,
} from '@diade/domain';
import { getActiveImportantDates } from '../data/queries';
import { useLiveQuery } from '../data/useLiveQuery';
import { importantDateTypeLabel, statusLabel } from '../data/importantDateDisplay';
import { useFormat } from '../i18n';
import { ImportantDateDetail } from '../components/ImportantDateDetail';
import { ImportantDateForm } from '../components/ImportantDateForm';
import { ImportantDateIcon } from '../components/ImportantDateIcon';
import { useAuth } from '../context/AuthContext';
import { Card, EmptyState, Pill, ScreenScaffold, SectionLabel } from '../components/ui';
import { Icon, useColor } from '../design';
import { ProfileScreen, userInitial } from './ProfileScreen';

export const UsScreen: React.FC = () => {
  const { t } = useTranslation();
  const format = useFormat();
  const { user } = useAuth();
  const ink = useColor('ink');
  const inkMuted = useColor('ink-muted');
  const [profileOpen, setProfileOpen] = useState(false);
  const dates = useLiveQuery(getActiveImportantDates, [] as ImportantDate[]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ImportantDate | null>(null);

  const today = new Date();
  const pinned = dates.data.find((d) => d.pinned) ?? null;
  const sorted = sortImportantDates(dates.data, today);
  // Read the open record from live data so edits show immediately and a deletion closes it.
  const detail = detailId ? (dates.data.find((d) => d.id === detailId) ?? null) : null;

  const openForm = (item: ImportantDate | null) => {
    setEditing(item);
    setFormOpen(true);
  };

  const heroSince = pinned ? elapsedDays(pinned, today) : null;
  const heroStatus = pinned ? describeImportantDate(pinned, today) : null;

  return (
    <ScreenScaffold
      eyebrow={t('us.eyebrow')}
      title={t('us.title')}
      right={
        <Pressable
          onPress={() => setProfileOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t('us.openProfile')}
          hitSlop={6}
          className="w-9 h-9 rounded-full bg-action items-center justify-center"
        >
          <Text className="text-sm leading-5 font-semibold text-on-action">{userInitial(user?.displayName, user?.email)}</Text>
        </Pressable>
      }
    >
      {pinned && heroStatus ? (
        <Pressable
          onPress={() => setDetailId(pinned.id)}
          accessibilityRole="button"
          accessibilityLabel={t('us.openDetails', { title: pinned.title, status: statusLabel(t, heroStatus) })}
        >
          <Card className="items-center py-6">
            <ImportantDateIcon type={pinned.type} large />
            <Text className="text-base leading-6 text-ink-muted mt-3">{pinned.title}</Text>
            {heroSince !== null && heroStatus.kind !== 'today' ? (
              <Text className="text-display font-bold text-ink mt-1">{t('common.day', { count: heroSince })}</Text>
            ) : (
              <Text className="text-display font-bold text-ink mt-1">{statusLabel(t, heroStatus)}</Text>
            )}
            <Text className="text-body-strong text-ink-muted">
              {t(heroSince !== null && heroStatus.kind !== 'today' ? 'us.heroSince' : 'us.heroOn', {
                date: format.longDate(parseDateOnly(pinned.date) ?? today),
              })}
            </Text>
          </Card>
        </Pressable>
      ) : null}

      <Card>
        <SectionLabel>{t('us.specialDays')}</SectionLabel>

        <Pressable
          onPress={() => openForm(null)}
          accessibilityRole="button"
          accessibilityLabel={t('us.addSpecialDay')}
          className="flex-row items-center min-h-[48px] py-2 active:opacity-70"
        >
          <View className="w-10 h-10 rounded-full border border-dashed border-border-strong items-center justify-center mr-3">
            <Icon name="plus" size={sizes['icon-md']} color={ink} />
          </View>
          <Text className="text-base font-semibold text-ink">{t('us.addSpecialDay')}</Text>
        </Pressable>

        {sorted.length === 0 ? (
          <View className="mt-2">
            <EmptyState message={t('us.empty')} />
          </View>
        ) : null}

        {sorted.map((item) => {
          const status = describeImportantDate(item, today);
          const original = parseDateOnly(item.date);
          return (
            <View key={item.id}>
              <View className="h-px bg-border my-2" />
              <Pressable
                onPress={() => setDetailId(item.id)}
                accessibilityRole="button"
                accessibilityLabel={t('us.itemLabel', {
                  title: item.title,
                  type: importantDateTypeLabel(t, item.type),
                  status: statusLabel(t, status),
                })}
                className="flex-row items-center min-h-[56px] py-2 active:opacity-70"
              >
                <View className="mr-3">
                  <ImportantDateIcon type={item.type} />
                </View>
                <View className="flex-1 mr-3">
                  <View className="flex-row items-center gap-1.5">
                    <Text className="flex-shrink text-base font-semibold text-ink" numberOfLines={2}>
                      {item.title}
                    </Text>
                    {item.pinned ? <Icon name="pin" size={sizes['icon-sm']} color={inkMuted} title={t('common.featured')} /> : null}
                  </View>
                  <Text className="text-sm text-ink-muted mt-0.5">
                    {original ? format.longDate(original) : item.date}
                    {item.repeat === 'yearly' ? ` · ${t('us.everyYear')}` : ''}
                  </Text>
                </View>
                <Text
                  className={`text-sm font-semibold ${status.kind === 'since' ? 'text-ink-muted' : 'text-action'}`}
                >
                  {statusLabel(t, status)}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </Card>

      <View className="items-start">
        <Pill label={t('common.sharedWithBoth')} tone="shared" />
      </View>

      <ImportantDateDetail
        visible={detail !== null}
        item={detail}
        onClose={() => setDetailId(null)}
        // The form opens over the detail screen (never dismiss-then-present, which is flaky on iOS).
        onEdit={openForm}
      />

      <ImportantDateForm
        visible={formOpen}
        item={editing}
        pinnedItem={pinned}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
      />

      <ProfileScreen visible={profileOpen} onClose={() => setProfileOpen(false)} />
    </ScreenScaffold>
  );
};
