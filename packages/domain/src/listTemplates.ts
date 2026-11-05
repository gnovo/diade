import type { ListCategory } from './index';

/** Icons a template may use; each is a name from the mobile app's icon set. */
export type ListTemplateIcon = 'shopping-basket' | 'cross' | 'luggage' | 'house' | 'sticky-note';

export type ListTemplateId = 'groceries' | 'pharmacy' | 'packing' | 'household' | 'blank';

export interface ListTemplate {
  id: ListTemplateId;
  category: ListCategory;
  icon: ListTemplateIcon;
  /**
   * Stable ids of the suggested starter items. Display names live in the locale catalogs
   * (`lists.template.<id>.starter.<starterId>`), so templates are translated, not hardcoded.
   */
  starterItems: readonly string[];
}

export const LIST_TEMPLATES: readonly ListTemplate[] = [
  {
    id: 'groceries',
    category: 'groceries',
    icon: 'shopping-basket',
    starterItems: ['milk', 'eggs', 'bread', 'butter', 'fruit', 'vegetables', 'rice', 'pasta'],
  },
  {
    id: 'pharmacy',
    category: 'pharmacy',
    icon: 'cross',
    starterItems: ['paracetamol', 'plasters', 'sunscreen', 'vitamins', 'thermometer'],
  },
  {
    id: 'packing',
    category: 'packing',
    icon: 'luggage',
    starterItems: ['passport', 'chargers', 'toiletries', 'clothes', 'medication', 'sunglasses'],
  },
  {
    id: 'household',
    category: 'household',
    icon: 'house',
    starterItems: ['toiletPaper', 'dishSoap', 'laundryDetergent', 'binBags', 'batteries', 'lightBulbs'],
  },
  { id: 'blank', category: 'other', icon: 'sticky-note', starterItems: [] },
];

export function getListTemplate(id: ListTemplateId): ListTemplate {
  return LIST_TEMPLATES.find((tpl) => tpl.id === id) ?? LIST_TEMPLATES[LIST_TEMPLATES.length - 1];
}

export function isListTemplateIcon(value: string | null): value is ListTemplateIcon {
  return value !== null && LIST_TEMPLATES.some((tpl) => tpl.icon === value);
}

/** The icon a list shows: its own if it has a known one, else its category's default. */
export function listIconFor(list: { icon: string | null; category: ListCategory }): ListTemplateIcon {
  if (isListTemplateIcon(list.icon)) return list.icon;
  return LIST_TEMPLATES.find((tpl) => tpl.category === list.category)?.icon ?? 'sticky-note';
}
