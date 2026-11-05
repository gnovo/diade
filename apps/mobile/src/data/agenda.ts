import type { TFunction } from '@diade/i18n';
import { expandEventOccurrences, type CalendarEvent, type EventCategory, type Visibility } from '@diade/domain';

export interface AgendaItem {
  /** Stable per occurrence: `${eventId}:${occurrence index}` */
  key: string;
  eventId: string;
  title: string;
  startAt: Date;
  endAt: Date;
  isAllDay: boolean;
  visibility: Visibility;
  category: EventCategory;
  recurring: boolean;
  highlighted: boolean;
}

/** Flattens events (including recurring series) into occurrences inside [from, to], soonest first. */
export function buildAgenda(events: CalendarEvent[], from: Date, to: Date): AgendaItem[] {
  const items: AgendaItem[] = [];
  for (const event of events) {
    for (const occurrence of expandEventOccurrences(event, from, to)) {
      items.push({
        key: `${event.id}:${occurrence.index}`,
        eventId: event.id,
        title: event.title,
        startAt: occurrence.startAt,
        endAt: occurrence.endAt,
        isAllDay: event.isAllDay,
        visibility: event.visibility,
        category: event.category,
        recurring: Boolean(event.recurrenceRule),
        highlighted: event.highlighted,
      });
    }
  }
  return items.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

export function formatAgendaTime(t: TFunction, item: AgendaItem): string {
  if (item.isAllDay) return t('format.allDay');
  const fmt = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${fmt(item.startAt)}–${fmt(item.endAt)}`;
}
