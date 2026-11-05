import type { TFunction } from 'i18next';

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const;

/** "Today", "Tomorrow", or "Mon 3 Nov" / "seg, 3 de nov". */
export function formatDayLabel(t: TFunction, date: Date, now: Date = new Date()): string {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfDate.getTime() - startOfToday.getTime()) / 86_400_000);
  if (diffDays === 0) return t('common.today');
  if (diffDays === 1) return t('common.tomorrow');
  return t('format.dayMonth', {
    weekday: t(`format.weekdayShort.${WEEKDAYS[date.getDay()]}`),
    day: date.getDate(),
    month: t(`format.monthShort.${MONTHS[date.getMonth()]}`),
  });
}

/** "November 2026" / "Novembro de 2026". */
export function formatMonthYear(t: TFunction, date: Date): string {
  const month = t(`format.monthLong.${MONTHS[date.getMonth()]}`);
  const label = t('format.monthYear', { month, year: date.getFullYear() });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** "Mon 3 Nov 2026" / "seg, 3 de nov de 2026". */
export function formatLongDate(t: TFunction, date: Date): string {
  return t('format.longDate', {
    weekday: t(`format.weekdayShort.${WEEKDAYS[date.getDay()]}`),
    day: date.getDate(),
    month: t(`format.monthShort.${MONTHS[date.getMonth()]}`),
    year: date.getFullYear(),
  });
}
