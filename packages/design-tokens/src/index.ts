/**
 * Díade Brand Design Tokens
 * Brand concept: Two distinct elements. One shared space.
 */

export const colors = {
  // Brand Core
  primary: '#0D4F46', // Deep Pine: Primary actions, brand symbol, strong emphasis
  secondary: '#65C5B3', // Mint Accent: Complementary symbol element, shared-state accents
  accent: '#A7E3D6', // Soft Highlight: Selected states, subtle badges

  // Light Mode Surfaces & Canvas
  background: '#F7FAF9', // Canvas background
  surface: '#FFFFFF', // Elevated cards & modals
  surfaceSubtle: '#EFF6F4', // Slightly tinted containers & chips
  border: '#E2E8F0', // Neutral hairline borders
  borderSubtle: '#CBD5E1',

  // Typography
  text: '#0F172A', // Slate 900: Primary high-contrast text
  textMuted: '#64748B', // Slate 500: Subtitles, captions, metadata
  textInverse: '#FFFFFF', // White text on primary surfaces

  // Semantic States
  success: '#059669', // Emerald 600
  warning: '#D97706', // Amber 600
  danger: '#DC2626', // Red 600
  info: '#0284C7', // Sky 600

  // Dark Mode Tokens (for future / dark theme)
  dark: {
    background: '#0B1311',
    surface: '#131E1B',
    surfaceSubtle: '#1C2B27',
    border: '#233833',
    text: '#F1F5F9',
    textMuted: '#94A3B8',
    primary: '#156B5F',
    secondary: '#65C5B3',
    accent: '#264D45',
  },
} as const;

export const typography = {
  fontFamily: {
    heading: 'PlusJakartaSans-Bold, system-ui, sans-serif',
    body: 'PlusJakartaSans-Regular, system-ui, sans-serif',
    medium: 'PlusJakartaSans-Medium, system-ui, sans-serif',
    semibold: 'PlusJakartaSans-SemiBold, system-ui, sans-serif',
  },
  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
  },
  lineHeight: {
    xs: 16,
    sm: 20,
    base: 24,
    lg: 28,
    xl: 28,
    '2xl': 32,
    '3xl': 36,
    '4xl': 40,
  },
} as const;

export const spacing = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
} as const;

export const radii = {
  none: 0,
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const tokens = {
  colors,
  typography,
  spacing,
  radii,
} as const;

export type Colors = typeof colors;
export type Typography = typeof typography;
export type Spacing = typeof spacing;
export type Radii = typeof radii;
