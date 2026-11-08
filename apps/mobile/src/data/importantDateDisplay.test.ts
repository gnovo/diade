import { IMPORTANT_DATE_TYPES } from '@diade/domain';
import { createI18n, SUPPORTED_LANGUAGES } from '@diade/i18n';
import { describe, expect, it } from 'vitest';
import {
  alertLabel,
  IMPORTANT_DATE_TYPE_ICONS,
  importantDateTypeLabel,
  statusLabel,
} from './importantDateDisplay';

describe('important date display', () => {
  it('has a label (in every language) and an icon for every type', () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const { t } = createI18n(language);
      for (const type of IMPORTANT_DATE_TYPES) {
        expect(importantDateTypeLabel(t, type), `${language}/${type}`).not.toMatch(
          /^importantDates\./,
        );
      }
    }
    for (const type of IMPORTANT_DATE_TYPES) {
      expect(IMPORTANT_DATE_TYPE_ICONS[type]).toBeTruthy();
    }
  });

  describe('in English', () => {
    const { t } = createI18n('en');

    it('words the status with correct plurals', () => {
      expect(statusLabel(t, { kind: 'today', days: 0 })).toBe('Today');
      expect(statusLabel(t, { kind: 'left', days: 1 })).toBe('1 day left');
      expect(statusLabel(t, { kind: 'left', days: 94 })).toBe('94 days left');
      expect(statusLabel(t, { kind: 'since', days: 1753 })).toBe('1753 days since');
    });

    it('words the alert offset', () => {
      expect(alertLabel(t, null)).toBe('None');
      expect(alertLabel(t, 0)).toBe('On the day');
      expect(alertLabel(t, 1)).toBe('1 day before');
      expect(alertLabel(t, 7)).toBe('1 week before');
    });
  });

  describe('in Portuguese', () => {
    const { t } = createI18n('pt-PT');

    it('words the status with correct plurals', () => {
      expect(statusLabel(t, { kind: 'today', days: 0 })).toBe('Hoje');
      expect(statusLabel(t, { kind: 'left', days: 1 })).toBe('falta 1 dia');
      expect(statusLabel(t, { kind: 'left', days: 94 })).toBe('faltam 94 dias');
      expect(statusLabel(t, { kind: 'since', days: 1 })).toBe('há 1 dia');
      expect(statusLabel(t, { kind: 'since', days: 1753 })).toBe('há 1753 dias');
    });

    it('words the alert offset', () => {
      expect(alertLabel(t, null)).toBe('Nenhum');
      expect(alertLabel(t, 0)).toBe('No próprio dia');
      expect(alertLabel(t, 1)).toBe('1 dia antes');
      expect(alertLabel(t, 7)).toBe('1 semana antes');
    });
  });
});
