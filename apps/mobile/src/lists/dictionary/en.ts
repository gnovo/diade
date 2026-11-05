import type { ListCategory } from '@diade/domain';

/** Curated order: the most common items first, since it is the tie-break and the empty-query fallback. */
export const en: Record<ListCategory, string[]> = {
  groceries: [
    'Milk', 'Eggs', 'Bread', 'Butter', 'Cheese', 'Yogurt', 'Bananas', 'Apples', 'Tomatoes', 'Onions',
    'Potatoes', 'Garlic', 'Carrots', 'Lettuce', 'Cucumber', 'Bell peppers', 'Zucchini', 'Broccoli', 'Spinach',
    'Mushrooms', 'Cauliflower', 'Pumpkin', 'Green beans', 'Peas', 'Corn', 'Avocado', 'Lemons', 'Oranges',
    'Grapes', 'Strawberries', 'Blueberries', 'Pears', 'Kiwis', 'Watermelon', 'Pineapple', 'Mango',
    'Chicken breast', 'Minced beef', 'Steak', 'Pork chops', 'Turkey', 'Sausages', 'Bacon', 'Ham',
    'Salmon', 'Tuna', 'Cod', 'Shrimp', 'Rice', 'Pasta', 'Spaghetti', 'Flour', 'Sugar', 'Salt', 'Pepper',
    'Olive oil', 'Sunflower oil', 'Vinegar', 'Tomato sauce', 'Canned tomatoes', 'Chickpeas', 'Lentils', 'Beans',
    'Oats', 'Cereal', 'Biscuits', 'Crackers', 'Chocolate', 'Honey', 'Jam', 'Peanut butter', 'Nuts',
    'Coffee', 'Tea', 'Orange juice', 'Water', 'Sparkling water', 'Soda', 'Beer', 'Wine',
    'Cream', 'Cream cheese', 'Mozzarella', 'Parmesan', 'Feta', 'Tofu', 'Hummus', 'Pesto',
    'Baking powder', 'Yeast', 'Cinnamon', 'Oregano', 'Paprika', 'Basil', 'Parsley', 'Coriander', 'Mint', 'Ginger',
    'Frozen peas', 'Frozen pizza', 'Ice cream', 'Tortillas', 'Burger buns', 'Toast', 'Pancake mix',
    'Toilet paper', 'Kitchen roll', 'Dish soap', 'Laundry detergent', 'Fabric softener', 'Bin bags',
    'Toothpaste', 'Shampoo', 'Shower gel', 'Deodorant', 'Cat food', 'Dog food',
  ],
  pharmacy: [
    'Paracetamol', 'Ibuprofen', 'Plasters', 'Antiseptic', 'Thermometer', 'Cough syrup', 'Throat lozenges',
    'Nasal spray', 'Antihistamines', 'Sunscreen', 'After-sun', 'Insect repellent', 'Vitamin C', 'Vitamin D',
    'Eye drops', 'Bandages', 'Cotton pads', 'Lip balm', 'Hand cream', 'Face mask',
  ],
  packing: [
    'Passport', 'Tickets', 'Wallet', 'Phone charger', 'Power bank', 'Adapter', 'Headphones', 'Toothbrush',
    'Toothpaste', 'Shampoo', 'Deodorant', 'Sunscreen', 'Sunglasses', 'Swimsuit', 'Towel', 'Underwear', 'Socks',
    'T-shirts', 'Jeans', 'Jacket', 'Pyjamas', 'Shoes', 'Medication', 'Book',
  ],
  household: [
    'Light bulbs', 'Batteries', 'Sponges', 'Bleach', 'Glass cleaner', 'Bathroom cleaner', 'Floor cleaner',
    'Dishwasher tablets', 'Bin bags', 'Aluminium foil', 'Cling film', 'Baking paper', 'Candles', 'Matches',
    'Duct tape', 'Screws', 'Extension lead', 'Air freshener', 'Mop', 'Cleaning cloths',
  ],
  other: [],
};
