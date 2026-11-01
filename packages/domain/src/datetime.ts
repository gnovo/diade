/**
 * Local date/time helpers for the forms and agenda views. All calendar arithmetic is
 * done in the device's local time zone; ISO strings are used only for storage.
 */

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Combines a YYYY-MM-DD date and HH:MM time into a local Date, or null if either is malformed. */
export function parseLocalDateTime(dateValue: string, timeValue: string): Date | null {
  const dateMatch = DATE_PATTERN.exec(dateValue.trim());
  const timeMatch = TIME_PATTERN.exec(timeValue.trim());
  if (!dateMatch || !timeMatch) return null;

  const [year, month, day] = [Number(dateMatch[1]), Number(dateMatch[2]), Number(dateMatch[3])];
  const date = new Date(year, month - 1, day, Number(timeMatch[1]), Number(timeMatch[2]));
  // Reject rolled-over dates such as 2026-02-31.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function toTimeInputValue(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatTime(date: Date): string {
  return toTimeInputValue(date);
}

/** "Today", "Tomorrow", or "Mon 3 Nov". */
export function formatDayLabel(date: Date, now: Date = new Date()): string {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfDate.getTime() - startOfToday.getTime()) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

export function formatLongDate(date: Date): string {
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}
