/**
 * Names that mean the same ingredient, English and Portuguese, so a grocery list buys one row for them.
 * Each group is the spellings a recipe may use: the first is the one the group is known by, and singular and
 * plural are both written because plurals are only matched by the simple rule in `singularWord`
 * (`tomato` and `tomatoes` do not meet by themselves).
 *
 * Kept deliberately conservative: a name that means different things in the two languages or in different
 * dishes (`massa` is pasta and dough, `pepper` is a spice and a vegetable) is left out, because two rows are
 * better than a wrong merge. It ships with the app, so it improves over the air and needs no per-space data.
 */
export const INGREDIENT_SYNONYMS: ReadonlyArray<readonly string[]> = [
  ['tomato', 'tomatoes', 'tomate', 'tomates'],
  ['aubergine', 'aubergines', 'eggplant', 'eggplants', 'beringela', 'beringelas'],
  ['courgette', 'courgettes', 'zucchini', 'zucchinis', 'curgete', 'curgetes', 'courgete'],
  ['coriander', 'cilantro', 'coentro', 'coentros'],
  ['onion', 'onions', 'cebola', 'cebolas'],
  ['garlic', 'alho', 'alhos'],
  ['potato', 'potatoes', 'batata', 'batatas'],
  ['carrot', 'carrots', 'cenoura', 'cenouras'],
  ['bell pepper', 'bell peppers', 'capsicum', 'pimento', 'pimentos', 'pimentao', 'pimentoes'],
  ['chickpeas', 'chickpea', 'garbanzo beans', 'grao de bico', 'grao-de-bico', 'graos de bico'],
  ['egg', 'eggs', 'ovo', 'ovos'],
  ['butter', 'manteiga'],
  ['milk', 'leite'],
  ['flour', 'farinha'],
  ['sugar', 'acucar'],
  ['rice', 'arroz'],
  ['olive oil', 'azeite'],
  ['salt', 'sal'],
  ['black pepper', 'pimenta preta', 'pimenta-preta'],
  ['cheese', 'queijo', 'queijos'],
  ['chicken', 'frango'],
  ['pork', 'porco'],
  ['salmon', 'salmao'],
  ['shrimp', 'shrimps', 'prawn', 'prawns', 'camarao', 'camaroes', 'gamba', 'gambas'],
  ['lemon', 'lemons', 'limao', 'limoes'],
  ['parsley', 'salsa'],
  ['basil', 'manjericao'],
  ['mushroom', 'mushrooms', 'cogumelo', 'cogumelos'],
  ['spinach', 'espinafre', 'espinafres'],
  ['lettuce', 'alface'],
  ['cucumber', 'cucumbers', 'pepino', 'pepinos'],
  ['corn', 'sweetcorn', 'milho'],
  ['peas', 'pea', 'ervilha', 'ervilhas'],
  ['apple', 'apples', 'maca', 'macas'],
  ['banana', 'bananas'],
  ['orange', 'oranges', 'laranja', 'laranjas'],
  ['yoghurt', 'yogurt', 'yoghurts', 'yogurts', 'iogurte', 'iogurtes'],
  ['cream', 'natas'],
  ['bread', 'pao'],
  ['honey', 'mel'],
  ['vinegar', 'vinagre'],
  ['chilli', 'chillies', 'chili', 'chilis', 'chile', 'malagueta', 'malaguetas'],
  ['cinnamon', 'canela'],
  ['ginger', 'gengibre'],
];
