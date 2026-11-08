import {
  type ColorToken,
  colorsDark,
  colorsLight,
  radius,
  shadows,
  sizes,
  space,
  type TypographyStyle,
  typography,
} from '@diade/design-tokens';
import { useColorScheme as useNativeWindScheme } from 'react-native-css-interop';

export type Scheme = 'light' | 'dark';

/** Resolved appearance from the same store as the CSS variables (see ThemeProvider). */
export function useScheme(): Scheme {
  return useNativeWindScheme().colorScheme === 'dark' ? 'dark' : 'light';
}

export function useThemeColors() {
  return useScheme() === 'dark' ? colorsDark : colorsLight;
}

/** A single design-token colour for the current appearance, for props that cannot take a class. */
export function useColor(token: ColorToken): string {
  return useThemeColors()[token];
}

export function useShadow(name: 'shadowSm' | 'shadowMd' | 'shadowLg') {
  return shadows[useScheme()][name];
}

export type { ColorToken, TypographyStyle };
export { radius, sizes, space, typography };
