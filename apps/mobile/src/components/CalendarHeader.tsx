import { sizes } from '@diade/design-tokens';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import type { CalendarView } from '../calendar/prefs';
import { Icon, type IconName, useColor } from '../design';
import { Segmented } from './ui';

const IconButton: React.FC<{
  icon: IconName;
  label: string;
  onPress: () => void;
  dot?: boolean;
  bordered?: boolean;
}> = ({ icon, label, onPress, dot, bordered }) => {
  const accent = useColor('action');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      className={`w-11 h-11 rounded-full items-center justify-center ${bordered ? 'border border-border-strong bg-surface' : ''}`}
    >
      <Icon name={icon} size={sizes['icon-md']} />
      {dot ? (
        <View
          style={{ backgroundColor: accent }}
          className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full border border-surface"
        />
      ) : null}
    </Pressable>
  );
};

/**
 * The calendar's fixed app bar: the month being looked at, month arrows and "today" when they
 * help, the filters button, and the view switcher. It stays put while the content scrolls.
 */
export const CalendarHeader: React.FC<{
  title: string;
  view: CalendarView;
  onViewChange: (view: CalendarView) => void;
  showNav: boolean;
  prevLabel: string;
  nextLabel: string;
  onPrev: () => void;
  onNext: () => void;
  showToday: boolean;
  onToday: () => void;
  showFilters: boolean;
  filtersActive: boolean;
  onOpenFilters: () => void;
}> = ({
  title,
  view,
  onViewChange,
  showNav,
  prevLabel,
  nextLabel,
  onPrev,
  onNext,
  showToday,
  onToday,
  showFilters,
  filtersActive,
  onOpenFilters,
}) => {
  const { t } = useTranslation();
  return (
    <View className="px-4 pt-4 pb-3 bg-bg">
      <View className="flex-row items-center mb-3">
        <Text
          className="flex-1 text-title-2 font-bold text-ink mr-2"
          numberOfLines={1}
          accessibilityRole="header"
        >
          {title}
        </Text>
        {showToday ? (
          <IconButton icon="calendar" label={t('common.today')} onPress={onToday} />
        ) : null}
        {showNav ? (
          <>
            <IconButton icon="chevron-left" label={prevLabel} onPress={onPrev} />
            <IconButton icon="chevron-right" label={nextLabel} onPress={onNext} />
          </>
        ) : null}
        {showFilters ? (
          <View className="ml-1">
            <IconButton
              icon="sliders-horizontal"
              label={t(filtersActive ? 'calendar.filtersOn' : 'calendar.filters')}
              onPress={onOpenFilters}
              dot={filtersActive}
              bordered
            />
          </View>
        ) : null}
      </View>
      <Segmented<CalendarView>
        value={view}
        onChange={onViewChange}
        options={[
          { value: 'schedule', label: t('calendar.viewSchedule') },
          { value: 'day', label: t('calendar.viewDay') },
          { value: 'week', label: t('calendar.viewWeek') },
          { value: 'month', label: t('calendar.viewMonth') },
        ]}
      />
    </View>
  );
};
