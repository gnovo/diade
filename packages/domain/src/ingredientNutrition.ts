/**
 * Calories and protein for recipes, computed from their ingredients.
 *
 * A built-in table gives kcal and protein per 100 g for common ingredients (values from INSA's Tabela da
 * Composição de Alimentos where it has the food, USDA FoodData Central otherwise; rounded, as the recipes
 * are estimates too). A line is matched to it by name through the ingredient resolver, so the dictionary's
 * synonyms and the household's merges apply. The household's own value, kept on its catalog entry, wins.
 *
 * Raw and cooked are different foods ("peito de frango" is raw, "frango cozido" is cooked), and so are tinned
 * and dried ones: a name that does not say which is left out rather than guessed.
 */

import { DEFAULT_RESOLVER, type IngredientResolver } from './ingredientCatalog';
import type { Recipe, RecipeIngredient } from './recipes';

/** What one ingredient is worth. `gramsPerUnit` turns "2 ovos" into grams; `density` turns ml into grams. */
export interface NutritionValues {
  kcalPer100g: number;
  proteinPer100g: number;
  gramsPerUnit: number | null;
  /** Grams per ml, for `ml`, `l` and spoons: 1 unless the table says otherwise. */
  density: number;
}

export interface IngredientNutrition extends NutritionValues {
  /** `household` when the household set the kcal or the protein; `builtIn` when both come from the table. */
  source: 'household' | 'builtIn';
}

/** A recipe's own per-serving values, typed by a member: they win over the computed ones. */
export interface RecipeNutritionOverride {
  kcal: number;
  protein: number;
}

export interface Macros {
  kcal: number;
  protein: number;
}

interface TableEntry {
  /** Every spelling the entry answers to: Portuguese and English, singular and plural where they differ. */
  names: readonly string[];
  kcal: number;
  protein: number;
  /** Grams of one, as bought or prepared (an egg without its shell, a drained tin of tuna). */
  unit?: number;
  density?: number;
}

/** Per 100 g, edible part. Keep each group's names to one food: two entries are better than a wrong value. */
const TABLE: readonly TableEntry[] = [
  // Meat and eggs
  {
    names: [
      'peito de frango',
      'peitos de frango',
      'chicken breast',
      'chicken breasts',
      'bife de frango',
    ],
    kcal: 110,
    protein: 23,
  },
  {
    names: [
      'frango cozido desfiado',
      'frango cozido',
      'frango desfiado',
      'cooked chicken',
      'shredded chicken',
      'cooked chicken breast',
    ],
    kcal: 165,
    protein: 31,
  },
  {
    names: [
      'coxa de frango',
      'coxas de frango',
      'chicken thigh',
      'chicken thighs',
      'perna de frango',
    ],
    kcal: 175,
    protein: 19,
  },
  { names: ['peito de peru', 'bife de peru', 'turkey breast'], kcal: 105, protein: 24 },
  {
    names: ['peru picado', 'carne de peru picada', 'turkey mince', 'ground turkey'],
    kcal: 150,
    protein: 20,
  },
  { names: ['fiambre de peru', 'turkey ham', 'sliced turkey'], kcal: 105, protein: 18 },
  {
    names: [
      'carne de vaca picada magra',
      'carne picada magra',
      'lean beef mince',
      'lean ground beef',
    ],
    kcal: 170,
    protein: 20.5,
  },
  {
    names: ['carne de vaca picada', 'carne picada', 'beef mince', 'ground beef'],
    kcal: 250,
    protein: 18,
  },
  { names: ['bife da vazia', 'bife de vaca', 'sirloin', 'beef steak'], kcal: 160, protein: 22 },
  { names: ['lombo de porco', 'pork loin'], kcal: 145, protein: 21 },
  {
    names: ['carne de porco magra cozida', 'porco cozido', 'cooked lean pork', 'cooked pork loin'],
    kcal: 190,
    protein: 28,
  },
  { names: ['presunto', 'cured ham', 'prosciutto'], kcal: 260, protein: 27 },
  { names: ['chourico', 'chorizo'], kcal: 455, protein: 24 },
  { names: ['ovo', 'ovos', 'egg', 'eggs'], kcal: 143, protein: 12.6, unit: 55 },
  {
    names: ['clara de ovo', 'claras de ovo', 'claras', 'egg white', 'egg whites'],
    kcal: 52,
    protein: 10.9,
    unit: 33,
  },

  // Fish
  { names: ['pescada', 'pescada congelada', 'hake'], kcal: 76, protein: 17 },
  { names: ['peixe', 'peixe branco', 'white fish'], kcal: 85, protein: 18 },
  { names: ['bacalhau demolhado', 'salted cod soaked', 'desalted cod'], kcal: 80, protein: 18 },
  { names: ['salmao', 'salmon', 'salmon fillet'], kcal: 200, protein: 20 },
  { names: ['cavala', 'mackerel'], kcal: 170, protein: 19 },
  { names: ['dourada', 'sea bream'], kcal: 115, protein: 20 },
  { names: ['robalo', 'sea bass'], kcal: 100, protein: 19 },
  { names: ['camarao', 'gambas', 'shrimp', 'prawns'], kcal: 85, protein: 19 },
  {
    names: ['lata de atum', 'latas de atum', 'tin of tuna', 'can of tuna'],
    kcal: 130,
    protein: 26,
    unit: 80,
  },
  {
    names: ['atum ao natural', 'atum em agua', 'atum escorrido', 'tuna in water', 'canned tuna'],
    kcal: 130,
    protein: 26,
  },
  { names: ['atum em azeite', 'tuna in oil'], kcal: 200, protein: 27 },
  {
    names: ['sardinhas escorridas', 'sardinhas em lata', 'sardinha em lata', 'canned sardines'],
    kcal: 210,
    protein: 24.5,
  },
  { names: ['sardinha', 'sardinhas', 'sardine', 'sardines'], kcal: 150, protein: 20 },

  // Dairy
  {
    names: ['leite meio-gordo', 'leite meio gordo', 'semi-skimmed milk'],
    kcal: 46,
    protein: 3.3,
    density: 1.03,
  },
  { names: ['leite magro', 'skimmed milk', 'skim milk'], kcal: 35, protein: 3.4, density: 1.03 },
  { names: ['leite gordo', 'leite inteiro', 'whole milk'], kcal: 64, protein: 3.2, density: 1.03 },
  // Portuguese supermarket "iogurte grego" is creamy, not strained: little protein. Skyr and 0 % Greek are different.
  {
    names: ['iogurte grego natural', 'iogurte grego', 'greek-style yoghurt', 'greek style yogurt'],
    kcal: 115,
    protein: 4,
  },
  {
    names: [
      'iogurte grego 0%',
      'iogurte grego magro',
      'greek yogurt 0%',
      'fat-free greek yogurt',
      '0% greek yoghurt',
    ],
    kcal: 57,
    protein: 10,
  },
  { names: ['skyr', 'skyr natural', 'iogurte skyr'], kcal: 63, protein: 11 },
  {
    names: ['iogurte natural', 'iogurte natural magro', 'plain yogurt', 'natural yoghurt'],
    kcal: 45,
    protein: 4.5,
  },
  { names: ['queijo fresco', 'queijo fresco magro', 'fresh cheese'], kcal: 160, protein: 11 },
  { names: ['requeijao', 'ricotta'], kcal: 150, protein: 10 },
  { names: ['queijo cottage', 'cottage cheese', 'cottage'], kcal: 98, protein: 11 },
  { names: ['quark', 'queijo quark'], kcal: 67, protein: 12 },
  { names: ['queijo mozzarella', 'mozzarella', 'mozarela'], kcal: 280, protein: 20 },
  { names: ['queijo mozzarella light', 'mozzarella light'], kcal: 165, protein: 20 },
  {
    names: ['queijo parmesao ralado', 'parmesao ralado', 'parmesao', 'parmesan', 'grated parmesan'],
    kcal: 400,
    protein: 33,
  },
  { names: ['queijo feta', 'feta'], kcal: 265, protein: 14 },
  { names: ['queijo flamengo', 'edam', 'gouda'], kcal: 350, protein: 25 },
  { names: ['natas', 'cream', 'natas para culinaria'], kcal: 200, protein: 2.5, density: 1 },
  { names: ['natas light', 'light cream'], kcal: 120, protein: 3, density: 1 },
  { names: ['manteiga', 'butter'], kcal: 740, protein: 0.6 },
  { names: ['whey', 'proteina whey', 'whey protein', 'protein powder'], kcal: 380, protein: 78 },

  // Grains, bread, pasta (dry weight unless it says cooked)
  {
    names: ['arroz', 'rice', 'arroz agulha', 'arroz basmati', 'basmati rice'],
    kcal: 360,
    protein: 6.7,
  },
  { names: ['arroz cozido', 'cooked rice'], kcal: 130, protein: 2.7 },
  { names: ['arroz integral', 'brown rice'], kcal: 360, protein: 7.5 },
  {
    names: ['massa', 'pasta', 'esparguete', 'spaghetti', 'penne', 'fusilli'],
    kcal: 360,
    protein: 12.5,
  },
  { names: ['massa integral', 'wholewheat pasta', 'whole wheat pasta'], kcal: 350, protein: 13 },
  {
    names: ['aveia', 'flocos de aveia', 'oats', 'rolled oats', 'porridge oats'],
    kcal: 370,
    protein: 13,
  },
  { names: ['quinoa'], kcal: 368, protein: 14 },
  { names: ['cuscuz', 'couscous'], kcal: 360, protein: 13 },
  { names: ['bulgur'], kcal: 342, protein: 12 },
  { names: ['pao integral', 'wholemeal bread', 'whole wheat bread'], kcal: 240, protein: 10 },
  { names: ['pao', 'bread', 'pao de forma', 'sliced bread'], kcal: 265, protein: 9 },
  {
    names: ['pao de hamburguer', 'paes de hamburguer', 'burger bun', 'burger buns'],
    kcal: 270,
    protein: 9,
    unit: 60,
  },
  {
    names: [
      'tortilha grande',
      'tortilhas grandes',
      'wrap',
      'wraps',
      'large tortilla',
      'flour tortilla',
    ],
    kcal: 300,
    protein: 8.5,
    unit: 62,
  },
  {
    names: ['tortilha integral', 'tortilhas integrais', 'wholewheat wrap', 'whole wheat tortilla'],
    kcal: 290,
    protein: 9,
    unit: 60,
  },
  {
    names: ['tortilha proteica', 'wrap proteico', 'protein wrap', 'high protein wrap'],
    kcal: 260,
    protein: 20,
    unit: 60,
  },
  { names: ['farinha', 'flour', 'farinha de trigo', 'wheat flour'], kcal: 350, protein: 10 },

  // Legumes (cooked or tinned and drained, unless it says dry)
  {
    names: ['grao-de-bico cozido', 'grao de bico cozido', 'cooked chickpeas', 'canned chickpeas'],
    kcal: 120,
    protein: 7,
  },
  {
    names: [
      'feijao cozido',
      'feijao vermelho cozido',
      'feijao preto cozido',
      'cooked beans',
      'canned beans',
    ],
    kcal: 110,
    protein: 7.5,
  },
  { names: ['lentilhas cozidas', 'cooked lentils'], kcal: 116, protein: 9 },
  {
    names: ['lentilhas', 'lentilhas secas', 'lentils', 'dry lentils', 'red lentils'],
    kcal: 350,
    protein: 24,
  },
  { names: ['ervilhas', 'ervilhas congeladas', 'peas', 'frozen peas'], kcal: 80, protein: 5.4 },
  { names: ['edamame'], kcal: 120, protein: 11 },
  { names: ['tofu', 'tofu firme', 'firm tofu'], kcal: 145, protein: 15 },
  { names: ['hummus', 'humus'], kcal: 250, protein: 7 },

  // Vegetables
  {
    names: ['batata', 'batatas', 'potato', 'potatoes', 'batatas em gomos', 'potato wedges'],
    kcal: 77,
    protein: 2,
    unit: 170,
  },
  {
    names: ['batata doce', 'batatas doces', 'sweet potato', 'sweet potatoes'],
    kcal: 86,
    protein: 1.6,
    unit: 150,
  },
  {
    names: ['arroz de couve-flor', 'arroz de couve flor', 'cauliflower rice'],
    kcal: 25,
    protein: 1.9,
  },
  { names: ['couve-flor', 'couve flor', 'cauliflower'], kcal: 25, protein: 1.9 },
  { names: ['brocolos', 'broccoli'], kcal: 34, protein: 2.8 },
  {
    names: ['espinafres congelados', 'espinafres', 'espinafre', 'spinach', 'frozen spinach'],
    kcal: 29,
    protein: 3.6,
  },
  {
    names: [
      'pimentos congelados',
      'pimento',
      'pimentos',
      'bell pepper',
      'bell peppers',
      'pimento vermelho',
      'red pepper',
    ],
    kcal: 26,
    protein: 1,
    unit: 150,
  },
  {
    names: ['cebola', 'cebolas', 'onion', 'onions', 'cebola roxa', 'red onion'],
    kcal: 40,
    protein: 1.1,
    unit: 150,
  },
  {
    names: ['alho', 'garlic', 'dente de alho', 'dentes de alho', 'garlic clove', 'garlic cloves'],
    kcal: 149,
    protein: 6.4,
    unit: 5,
  },
  { names: ['tomate', 'tomates', 'tomato', 'tomatoes'], kcal: 18, protein: 0.9, unit: 120 },
  {
    names: ['tomate cherry', 'cherry tomatoes', 'cherry tomato'],
    kcal: 18,
    protein: 0.9,
    unit: 15,
  },
  {
    names: [
      'tomate em cubos',
      'tomate pelado',
      'chopped tomatoes',
      'tinned tomatoes',
      'canned tomatoes',
    ],
    kcal: 21,
    protein: 1.1,
  },
  { names: ['polpa de tomate', 'passata', 'tomato passata'], kcal: 30, protein: 1.4 },
  { names: ['beringela', 'beringelas', 'aubergine', 'eggplant'], kcal: 25, protein: 1, unit: 300 },
  { names: ['curgete', 'courgette', 'zucchini'], kcal: 17, protein: 1.2, unit: 250 },
  { names: ['cenoura', 'cenouras', 'carrot', 'carrots'], kcal: 41, protein: 0.9, unit: 80 },
  {
    names: ['cogumelos', 'cogumelo', 'mushrooms', 'mushroom', 'cogumelos laminados'],
    kcal: 22,
    protein: 3.1,
  },
  { names: ['alface', 'lettuce'], kcal: 15, protein: 1.4 },
  { names: ['pepino', 'cucumber'], kcal: 15, protein: 0.7, unit: 300 },
  { names: ['couve', 'couve portuguesa', 'cabbage'], kcal: 25, protein: 1.3 },
  { names: ['feijao verde', 'green beans'], kcal: 31, protein: 1.8 },
  { names: ['milho', 'corn', 'sweetcorn', 'milho em lata'], kcal: 85, protein: 2.9 },
  { names: ['salsa', 'parsley'], kcal: 36, protein: 3 },
  { names: ['coentros', 'coentro', 'coriander'], kcal: 23, protein: 2.1 },
  { names: ['gengibre', 'ginger'], kcal: 80, protein: 1.8 },
  { names: ['abacate', 'avocado'], kcal: 160, protein: 2, unit: 150 },

  // Fruit
  { names: ['banana', 'bananas'], kcal: 89, protein: 1.1, unit: 120 },
  {
    names: ['banana pequena', 'bananas pequenas', 'small banana'],
    kcal: 89,
    protein: 1.1,
    unit: 90,
  },
  { names: ['maca', 'macas', 'apple', 'apples'], kcal: 52, protein: 0.3, unit: 150 },
  {
    names: [
      'frutos vermelhos congelados',
      'frutos vermelhos',
      'mixed berries',
      'frozen berries',
      'berries',
    ],
    kcal: 45,
    protein: 1,
  },
  { names: ['mirtilos', 'blueberries'], kcal: 57, protein: 0.7 },
  { names: ['morangos', 'strawberries'], kcal: 32, protein: 0.7 },
  { names: ['laranja', 'laranjas', 'orange', 'oranges'], kcal: 47, protein: 0.9, unit: 180 },
  { names: ['limao', 'limoes', 'lemon', 'lemons'], kcal: 29, protein: 1.1, unit: 100 },
  { names: ['sumo de limao', 'lemon juice'], kcal: 22, protein: 0.4 },

  // Nuts, seeds, oils, sweet things
  {
    names: ['azeite', 'olive oil', 'azeite virgem extra', 'extra virgin olive oil'],
    kcal: 884,
    protein: 0,
    density: 0.91,
  },
  {
    names: ['oleo', 'vegetable oil', 'oleo vegetal', 'sunflower oil'],
    kcal: 884,
    protein: 0,
    density: 0.92,
  },
  {
    names: ['amendoins sem sal', 'amendoins', 'amendoim', 'peanuts', 'unsalted peanuts'],
    kcal: 585,
    protein: 24,
  },
  { names: ['manteiga de amendoim', 'peanut butter'], kcal: 590, protein: 25 },
  { names: ['amendoas', 'almonds'], kcal: 580, protein: 21 },
  { names: ['nozes', 'walnuts'], kcal: 650, protein: 15 },
  { names: ['sementes de chia', 'chia', 'chia seeds'], kcal: 486, protein: 17 },
  { names: ['mel', 'honey'], kcal: 304, protein: 0.3, density: 1.42 },
  { names: ['acucar', 'sugar'], kcal: 400, protein: 0 },
  { names: ['chocolate negro', 'dark chocolate'], kcal: 580, protein: 8 },

  // Sauces and seasoning (a "to taste" line counts as nothing, so these matter only when measured)
  { names: ['pesto', 'molho pesto', 'pesto sauce'], kcal: 440, protein: 5 },
  { names: ['mostarda', 'mustard'], kcal: 66, protein: 4 },
  { names: ['maionese', 'mayonnaise', 'mayo'], kcal: 680, protein: 1 },
  { names: ['maionese light', 'light mayonnaise'], kcal: 280, protein: 1 },
  { names: ['ketchup'], kcal: 110, protein: 1.2 },
  { names: ['molho de soja', 'soy sauce'], kcal: 55, protein: 8, density: 1.15 },
  { names: ['vinagre', 'vinegar', 'vinagre balsamico', 'balsamic vinegar'], kcal: 20, protein: 0 },
  { names: ['caldo de galinha', 'chicken stock', 'chicken broth'], kcal: 5, protein: 0.6 },
  { names: ['paprika', 'colorau'], kcal: 280, protein: 14 },
  { names: ['cominhos', 'cumin'], kcal: 375, protein: 18 },
  { names: ['canela', 'cinnamon'], kcal: 247, protein: 4 },
  { names: ['oregaos', 'oregano'], kcal: 265, protein: 9 },
  { names: ['pimenta preta', 'black pepper'], kcal: 250, protein: 10 },
  {
    names: ['folha de louro', 'folhas de louro', 'louro', 'bay leaf', 'bay leaves'],
    kcal: 313,
    protein: 7.6,
    unit: 0.2,
  },
  { names: ['sal', 'salt', 'agua', 'water'], kcal: 0, protein: 0 },
];

/** The table by match key, as the built-in dictionary resolves each name. */
const BUILT_IN: ReadonlyMap<string, TableEntry> = new Map(
  TABLE.flatMap((entry) =>
    entry.names.map((name): [string, TableEntry] => [DEFAULT_RESOLVER.key(name), entry]),
  ),
);

/** For tests: every name in the table with the key it answers to. */
export function builtInNutritionKeys(): Array<{ name: string; key: string; entry: number }> {
  return TABLE.flatMap((entry, index) =>
    entry.names.map((name) => ({ name, key: DEFAULT_RESOLVER.key(name), entry: index })),
  );
}

/** What the table and the household know about a written name, or null when nobody knows its kcal and protein. */
export function ingredientNutrition(
  name: string,
  resolver: IngredientResolver = DEFAULT_RESOLVER,
): IngredientNutrition | null {
  const key = resolver.key(name);
  const table = BUILT_IN.get(key) ?? BUILT_IN.get(DEFAULT_RESOLVER.key(name)) ?? null;
  const own = resolver.nutrition(key);
  const kcal = own?.kcalPer100g ?? table?.kcal ?? null;
  const protein = own?.proteinPer100g ?? table?.protein ?? null;
  if (kcal === null || protein === null) return null;
  return {
    kcalPer100g: kcal,
    proteinPer100g: protein,
    gramsPerUnit: own?.gramsPerUnit ?? table?.unit ?? null,
    density: table?.density ?? 1,
    source:
      own && (own.kcalPer100g !== null || own.proteinPer100g !== null) ? 'household' : 'builtIn',
  };
}

/** The built-in values alone, for showing what "Reset" goes back to. */
export function builtInNutrition(name: string): NutritionValues | null {
  const entry = BUILT_IN.get(DEFAULT_RESOLVER.key(name));
  if (!entry) return null;
  return {
    kcalPer100g: entry.kcal,
    proteinPer100g: entry.protein,
    gramsPerUnit: entry.unit ?? null,
    density: entry.density ?? 1,
  };
}

const ML: Partial<Record<RecipeIngredient['unit'], number>> = { ml: 1, l: 1000, tbsp: 15, tsp: 5 };

/**
 * Whether a line is measured: "to taste" and a pinch are not, and count as nothing (they neither add calories
 * nor lower the coverage).
 */
export const isMeasured = (line: Pick<RecipeIngredient, 'quantity' | 'unit'>): boolean =>
  line.quantity !== null && line.quantity > 0 && line.unit !== 'pinch';

/** The grams a measured line weighs, or null when it is counted and nobody knows the weight of one. */
export function lineGrams(
  line: Pick<RecipeIngredient, 'quantity' | 'unit'>,
  values: Pick<NutritionValues, 'gramsPerUnit' | 'density'>,
): number | null {
  if (!isMeasured(line) || line.quantity === null) return 0;
  if (line.unit === 'g') return line.quantity;
  if (line.unit === 'kg') return line.quantity * 1000;
  if (line.unit === 'unit')
    return values.gramsPerUnit === null ? null : line.quantity * values.gramsPerUnit;
  const ml = ML[line.unit];
  return ml === undefined ? null : line.quantity * ml * values.density;
}

export interface RecipeNutrition {
  /** Per serving, from the lines that are known; null when none is. */
  computed: Macros | null;
  /** What to show: the recipe's override when it has one, else the computed values. */
  perServing: Macros | null;
  overridden: boolean;
  /** Known measured lines and all measured lines: coverage is one over the other. */
  known: number;
  measured: number;
  /** 0 to 1; 1 when the recipe has no measured line at all. */
  coverage: number;
  /**
   * Whether the numbers can stand on their own: the recipe has its own values, or every measured line is known.
   * A list shows calories, and counts a recipe as high in protein, only then; a partial sum would read as a
   * light dish (a steak whose only known line is the butter).
   */
  complete: boolean;
  /** Each line's own values for the amount written (the whole recipe, not one serving); null when unknown. Lines that are not measured are absent. */
  lines: Record<string, Macros | null>;
}

const round = (value: number): number => Math.round(value);

/** Calories and protein of a recipe, per serving, with how much of it the numbers cover. */
export function recipeNutrition(
  recipe: Pick<Recipe, 'servings' | 'ingredients'> & { nutrition?: RecipeNutritionOverride | null },
  resolver: IngredientResolver = DEFAULT_RESOLVER,
): RecipeNutrition {
  let kcal = 0;
  let protein = 0;
  let known = 0;
  let measured = 0;
  const lines: Record<string, Macros | null> = {};
  for (const line of recipe.ingredients) {
    if (!isMeasured(line)) continue;
    measured++;
    const values = ingredientNutrition(line.name, resolver);
    const grams = values ? lineGrams(line, values) : null;
    if (!values || grams === null) {
      lines[line.id] = null;
      continue;
    }
    known++;
    const own = {
      kcal: (grams * values.kcalPer100g) / 100,
      protein: (grams * values.proteinPer100g) / 100,
    };
    kcal += own.kcal;
    protein += own.protein;
    lines[line.id] = { kcal: round(own.kcal), protein: round(own.protein) };
  }
  const servings = Math.max(1, recipe.servings);
  const computed =
    known > 0 ? { kcal: round(kcal / servings), protein: round(protein / servings) } : null;
  const override = recipe.nutrition ?? null;
  return {
    computed,
    perServing: override
      ? { kcal: round(override.kcal), protein: round(override.protein) }
      : computed,
    overridden: override !== null,
    known,
    measured,
    coverage: measured === 0 ? 1 : known / measured,
    complete: override !== null || (known > 0 && known === measured),
    lines,
  };
}

/** At least 8 g of protein per 100 kcal: about a third of the calories from protein. */
export const HIGH_PROTEIN_PER_100_KCAL = 8;

export const isHighProtein = (macros: Macros | null): boolean =>
  macros !== null &&
  macros.kcal > 0 &&
  (macros.protein * 100) / macros.kcal >= HIGH_PROTEIN_PER_100_KCAL;
