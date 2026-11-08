import { describe, expect, it } from 'vitest';
import {
  formatCompactRange,
  formatDateRange,
  formatDayLabel,
  formatLongDate,
  formatMonthYear,
} from './format';
import { createI18n } from './i18n';

const now = new Date(2026, 10, 1, 9, 0); // Sun 1 Nov 2026

describe('formatDayLabel', () => {
  it('labels today and tomorrow in English', () => {
    const { t } = createI18n('en');
    expect(formatDayLabel(t, new Date(2026, 10, 1, 20, 0), now)).toBe('Today');
    expect(formatDayLabel(t, new Date(2026, 10, 2, 8, 0), now)).toBe('Tomorrow');
    expect(formatDayLabel(t, new Date(2026, 10, 5, 8, 0), now)).toBe('Thu 5 Nov');
  });

  it('labels today and tomorrow in Portuguese', () => {
    const { t } = createI18n('pt-PT');
    expect(formatDayLabel(t, new Date(2026, 10, 1, 20, 0), now)).toBe('Hoje');
    expect(formatDayLabel(t, new Date(2026, 10, 2, 8, 0), now)).toBe('Amanhã');
    expect(formatDayLabel(t, new Date(2026, 10, 5, 8, 0), now)).toBe('qui, 5 de nov');
  });
});

describe('formatLongDate', () => {
  it('includes the year in both languages', () => {
    const date = new Date(2026, 10, 14);
    expect(formatLongDate(createI18n('en').t, date)).toBe('Sat 14 Nov 2026');
    expect(formatLongDate(createI18n('pt-PT').t, date)).toBe('sáb, 14 de nov de 2026');
  });
});

describe('formatMonthYear', () => {
  it('names the month in both languages, capitalised', () => {
    const date = new Date(2026, 10, 14);
    expect(formatMonthYear(createI18n('en').t, date)).toBe('November 2026');
    expect(formatMonthYear(createI18n('pt-PT').t, date)).toBe('Novembro de 2026');
  });
});

describe('formatDateRange', () => {
  const monday = new Date(2026, 10, 9);
  const sunday = new Date(2026, 10, 15);

  it('writes the month once when the period stays in it', () => {
    expect(formatDateRange(createI18n('en').t, monday, sunday)).toBe('Mon 9 to Sun 15 Nov');
    expect(formatDateRange(createI18n('pt-PT').t, monday, sunday)).toBe('seg, 9 a dom, 15 de nov');
  });

  it('writes both months when it crosses one, and never says "Today"', () => {
    const { t } = createI18n('en');
    expect(formatDateRange(t, new Date(2026, 10, 30), new Date(2026, 11, 6))).toBe(
      'Mon 30 Nov to Sun 6 Dec',
    );
    // A period that starts today must still read as dates.
    expect(formatDateRange(t, new Date(), new Date(Date.now() + 6 * 86_400_000))).not.toMatch(
      /Today|Tomorrow/,
    );
  });
});

describe('formatCompactRange', () => {
  it('is short enough for a list name', () => {
    const { t } = createI18n('en');
    expect(formatCompactRange(t, new Date(2026, 10, 9), new Date(2026, 10, 15))).toBe('9–15 Nov');
    expect(formatCompactRange(t, new Date(2026, 10, 30), new Date(2026, 11, 6))).toBe(
      '30 Nov – 6 Dec',
    );
    expect(
      formatCompactRange(createI18n('pt-PT').t, new Date(2026, 10, 9), new Date(2026, 10, 15)),
    ).toBe('9–15 nov');
  });
});
