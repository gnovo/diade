import React from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ExternalCalendar } from '@diade/domain';
import type { GoogleScope } from '../data/unifiedAgenda';
import { useColor } from '../design';
import { BottomSheet } from './BottomSheet';
import { Segmented } from './ui';

/** Calendars that are worth a toggle: the member's own enabled ones and the partner's shared ones. */
export function toggleableCalendars(calendars: ExternalCalendar[]): ExternalCalendar[] {
  return calendars.filter((c) => c.syncEnabled && c.name);
}

/** True when something is hidden from the agenda: another person's calendars or a single calendar. */
export function hasActiveFilters(scope: GoogleScope, hidden: Set<string>, calendars: ExternalCalendar[]): boolean {
  if (scope !== 'both') return true;
  return toggleableCalendars(calendars).some((c) => hidden.has(c.id));
}

const CalendarToggle: React.FC<{ calendar: ExternalCalendar; visible: boolean; onToggle: () => void }> = ({
  calendar,
  visible,
  onToggle,
}) => {
  const actionColor = useColor('action');
  const trackOff = useColor('border-strong');
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="switch"
      accessibilityState={{ checked: visible }}
      accessibilityLabel={calendar.name ?? ''}
      className="flex-row items-center min-h-[52px]"
    >
      <View style={{ backgroundColor: calendar.color ?? '#64748B' }} className="w-4 h-4 rounded-full mr-3" />
      <Text className="flex-1 text-base text-ink mr-3" numberOfLines={1}>
        {calendar.name}
      </Text>
      <Switch
        value={visible}
        onValueChange={onToggle}
        trackColor={{ false: trackOff, true: actionColor }}
        // The row is the control; the inner switch is a visual.
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      />
    </Pressable>
  );
};

/**
 * Everything that narrows the calendar view, in one sheet: whose Google calendars to show
 * and which individual calendars. Choices apply immediately and stay on this device.
 */
export const CalendarFiltersSheet: React.FC<{
  visible: boolean;
  onClose: () => void;
  scope: GoogleScope;
  onScopeChange: (scope: GoogleScope) => void;
  scopeOptions: Array<{ value: GoogleScope; label: string }>;
  calendars: ExternalCalendar[];
  hiddenIds: Set<string>;
  onToggleCalendar: (id: string) => void;
  userId: string;
  partnerName: string;
  onManage: () => void;
}> = ({
  visible,
  onClose,
  scope,
  onScopeChange,
  scopeOptions,
  calendars,
  hiddenIds,
  onToggleCalendar,
  userId,
  partnerName,
  onManage,
}) => {
  const { t } = useTranslation();
  const toggleable = toggleableCalendars(calendars);
  const mine = toggleable.filter((c) => c.userId === userId);
  const partners = toggleable.filter((c) => c.userId !== userId);

  const group = (label: string, list: ExternalCalendar[]) =>
    list.length === 0 ? null : (
      <View className="mb-4">
        <Text className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-1">{label}</Text>
        {list.map((calendar) => (
          <CalendarToggle
            key={calendar.id}
            calendar={calendar}
            visible={!hiddenIds.has(calendar.id)}
            onToggle={() => onToggleCalendar(calendar.id)}
          />
        ))}
      </View>
    );

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('calendar.filters')}>
      <Text className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-2">
        {t('calendar.showEventsFrom')}
      </Text>
      <View className="mb-5">
        <Segmented<GoogleScope> value={scope} onChange={onScopeChange} options={scopeOptions} />
      </View>

      {toggleable.length === 0 ? (
        <Text className="text-sm text-ink-muted mb-4">{t('calendar.noCalendarsToToggle')}</Text>
      ) : (
        <>
          {group(t('calendar.yourCalendars'), mine)}
          {group(t('calendar.partnerCalendars', { name: partnerName }), partners)}
        </>
      )}

      <Pressable
        onPress={() => {
          onClose();
          onManage();
        }}
        accessibilityRole="button"
        className="min-h-[48px] justify-center border-t border-border mt-1"
      >
        <Text className="text-base font-semibold text-action">{t('calendar.manageCalendars')}</Text>
      </Pressable>
    </BottomSheet>
  );
};
