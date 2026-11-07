import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { sizes } from '@diade/design-tokens';
import {
  IMPORTANT_DATE_GROUPS,
  describeImportantDate,
  elapsedDays,
  importantDateGroup,
  parseDateOnly,
  sortImportantDates,
  type ImportantDate,
  type ImportantDateGroup,
} from '@diade/domain';
import { getActiveImportantDates } from '../data/queries';
import { useLiveQuery } from '../data/useLiveQuery';
import { importantDateTypeLabel, statusLabel } from '../data/importantDateDisplay';
import { useFormat } from '../i18n';
import { FilterChips } from '../components/FilterChips';
import { ImportantDateDetail } from '../components/ImportantDateDetail';
import { ImportantDateForm } from '../components/ImportantDateForm';
import { ImportantDateIcon } from '../components/ImportantDateIcon';
import { ImportantDateWizard } from '../components/ImportantDateWizard';
import { Card, EmptyState, HeaderAddButton, ScreenScaffold, SectionLabel } from '../components/ui';
import { Icon, useColor } from '../design';

type Filter = 'all' | ImportantDateGroup;

export const DatesScreen: React.FC = () => {
  const { t } = useTranslation();
  const format = useFormat();
  const inkMuted = useColor('ink-muted');
  const dates = useLiveQuery(getActiveImportantDates, [] as ImportantDate[]);
  const [filter, setFilter] = useState<Filter>('all');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ImportantDate | null>(null);

  const today = new Date();
  const pinned = dates.data.find((d) => d.pinned) ?? null;
  const visible = dates.data.filter((d) => filter === 'all' || importantDateGroup(d.type) === filter);
  const sorted = sortImportantDates(visible, today);
  // The featured date leads All, and leads the group it belongs to.
  const showHero = pinned !== null && (filter === 'all' || importantDateGroup(pinned.type) === filter);
  // Read the open record from live data so edits show immediately and a deletion closes it.
  const detail = detailId ? (dates.data.find((d) => d.id === detailId) ?? null) : null;

  const openForm = (item: ImportantDate) => {
    setEditing(item);
    setFormOpen(true);
  };

  const heroSince = pinned ? elapsedDays(pinned, today) : null;
  const heroStatus = pinned ? describeImportantDate(pinned, today) : null;

  const filterOptions: Array<{ value: Filter; label: string }> = [
    { value: 'all', label: t('us.filter.all') },
    ...IMPORTANT_DATE_GROUPS.map((group) => ({ value: group as Filter, label: t(`us.filter.${group}`) })),
  ];

  return (
    <ScreenScaffold
      title={t('us.title')}
      right={<HeaderAddButton label={t('us.addDate')} onPress={() => setWizardOpen(true)} />}
    >
      <FilterChips options={filterOptions} value={filter} onChange={setFilter} label={t('us.filtersLabel')} />

      {showHero && pinned && heroStatus ? (
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
        <SectionLabel>
          {t('us.groupCount', {
            label: filterOptions.find((o) => o.value === filter)?.label ?? '',
            count: sorted.length,
          })}
        </SectionLabel>

        {sorted.length === 0 ? (
          <View className="mt-2">
            <EmptyState message={filter === 'all' ? t('us.empty') : t('us.emptyFiltered')} />
          </View>
        ) : null}

        {sorted.map((item, index) => {
          const status = describeImportantDate(item, today);
          const original = parseDateOnly(item.date);
          return (
            <View key={item.id}>
              {index > 0 ? <View className="h-px bg-border my-2" /> : null}
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

      <ImportantDateWizard visible={wizardOpen} onClose={() => setWizardOpen(false)} pinnedItem={pinned} />
    </ScreenScaffold>
  );
};
