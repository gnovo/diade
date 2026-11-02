/**
 * Display metadata and wording for important dates. Pure (type-only imports), so it can
 * be unit-tested without the app runtime.
 */
import type { ImportantDateStatus, ImportantDateType } from '@diade/domain';
import type { IconName } from '../design/Icon';

export const IMPORTANT_DATE_TYPE_META: Record<ImportantDateType, { label: string; icon: IconName }> = {
  my_birthday: { label: 'My birthday', icon: 'cake' },
  partner_birthday: { label: "Partner's birthday", icon: 'cake' },
  first_day: { label: 'Our first day', icon: 'heart' },
  first_kiss: { label: 'First kiss', icon: 'heart' },
  engagement: { label: 'Engagement', icon: 'gem' },
  wedding: { label: 'Wedding day', icon: 'gem' },
  expecting_baby: { label: 'Expecting a baby', icon: 'baby' },
  other: { label: 'Other', icon: 'star' },
};

/** Alert choices. `null` is no alert; a number is days before the date (0 = on the day). */
export const ALERT_OPTIONS: Array<{ value: string; label: string; days: number | null }> = [
  { value: 'none', label: 'None', days: null },
  { value: '0', label: 'Day of', days: 0 },
  { value: '1', label: '1 day', days: 1 },
  { value: '7', label: '1 week', days: 7 },
];

export const alertToOption = (days: number | null): string => (days === null ? 'none' : String(days));

export const alertLabel = (days: number | null): string => {
  if (days === null) return 'None';
  if (days === 0) return 'On the day';
  if (days === 7) return '1 week before';
  return `${days} ${days === 1 ? 'day' : 'days'} before`;
};

export const plural = (count: number, unit: string): string => `${count} ${unit}${count === 1 ? '' : 's'}`;

/** "Today", "94 days left" or "1753 days since". */
export function statusLabel(status: Pick<ImportantDateStatus, 'kind' | 'days'>): string {
  if (status.kind === 'today') return 'Today';
  return `${plural(status.days, 'day')} ${status.kind}`;
}
