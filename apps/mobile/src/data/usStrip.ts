/**
 * What Today's "Us" strip and greeting show about the couple's special days. Pure (no app runtime),
 * so it can be unit-tested.
 */
import {
  describeImportantDate,
  elapsedDays,
  type ImportantDate,
  type ImportantDateStatus,
  isCoupleDate,
} from '@diade/domain';

export interface DescribedDate {
  item: ImportantDate;
  status: ImportantDateStatus;
}

/** Dates happening today or within `lookaheadDays`, soonest first. Dates already behind us are left out. */
export function upcomingSpecialDates(
  dates: ImportantDate[],
  now: Date,
  lookaheadDays: number,
): DescribedDate[] {
  return dates
    .filter((item) => isCoupleDate(item.type))
    .map((item) => ({ item, status: describeImportantDate(item, now) }))
    .filter((d) => d.status.kind !== 'since' && d.status.days <= lookaheadDays)
    .sort((a, b) => a.status.days - b.status.days);
}

export interface UsStrip {
  /** The featured date. `days` is the running count ("Day 482"), or null when it is a countdown or today. */
  featured: { item: ImportantDate; status: ImportantDateStatus; days: number | null } | null;
  /** The next special date other than the featured one. */
  next: DescribedDate | null;
}

export function usStrip(allDates: ImportantDate[], now: Date, lookaheadDays: number): UsStrip {
  // The strip is about the two of you: other people's dates and trips stay on the Dates tab and Calendar.
  const dates = allDates.filter((d) => isCoupleDate(d.type));
  const pinned = dates.find((d) => d.pinned) ?? null;
  let featured: UsStrip['featured'] = null;
  if (pinned) {
    const status = describeImportantDate(pinned, now);
    const since = elapsedDays(pinned, now);
    featured = {
      item: pinned,
      status,
      days: since !== null && status.kind !== 'today' ? since : null,
    };
  }
  const next =
    upcomingSpecialDates(dates, now, lookaheadDays).find((d) => d.item.id !== pinned?.id) ?? null;
  return { featured, next };
}
