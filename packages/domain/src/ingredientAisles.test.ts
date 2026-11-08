import { describe, expect, it } from 'vitest';
import { AISLE_ORDER, type Aisle, aisleOf, groupByAisle } from './ingredientAisles';

const cases: Array<[Aisle, string[]]> = [
  [
    'produce',
    [
      'Tomate',
      'Tomatoes',
      'Batatas',
      'Cebola',
      'Alho',
      '2 dentes de alho',
      'Salsa',
      'Spinach',
      'Limão',
      'Raspa de limão',
      'Banana pequena',
      'Pimento',
      'Bell peppers',
      'Pepino',
      'Alface',
    ],
  ],
  [
    'bakery',
    [
      'Pão',
      'Pão integral',
      'Pão de hambúrguer',
      'Burger bun',
      'Tortilha grande',
      'Wholegrain tortilla',
    ],
  ],
  [
    'meat',
    [
      'Peito de frango',
      'Chicken breast',
      'Carne de vaca picada magra',
      'Lean beef mince',
      'Cooked lean pork',
      'Frango cozido desfiado',
      'Bacon',
    ],
  ],
  ['fish', ['Cavala', 'Mackerel', 'Peixe', 'Salmão', 'Camarão']],
  [
    'dairy',
    [
      'Ovos',
      'Eggs',
      'Leite meio-gordo',
      'Milk',
      'Iogurte grego natural',
      'Queijo mozzarella',
      'Manteiga',
      'Natural Greek yoghurt',
    ],
  ],
  [
    'frozen',
    [
      'Espinafres congelados',
      'Frozen spinach',
      'Pimentos congelados',
      'Frutos vermelhos congelados',
      'Pescada congelada',
      'Arroz de couve-flor',
      'Cauliflower rice',
    ],
  ],
  [
    'pantry',
    [
      'Arroz',
      'Massa integral',
      'Aveia',
      'Azeite',
      'Sal',
      'Pimenta preta',
      'Black pepper',
      'Paprika',
      'Lentilhas cozidas',
      'Grão-de-bico cozido',
      'Feijão cozido',
      'Mel',
      'Pesto',
      'Mostarda',
      'Mustard',
      'Polpa de tomate',
      'Tomate em cubos',
      'Chopped tomatoes',
      'Lata de atum',
      'Sardinhas escorridas',
      'Folha de louro',
      'Amendoins sem sal',
      'Sementes de chia',
    ],
  ],
  ['other', ['Água', 'Water', 'Pensos rápidos', '', '   ']],
];

describe('aisleOf', () => {
  for (const [aisle, names] of cases) {
    it(`puts ${aisle} names in ${aisle}`, () => {
      for (const name of names) expect([name, aisleOf(name)]).toEqual([name, aisle]);
    });
  }

  it('lets frozen and canned win over the food they hold, and a word inside another word not count', () => {
    expect(aisleOf('Spinach')).toBe('produce');
    expect(aisleOf('Frozen spinach')).toBe('frozen');
    expect(aisleOf('Atum')).toBe('fish');
    expect(aisleOf('Lata de atum')).toBe('pantry');
    expect(aisleOf('Salada')).not.toBe('pantry'); // "sal" is only the word salt
    expect(aisleOf('Melancia')).toBe('produce'); // "mel" is only the word honey
  });

  it('ignores case, accents and a trailing plural', () => {
    expect(aisleOf('LEITE')).toBe('dairy');
    expect(aisleOf('pão')).toBe('bakery');
    expect(aisleOf('Eggs')).toBe('dairy');
    expect(aisleOf('Onions')).toBe('produce');
  });

  it('lists every aisle once, in shopping order, ending with other', () => {
    expect(new Set(AISLE_ORDER).size).toBe(AISLE_ORDER.length);
    expect(AISLE_ORDER[0]).toBe('produce');
    expect(AISLE_ORDER.at(-1)).toBe('other');
  });
});

describe('groupByAisle', () => {
  const item = (name: string) => ({ name });

  it('groups in shopping order, keeping each group in the items own order, and leaves empty aisles out', () => {
    const groups = groupByAisle(['Leite', 'Alface', 'Água', 'Tomate', 'Pão', 'Ovos'].map(item));
    expect(groups.map((g) => [g.aisle, g.items.map((i) => i.name)])).toEqual([
      ['produce', ['Alface', 'Tomate']],
      ['bakery', ['Pão']],
      ['dairy', ['Leite', 'Ovos']],
      ['other', ['Água']],
    ]);
  });

  it('is empty for no items', () => {
    expect(groupByAisle([])).toEqual([]);
  });
});
