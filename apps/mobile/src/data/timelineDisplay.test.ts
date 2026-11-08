import { createI18n } from '@diade/i18n';
import { describe, expect, it } from 'vitest';
import { elapsedLabel, spanLabel } from './timelineDisplay';

describe('timeline wording', () => {
  describe('in English', () => {
    const { t } = createI18n('en');

    it('words a span in the largest sensible unit', () => {
      expect(spanLabel(t, { years: 0, months: 0, days: 0 }, 0)).toBe('Same day');
      expect(spanLabel(t, { years: 0, months: 0, days: 5 }, 5)).toBe('5 days');
      expect(spanLabel(t, { years: 0, months: 0, days: 7 }, 7)).toBe('1 week');
      expect(spanLabel(t, { years: 0, months: 1, days: 14 }, 45)).toBe('6 weeks');
      expect(spanLabel(t, { years: 0, months: 3, days: 8 }, 98)).toBe('3 months');
      expect(spanLabel(t, { years: 1, months: 4, days: 12 }, 498)).toBe('1 year 4 months');
      expect(spanLabel(t, { years: 6, months: 0, days: 3 }, 2192)).toBe('6 years');
    });

    it('rounds spare days up to the next month, rolling a year over', () => {
      expect(spanLabel(t, { years: 0, months: 1, days: 29 }, 60)).toBe('2 months');
      expect(spanLabel(t, { years: 1, months: 11, days: 25 }, 755)).toBe('2 years');
    });

    it('lists every non-zero part of the time together', () => {
      expect(elapsedLabel(t, { years: 6, months: 2, days: 21 })).toBe(
        '6 years · 2 months · 21 days',
      );
      expect(elapsedLabel(t, { years: 1, months: 0, days: 0 })).toBe('1 year');
      expect(elapsedLabel(t, { years: 0, months: 0, days: 0 })).toBe('0 days');
    });

    it('words the timeline labels with correct plurals', () => {
      expect(t('us.timeline.together', { count: 1 })).toBe('1 year together');
      expect(t('us.timeline.together', { count: 7 })).toBe('7 years together');
      expect(t('us.timeline.ago', { duration: '3 months' })).toBe('3 months ago');
    });
  });

  describe('in Portuguese', () => {
    const { t } = createI18n('pt-PT');

    it('words a span with correct plurals', () => {
      expect(spanLabel(t, { years: 0, months: 0, days: 7 }, 7)).toBe('1 semana');
      expect(spanLabel(t, { years: 1, months: 4, days: 12 }, 498)).toBe('1 ano 4 meses');
      expect(elapsedLabel(t, { years: 6, months: 1, days: 1 })).toBe('6 anos · 1 mês · 1 dia');
    });

    it('words the timeline labels', () => {
      expect(t('us.timeline.together', { count: 1 })).toBe('1 ano juntos');
      expect(t('us.timeline.ago', { duration: '3 meses' })).toBe('há 3 meses');
    });
  });
});
