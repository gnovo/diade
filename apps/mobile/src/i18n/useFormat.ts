import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDayLabel, formatLongDate, formatMonthYear } from '@diade/i18n';

/** Date formatters bound to the current language. Re-created when the language changes. */
export function useFormat() {
  const { t, i18n } = useTranslation();
  return useMemo(
    () => ({
      /** "Today", "Tomorrow", or "Mon 3 Nov". */
      dayLabel: (date: Date, now?: Date) => formatDayLabel(t, date, now),
      /** "Mon 3 Nov 2026". */
      longDate: (date: Date) => formatLongDate(t, date),
      /** "November 2026". */
      monthYear: (date: Date) => formatMonthYear(t, date),
    }),
    // `t` changes identity with the language; `i18n.language` makes that dependency explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, i18n.language],
  );
}
