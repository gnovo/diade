/**
 * Wording for the Dates timeline. Pure (type-only imports), so it can be unit-tested without
 * the app runtime. Wording comes from the i18n catalog through `t`.
 */
import type { DurationParts } from '@diade/domain';
import type { TFunction } from '@diade/i18n';

type Unit = 'day' | 'week' | 'month' | 'year';

const unit = (t: TFunction, name: Unit, count: number): string =>
  t(`us.timeline.unit.${name}`, { count });

/** From this many spare days a span reads as the next month ("1 month 25 days" is "2 months"). */
const ROUND_UP_DAYS = 20;

/**
 * A span in the largest sensible unit: "5 days", "6 weeks", "3 months", "1 year 4 months".
 * `days` is the whole-day length of the span and `duration` is the same span in calendar parts.
 * With `round`, spare days of 20 or more count as one more month. That suits the gap between two
 * milestones, but not "how long ago", which must agree with the exact count shown elsewhere.
 */
export function spanLabel(
  t: TFunction,
  duration: DurationParts,
  days: number,
  round = false,
): string {
  if (days <= 0) return t('us.timeline.sameDay');
  if (days < 7) return unit(t, 'day', days);
  if (days < 60) return unit(t, 'week', Math.max(1, Math.round(days / 7)));

  let { years, months } = duration;
  if (round && duration.days >= ROUND_UP_DAYS) months += 1;
  if (months === 12) {
    years += 1;
    months = 0;
  }
  const parts: string[] = [];
  if (years > 0) parts.push(unit(t, 'year', years));
  if (months > 0) parts.push(unit(t, 'month', months));
  return parts.join(' ');
}

/** "6 years · 2 months · 21 days": every part that is not zero. */
export function elapsedLabel(t: TFunction, duration: DurationParts): string {
  const parts: string[] = [];
  if (duration.years > 0) parts.push(unit(t, 'year', duration.years));
  if (duration.months > 0) parts.push(unit(t, 'month', duration.months));
  if (duration.days > 0 || parts.length === 0) parts.push(unit(t, 'day', duration.days));
  return parts.join(' · ');
}
