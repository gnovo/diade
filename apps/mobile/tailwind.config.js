// Colours, type and radius come from the Díade design system (packages/design-tokens/tokens.json).
// Colours resolve through CSS custom properties in global.css, so light/dark switch automatically.
const tokens = require('../../packages/design-tokens/src/tailwind-tokens.json');

const colors = Object.fromEntries(tokens.colorNames.map((name) => [name, `var(--color-${name})`]));

const fontSize = Object.fromEntries(
  Object.entries(tokens.fontSizes).map(([name, s]) => [
    name,
    [`${s.fontSize}px`, { lineHeight: `${s.lineHeight}px`, letterSpacing: `${s.letterSpacing}px` }],
  ]),
);

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors,
      fontSize,
      borderRadius: {
        sm: `${tokens.radius.sm}px`,
        md: `${tokens.radius.md}px`,
        lg: `${tokens.radius.lg}px`,
        xl: `${tokens.radius.xl}px`,
        full: `${tokens.radius.full}px`,
      },
      fontFamily: {
        sans: ['PlusJakartaSans_400Regular', 'system-ui', 'sans-serif'],
        medium: ['PlusJakartaSans_500Medium', 'system-ui', 'sans-serif'],
        semibold: ['PlusJakartaSans_600SemiBold', 'system-ui', 'sans-serif'],
        bold: ['PlusJakartaSans_700Bold', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
