/**
 * Display metadata and wording for important dates. Pure (type-only imports), so it can
 * be unit-tested without the app runtime. Wording comes from the i18n catalog through `t`.
 */
import { IMPORTANT_DATE_TYPE_RULES, type ImportantDateStatus, type ImportantDateType } from '@diade/domain';
import type { TFunction } from '@diade/i18n';
import type { IconName } from '../design/Icon';

export const IMPORTANT_DATE_TYPE_ICONS: Record<ImportantDateType, IconName> = {
  my_birthday: 'cake',
  partner_birthday: 'cake',
  first_day: 'heart',
  first_kiss: 'heart',
  engagement: 'gem',
  wedding: 'gem',
  expecting_baby: 'baby',
  their_birthday: 'cake',
  trip: 'luggage',
  other_anniversary: 'users',
  other: 'star',
};

export const importantDateTypeLabel = (t: TFunction, type: ImportantDateType): string =>
  t(`importantDates.types.${type}`);

/** Alert choices. `null` is no alert; a number is days before the date (0 = on the day). */
export const ALERT_OPTIONS = [
  { value: 'none', labelKey: 'importantDates.alertOption.none', days: null },
  { value: '0', labelKey: 'importantDates.alertOption.dayOf', days: 0 },
  { value: '1', labelKey: 'importantDates.alertOption.oneDay', days: 1 },
  { value: '7', labelKey: 'importantDates.alertOption.oneWeek', days: 7 },
] as const;

export const alertToOption = (days: number | null): string => (days === null ? 'none' : String(days));

export const alertLabel = (t: TFunction, days: number | null): string => {
  if (days === null) return t('importantDates.alertLabel.none');
  if (days === 0) return t('importantDates.alertLabel.onTheDay');
  if (days === 7) return t('importantDates.alertLabel.oneWeekBefore');
  return t('importantDates.alertLabel.daysBefore', { count: days });
};

/** "Today", "94 days left" or "1753 days since" (in the current language). */
export function statusLabel(t: TFunction, status: Pick<ImportantDateStatus, 'kind' | 'days'>): string {
  if (status.kind === 'today') return t('importantDates.status.today');
  return t(`importantDates.status.${status.kind}`, { count: status.days });
}

/**
 * The title stored with a date. Dates about someone else are named from the person
 * ("Marta's birthday"), so the list and the Calendar read the same without extra lookups.
 */
export function composeTitle(
  t: TFunction,
  type: ImportantDateType,
  fields: { title: string; personName: string },
): string {
  if (IMPORTANT_DATE_TYPE_RULES[type].needsPersonName) {
    return t(`importantDates.derived.${type as 'their_birthday' | 'other_anniversary'}`, {
      name: fields.personName.trim(),
    });
  }
  return fields.title.trim();
}
