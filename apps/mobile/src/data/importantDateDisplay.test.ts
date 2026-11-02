import { describe, it, expect } from 'vitest';
import { IMPORTANT_DATE_TYPES } from '@diade/domain';
import { IMPORTANT_DATE_TYPE_META, alertLabel, statusLabel } from './importantDateDisplay';

describe('important date display', () => {
  it('has a label and icon for every type', () => {
    for (const type of IMPORTANT_DATE_TYPES) {
      expect(IMPORTANT_DATE_TYPE_META[type].label).toBeTruthy();
      expect(IMPORTANT_DATE_TYPE_META[type].icon).toBeTruthy();
    }
  });

  it('words the status with correct plurals', () => {
    expect(statusLabel({ kind: 'today', days: 0 })).toBe('Today');
    expect(statusLabel({ kind: 'left', days: 1 })).toBe('1 day left');
    expect(statusLabel({ kind: 'left', days: 94 })).toBe('94 days left');
    expect(statusLabel({ kind: 'since', days: 1753 })).toBe('1753 days since');
  });

  it('words the alert offset', () => {
    expect(alertLabel(null)).toBe('None');
    expect(alertLabel(0)).toBe('On the day');
    expect(alertLabel(1)).toBe('1 day before');
    expect(alertLabel(7)).toBe('1 week before');
  });
});
