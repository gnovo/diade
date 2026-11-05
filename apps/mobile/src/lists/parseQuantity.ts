export interface ParsedItem {
  name: string;
  quantity: string | null;
  unit: string | null;
}

const NUM = String.raw`\d+(?:[.,]\d+)?`;
const UNITS = ['kg', 'mg', 'g', 'ml', 'cl', 'dl', 'l', 'oz', 'lbs', 'lb'];
const UNIT = UNITS.join('|');

// "500g flour", "1.5 l water", "2 kg rice"
const LEADING_UNIT = new RegExp(`^(${NUM})\\s*(${UNIT})\\s+(.+)$`, 'i');
// "2 milk", "2x milk", "2 x milk"
const LEADING_COUNT = new RegExp(`^(\\d{1,3})\\s*x?\\s+(.+)$`, 'i');
// "milk x2", "milk x 2"
const TRAILING_X = new RegExp(`^(.+?)\\s*\\bx\\s*(\\d{1,3})$`, 'i');
// "milk 2"
const TRAILING_COUNT = new RegExp(`^(.+?)\\s+(\\d{1,3})$`);

const clean = (value: string) => value.trim().replace(/\s+/g, ' ');

/**
 * Splits "2 milk", "milk x2" or "500g flour" into a name and a quantity.
 * Conservative: a number only counts as a quantity when a name remains, and it must be
 * separated from the name, so "7up" and "2% milk" are left alone.
 */
export function parseQuantity(input: string): ParsedItem {
  const text = clean(input);
  const raw: ParsedItem = { name: text, quantity: null, unit: null };
  if (!text) return raw;

  const withUnit = LEADING_UNIT.exec(text);
  if (withUnit) {
    const name = clean(withUnit[3]);
    if (name) return { name, quantity: withUnit[1].replace(',', '.'), unit: withUnit[2].toLowerCase() };
  }

  const leading = LEADING_COUNT.exec(text);
  if (leading) {
    const name = clean(leading[2]);
    if (name) return { name, quantity: leading[1], unit: null };
  }

  const trailingX = TRAILING_X.exec(text);
  if (trailingX) {
    const name = clean(trailingX[1]);
    if (name) return { name, quantity: trailingX[2], unit: null };
  }

  const trailing = TRAILING_COUNT.exec(text);
  if (trailing) {
    const name = clean(trailing[1]);
    if (name) return { name, quantity: trailing[2], unit: null };
  }

  return raw;
}

/** "500 g", "2": how a stored quantity and unit are shown next to an item. */
export function formatQuantity(quantity: string | null, unit: string | null): string | null {
  if (!quantity) return null;
  return unit ? `${quantity} ${unit}` : quantity;
}
