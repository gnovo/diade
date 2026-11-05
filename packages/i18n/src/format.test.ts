import { describe, it, expect } from 'vitest';
import { createI18n } from './i18n';
import { formatDayLabel, formatLongDate, formatMonthYear } from './format';

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
