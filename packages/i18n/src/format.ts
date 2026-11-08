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

const sameMonth = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

/**
 * "Mon 9 to Sun 15 Nov" / "seg, 9 a dom, 15 de nov": a period with weekdays. The month is written once
 * when both days fall in it.
 */
export function formatDateRange(t: TFunction, from: Date, to: Date): string {
  const start = sameMonth(from, to)
    ? t('format.weekdayDay', { weekday: t(`format.weekdayShort.${WEEKDAYS[from.getDay()]}`), day: from.getDate() })
    : formatDayLabel(t, from, new Date(0));
  const end = formatDayLabel(t, to, new Date(0));
  return t('format.range', { from: start, to: end });
}

/** "9–15 Nov" / "30 Nov – 6 Dec": a period short enough for a list name. */
export function formatCompactRange(t: TFunction, from: Date, to: Date): string {
  const month = (date: Date) => t(`format.monthShort.${MONTHS[date.getMonth()]}`);
  if (sameMonth(from, to)) return `${from.getDate()}–${to.getDate()} ${month(to)}`;
  return `${from.getDate()} ${month(from)} – ${to.getDate()} ${month(to)}`;
}
