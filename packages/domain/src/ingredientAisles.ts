/**
 * Which supermarket aisle an ingredient or list item is in, from its name alone (English and Portuguese). Plain words, no data to
 * sync: a name is split into words and the first rule that recognises one of them decides, so order matters (a canned fish is
 * pantry, not fish; frozen spinach is frozen, not produce). It is a convenience for grouping a shopping list, not a catalog:
 * a name it does not know is `other`.
 */

import { normalizeIngredientName } from './recipes';

export type Aisle =
  | 'produce'
  | 'bakery'
  | 'meat'
  | 'fish'
  | 'dairy'
  | 'frozen'
  | 'pantry'
  | 'other';

/** The order a shopper meets them in. */
export const AISLE_ORDER: readonly Aisle[] = [
  'produce',
  'bakery',
  'meat',
  'fish',
  'dairy',
  'frozen',
  'pantry',
  'other',
];

interface Rule {
  aisle: Aisle;
  /** Words that match as a whole (with an optional plural "s"): short or ambiguous ones. */
  words?: readonly string[];
  /** Word beginnings (at least four letters): they match every form of the word. */
  stems?: readonly string[];
  /** Phrases that must appear in the name, accents removed. */
  phrases?: readonly string[];
}

const RULES: readonly Rule[] = [
  // Frozen first: "frozen spinach" is not produce. Cauliflower rice is bought frozen.
  {
    aisle: 'frozen',
    stems: ['congelad', 'frozen', 'gelado', 'ice'],
    phrases: ['arroz de couve', 'cauliflower rice'],
  },
  // Canned or jarred goods before the food they hold: "sardinhas escorridas" is a tin.
  {
    aisle: 'pantry',
    stems: [
      'conserva',
      'escorrid',
      'drained',
      'passata',
      'triturad',
      'pelado',
      'polpa',
      'pesto',
      'mostard',
      'mustard',
      'ketchup',
      'maionese',
      'mayonnaise',
      'molho',
      'sauce',
    ],
    words: ['lata', 'tin', 'can', 'cubos', 'cubes', 'chopped'],
    phrases: ['tomate em cubos', 'chopped tomato'],
  },
  {
    aisle: 'fish',
    stems: [
      'peixe',
      'fish',
      'atum',
      'tuna',
      'sardinh',
      'cavala',
      'mackerel',
      'pescada',
      'hake',
      'salmao',
      'salmon',
      'bacalhau',
      'cod',
      'camarao',
      'camaroes',
      'shrimp',
      'prawn',
      'lula',
      'polvo',
      'dourada',
      'robalo',
      'linguado',
      'carapau',
      'gamba',
      'marisco',
    ],
  },
  {
    aisle: 'bakery',
    stems: [
      'tortilha',
      'tortilla',
      'wrap',
      'brioche',
      'baguete',
      'baguette',
      'croissant',
      'bolo',
      'cake',
      'bread',
      'bun',
    ],
    words: ['pao', 'paes', 'pita', 'naan', 'torrada', 'torradas', 'toast'],
  },
  {
    aisle: 'meat',
    stems: [
      'frango',
      'chicken',
      'carne',
      'beef',
      'vaca',
      'porco',
      'pork',
      'bife',
      'mince',
      'picad',
      'peru',
      'turkey',
      'fiambre',
      'presunto',
      'chourico',
      'bacon',
      'salsicha',
      'sausage',
      'lombo',
      'entrecosto',
      'borrego',
      'lamb',
      'hamburguer',
      'hambúrguer',
      'costeleta',
      'chicken',
    ],
    words: ['ham', 'pato', 'duck', 'coelho', 'rabbit', 'vitela', 'veal'],
  },
  {
    aisle: 'dairy',
    stems: [
      'iogurte',
      'yoghurt',
      'yogurt',
      'leite',
      'milk',
      'queijo',
      'cheese',
      'manteiga',
      'butter',
      'natas',
      'cream',
      'mozzarella',
      'parmesao',
      'parmesan',
      'skyr',
      'requeijao',
      'cottage',
      'ricotta',
      'kefir',
      'margarina',
    ],
    words: ['ovo', 'egg', 'nata'],
  },
  {
    aisle: 'pantry',
    stems: [
      'arroz',
      'rice',
      'massa',
      'pasta',
      'esparguete',
      'spaghetti',
      'macarrao',
      'noodle',
      'aveia',
      'oats',
      'farinha',
      'flour',
      'acucar',
      'sugar',
      'azeite',
      'oliv',
      'vinagre',
      'vinegar',
      'salt',
      'pimenta',
      'paprika',
      'colorau',
      'cumin',
      'cominho',
      'oregan',
      'oregao',
      'canela',
      'cinnamon',
      'honey',
      'chia',
      'lentilha',
      'lentil',
      'grao',
      'chickpea',
      'feijao',
      'bean',
      'amendoim',
      'peanut',
      'nozes',
      'walnut',
      'amendoa',
      'almond',
      'cereal',
      'bolacha',
      'biscuit',
      'chocolate',
      'cacau',
      'cocoa',
      'fermento',
      'yeast',
      'especiaria',
      'spice',
      'ervas',
      'herbs',
      'caldo',
      'stock',
      'cafe',
      'coffee',
      'sementes',
      'seeds',
      'louro',
      'bay',
      'piri',
      'malagueta',
      'chilli',
      'chili',
    ],
    words: ['oil', 'mel', 'sal', 'cha', 'tea'],
    phrases: ['black pepper', 'white pepper'],
  },
  {
    aisle: 'produce',
    stems: [
      'batata',
      'potato',
      'cebola',
      'onion',
      'alho',
      'garlic',
      'tomate',
      'tomato',
      'alface',
      'lettuce',
      'pepino',
      'cucumber',
      'espinafre',
      'spinach',
      'pimento',
      'peppers',
      'limao',
      'lemon',
      'lima',
      'lime',
      'banana',
      'maca',
      'apple',
      'laranja',
      'orange',
      'cenoura',
      'carrot',
      'courgette',
      'curgete',
      'zucchini',
      'beringela',
      'aubergine',
      'eggplant',
      'cogumelo',
      'mushroom',
      'salsa',
      'parsley',
      'coentro',
      'cilantro',
      'coriander',
      'manjericao',
      'basil',
      'hortela',
      'mint',
      'couve',
      'cabbage',
      'broccoli',
      'brocolo',
      'abobora',
      'pumpkin',
      'fruta',
      'fruit',
      'legume',
      'vegetable',
      'morango',
      'strawberr',
      'uva',
      'grape',
      'pera',
      'pear',
      'melao',
      'melancia',
      'abacate',
      'avocado',
      'gengibre',
      'ginger',
      'alho-franc',
      'leek',
      'aipo',
      'celery',
      'rucula',
      'rocket',
      'agriao',
      'raspa',
      'zest',
      'ananas',
      'pineapple',
      'kiwi',
      'beterraba',
      'beet',
      'nabo',
      'ervilha',
    ],
    words: ['fig', 'figo', 'pea', 'peas', 'rabano'],
    phrases: ['bell pepper', 'red pepper', 'green pepper', 'yellow pepper'],
  },
];

const stripPlural = (word: string): string =>
  word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word;

/** The aisle a name belongs in. */
export function aisleOf(name: string): Aisle {
  const normalized = normalizeIngredientName(name);
  if (!normalized) return 'other';
  const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);
  for (const rule of RULES) {
    if (rule.phrases?.some((phrase) => normalized.includes(phrase))) return rule.aisle;
    for (const token of tokens) {
      if (rule.words?.some((word) => token === word || stripPlural(token) === word))
        return rule.aisle;
      if (rule.stems?.some((stem) => token.startsWith(stem))) return rule.aisle;
    }
  }
  return 'other';
}

/**
 * The items grouped by aisle in shopping order, each group keeping the items' own order. An aisle with nothing in it is left out.
 */
export function groupByAisle<T extends { name: string }>(
  items: readonly T[],
): Array<{ aisle: Aisle; items: T[] }> {
  const byAisle = new Map<Aisle, T[]>();
  for (const item of items) {
    const aisle = aisleOf(item.name);
    byAisle.set(aisle, [...(byAisle.get(aisle) ?? []), item]);
  }
  return AISLE_ORDER.flatMap((aisle) => {
    const group = byAisle.get(aisle);
    return group ? [{ aisle, items: group }] : [];
  });
}
