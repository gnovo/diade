import React, { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { sizes } from '@diade/design-tokens';
import { parseDateOnly, toDateInputValue } from '@diade/domain';
import { Icon, useScheme } from '../design';
import { useFormat } from '../i18n';

/**
 * A calendar-day field backed by the platform's native picker: an inline calendar on iOS,
 * the system dialog on Android. The value is a plain `YYYY-MM-DD` string, never an instant,
 * so the chosen day cannot shift with the time zone.
 */
export const DateField: React.FC<{
  value: string;
  onChange: (value: string) => void;
  label: string;
}> = ({ value, onChange, label }) => {
  const { t } = useTranslation();
  const format = useFormat();
  const scheme = useScheme();
  const [open, setOpen] = useState(false);

  const current = parseDateOnly(value) ?? new Date();
  const display = format.longDate(current);

  const handlePress = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: 'date',
        onValueChange: (_event, date) => onChange(toDateInputValue(date)),
      });
      return;
    }
    setOpen((previous) => !previous);
  };

  return (
    <View>
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${display}`}
        accessibilityHint={Platform.OS === 'ios' ? t('dateField.showHideCalendar') : t('dateField.openCalendar')}
        accessibilityState={{ expanded: Platform.OS === 'ios' ? open : undefined }}
        className="flex-row items-center justify-between bg-surface border border-border-strong rounded-md px-3 min-h-[48px]"
      >
        <Text className="text-base text-ink">{display}</Text>
        <Icon name="calendar" size={sizes['icon-md']} />
      </Pressable>

      {Platform.OS === 'ios' && open ? (
        <DateTimePicker
          value={current}
          mode="date"
          display="inline"
          themeVariant={scheme}
          onValueChange={(_event, date) => onChange(toDateInputValue(date))}
        />
      ) : null}
    </View>
  );
};
