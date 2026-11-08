import { describe, expect, it } from 'vitest';
import { getListTemplate, LIST_TEMPLATES } from './listTemplates';

describe('list templates', () => {
  it('starts Groceries empty: the meal plan and the frequent items are its suggestions', () => {
    expect(getListTemplate('groceries').starterItems).toEqual([]);
  });

  it('keeps starter checklists where a suggested list is the point', () => {
    for (const id of ['pharmacy', 'packing', 'household'] as const) {
      expect(getListTemplate(id).starterItems.length).toBeGreaterThan(0);
    }
    expect(LIST_TEMPLATES.map((t) => t.id)).toContain('blank');
  });
});
