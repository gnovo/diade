import { type ColorToken, colorsDark, colorsLight } from '@diade/design-tokens';
import { describe, expect, it } from 'vitest';

// WCAG 2.1 relative luminance and contrast ratio.
function luminance(hex: string): number {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

type Pair = { text: ColorToken; ground: ColorToken; min: number; why: string };

// Text pairs must reach 4.5:1 (WCAG 1.4.3). Control and indicator pairs must reach 3:1 (WCAG 1.4.11).
const textPairs: Pair[] = [
  ...(
    [
      'bg',
      'surface',
      'surface-sunken',
      'surface-tint',
      'action-soft',
      'personal-soft',
    ] as ColorToken[]
  ).map((ground): Pair => ({ text: 'ink', ground, min: 4.5, why: 'primary text' })),
  ...(['bg', 'surface', 'surface-sunken', 'surface-tint'] as ColorToken[]).map(
    (ground): Pair => ({ text: 'ink-muted', ground, min: 4.5, why: 'secondary text' }),
  ),
  ...(['action', 'action-hover', 'action-pressed'] as ColorToken[]).map(
    (ground): Pair => ({ text: 'on-action', ground, min: 4.5, why: 'label on action' }),
  ),
  ...(['action-soft', 'surface-tint'] as ColorToken[]).map(
    (ground): Pair => ({ text: 'on-action-soft', ground, min: 4.5, why: 'label on soft fills' }),
  ),
  { text: 'on-personal', ground: 'personal-soft', min: 4.5, why: 'personal badge' },
  { text: 'link', ground: 'surface', min: 4.5, why: 'inline link' },
  ...(['success-soft', 'surface', 'bg'] as ColorToken[]).map(
    (ground): Pair => ({ text: 'success', ground, min: 4.5, why: 'synced' }),
  ),
  ...(['warning-soft', 'surface', 'bg'] as ColorToken[]).map(
    (ground): Pair => ({ text: 'warning', ground, min: 4.5, why: 'pending' }),
  ),
  ...(['danger-soft', 'surface', 'bg'] as ColorToken[]).map(
    (ground): Pair => ({ text: 'danger', ground, min: 4.5, why: 'error' }),
  ),
  ...(['info-soft', 'surface', 'bg'] as ColorToken[]).map(
    (ground): Pair => ({ text: 'info', ground, min: 4.5, why: 'information' }),
  ),
];

const nonTextPairs: Pair[] = [
  { text: 'border-strong', ground: 'bg', min: 3, why: 'input border' },
  { text: 'border-strong', ground: 'surface', min: 3, why: 'input border' },
  { text: 'focus-ring', ground: 'bg', min: 3, why: 'focus ring' },
  { text: 'action', ground: 'surface-tint', min: 3, why: 'selected indicator' },
  { text: 'action', ground: 'surface', min: 3, why: 'checkbox fill' },
];

describe.each([
  ['light', colorsLight],
  ['dark', colorsDark],
] as const)('%s theme', (_name, palette) => {
  it.each(textPairs)('$text on $ground ($why) >= $min', ({ text, ground, min }) => {
    const ratio = contrast(palette[text], palette[ground]);
    expect(ratio, `${text} on ${ground}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(min);
  });

  it.each(nonTextPairs)('$text on $ground ($why) >= $min', ({ text, ground, min }) => {
    const ratio = contrast(palette[text], palette[ground]);
    expect(ratio, `${text} on ${ground}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(min);
  });
});

describe('brand tokens', () => {
  it('keeps the mint wash out of text roles', () => {
    // brand-mint is a fill only on light grounds (handover §5); text on it must be brand-deep.
    expect(contrast(colorsLight['brand-deep'], colorsLight['brand-mint'])).toBeGreaterThanOrEqual(
      4.5,
    );
  });
});

describe('spacing and sizes', () => {
  it('uses 48px as the minimum touch target', async () => {
    const { sizes } = await import('@diade/design-tokens');
    expect(sizes['touch-min']).toBe(48);
  });
});
