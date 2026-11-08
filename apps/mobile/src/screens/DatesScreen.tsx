import {
  buildTimeline,
  describeImportantDate,
  elapsedDays,
  IMPORTANT_DATE_GROUPS,
  type ImportantDate,
  type ImportantDateGroup,
  importantDateGroup,
  parseDateOnly,
  togetherProgress,
  upcomingBirthdays,
} from '@diade/domain';
import type React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { BirthdayList, BirthdayStrip } from '../components/BirthdayViews';
import { DatesTimeline } from '../components/DatesTimeline';
import { FilterChips } from '../components/FilterChips';
import { ImportantDateDetail } from '../components/ImportantDateDetail';
import { ImportantDateForm } from '../components/ImportantDateForm';
import { ImportantDateIcon } from '../components/ImportantDateIcon';
import { ImportantDateWizard } from '../components/ImportantDateWizard';
import { Card, EmptyState, HeaderAddButton, ScreenScaffold, SectionLabel } from '../components/ui';
import { statusLabel } from '../data/importantDateDisplay';
import { getActiveImportantDates } from '../data/queries';
import { elapsedLabel } from '../data/timelineDisplay';
import { useLiveQuery } from '../data/useLiveQuery';
import { useFormat } from '../i18n';

type Filter = 'all' | ImportantDateGroup;

export const DatesScreen: React.FC = () => {
  const { t } = useTranslation();
  const format = useFormat();
  const dates = useLiveQuery(getActiveImportantDates, [] as ImportantDate[]);
  const [filter, setFilter] = useState<Filter>('all');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ImportantDate | null>(null);

  const today = new Date();
  const pinned = dates.data.find((d) => d.pinned) ?? null;
  // The featured date leads All, and leads the group it belongs to.
  const showHero =
    pinned !== null && (filter === 'all' || importantDateGroup(pinned.type) === filter);
  // Read the open record from live data so edits show immediately and a deletion closes it.
  const detail = detailId ? (dates.data.find((d) => d.id === detailId) ?? null) : null;

  // Cheap enough (a few dozen dates) to rebuild on every render.
  const entries = buildTimeline(dates.data, today, filter);
  const birthdays = upcomingBirthdays(dates.data, today);
  const milestones = entries.filter((e) => e.kind === 'milestone');

  const openForm = (item: ImportantDate) => {
    setEditing(item);
    setFormOpen(true);
  };

  const heroSince = pinned ? elapsedDays(pinned, today) : null;
  const heroStatus = pinned ? describeImportantDate(pinned, today) : null;
  const together = pinned ? togetherProgress(pinned, today) : null;
  const heroCounts = heroSince !== null && heroStatus !== null && heroStatus.kind !== 'today';

  const filterOptions: Array<{ value: Filter; label: string }> = [
    { value: 'all', label: t('us.filter.all') },
    ...IMPORTANT_DATE_GROUPS.map((group) => ({
      value: group as Filter,
      label: t(`us.filter.${group}`),
    })),
  ];
  const filterLabel = filterOptions.find((o) => o.value === filter)?.label ?? '';

  const isEmpty =
    filter === 'birthdays'
      ? birthdays.length === 0
      : milestones.length === 0 && (filter !== 'all' || birthdays.length === 0);

  // Trips get a one-line summary instead of the hero.
  const trips = filter === 'trips' ? milestones : [];
  const firstTrip = trips.length > 0 ? trips[trips.length - 1] : null;

  return (
    <ScreenScaffold
      title={t('us.title')}
      right={<HeaderAddButton label={t('us.addDate')} onPress={() => setWizardOpen(true)} />}
    >
      <FilterChips
        options={filterOptions}
        value={filter}
        onChange={setFilter}
        label={t('us.filtersLabel')}
      />

      {showHero && pinned && heroStatus ? (
        <Pressable
          onPress={() => setDetailId(pinned.id)}
          accessibilityRole="button"
          accessibilityLabel={t('us.openDetails', {
            title: pinned.title,
            status: statusLabel(t, heroStatus),
          })}
        >
          <Card className="items-center py-6">
            <ImportantDateIcon type={pinned.type} large />
            <Text className="text-base leading-6 text-ink-muted mt-3">{pinned.title}</Text>
            {heroCounts ? (
              <Text className="text-display font-bold text-ink mt-1">
                {t('common.day', { count: heroSince })}
              </Text>
            ) : (
              <Text className="text-display font-bold text-ink mt-1">
                {statusLabel(t, heroStatus)}
              </Text>
            )}
            {heroCounts && together ? (
              <Text className="text-body-strong text-ink-muted">
                {elapsedLabel(t, together.elapsed)}
              </Text>
            ) : (
              <Text className="text-body-strong text-ink-muted">
                {t(heroCounts ? 'us.heroSince' : 'us.heroOn', {
                  date: format.longDate(parseDateOnly(pinned.date) ?? today),
                })}
              </Text>
            )}
            {heroCounts && together?.next ? (
              <View className="self-stretch mt-4">
                <View className="h-1 rounded-full bg-border overflow-hidden">
                  <View
                    className="h-1 rounded-full bg-action"
                    style={{ width: `${Math.round(together.progress * 100)}%` }}
                  />
                </View>
                <View className="flex-row justify-between mt-2 gap-3">
                  <Text className="text-xs leading-4 text-ink-muted flex-shrink">
                    {t('us.timeline.nextTogether', { count: together.next.years })}
                  </Text>
                  <Text className="text-xs leading-4 font-semibold text-ink">
                    {statusLabel(t, {
                      kind: together.next.daysLeft === 0 ? 'today' : 'left',
                      days: together.next.daysLeft,
                    })}
                  </Text>
                </View>
              </View>
            ) : null}
          </Card>
        </Pressable>
      ) : null}

      {filter === 'all' && birthdays.length > 0 ? (
        <View>
          <SectionLabel>{t('us.filter.birthdays')}</SectionLabel>
          <BirthdayStrip entries={birthdays} onOpen={setDetailId} />
        </View>
      ) : null}

      {filter === 'trips' && firstTrip && firstTrip.kind === 'milestone' ? (
        <Card>
          <Text className="text-body-strong text-ink">
            {t('us.timeline.tripsSummary', { count: trips.length })}
          </Text>
          <Text className="text-sm leading-5 text-ink-muted">
            {t('us.timeline.tripsFirst', {
              title: firstTrip.item.title,
              date: format.monthYear(firstTrip.date),
            })}
          </Text>
        </Card>
      ) : null}

      {isEmpty ? (
        <EmptyState message={filter === 'all' ? t('us.empty') : t('us.emptyFiltered')} />
      ) : filter === 'birthdays' ? (
        <View>
          <SectionLabel>
            {t('us.groupCount', { label: filterLabel, count: birthdays.length })}
          </SectionLabel>
          <BirthdayList entries={birthdays} onOpen={setDetailId} />
        </View>
      ) : (
        <View className="mb-5">
          <SectionLabel>
            {filter === 'all' || filter === 'couple'
              ? t('us.timeline.ourStory')
              : t('us.groupCount', { label: filterLabel, count: milestones.length })}
          </SectionLabel>
          <DatesTimeline entries={entries} today={today} onOpen={setDetailId} />
        </View>
      )}

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

      <ImportantDateWizard
        visible={wizardOpen}
        onClose={() => setWizardOpen(false)}
        pinnedItem={pinned}
      />
    </ScreenScaffold>
  );
};
