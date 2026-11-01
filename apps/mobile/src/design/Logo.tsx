import React from 'react';
import { SvgXml } from 'react-native-svg';
import { logoSvg } from '@diade/design-tokens';
import { useThemeColors } from './theme';

export type LogoVariant = 'lockup' | 'stacked' | 'mark' | 'wordmark';

export interface LogoProps {
  variant?: LogoVariant;
  /** Height in px. Minimum 24 for a lockup, 16 for the mark (handover §3). */
  height?: number;
  /** One-colour version in the text colour, for print-like or tinted contexts. */
  mono?: boolean;
}

/**
 * Díade brand artwork. Colours follow the theme: the left D and wordmark are `logo-ink`
 * (teal in light, white in dark), the right D is `brand-mint`, the overlap is `brand-overlap`.
 */
export const Logo: React.FC<LogoProps> = ({ variant = 'lockup', height = 32, mono = false }) => {
  const colors = useThemeColors();
  const source = logoSvg[variant];
  const xml = source
    .replace(/\{\{logo-ink\}\}/g, mono ? colors.ink : colors['logo-ink'])
    .replace(/\{\{brand-mint\}\}/g, mono ? colors.ink : colors['brand-mint'])
    .replace(/\{\{brand-overlap\}\}/g, mono ? colors.ink : colors['brand-overlap']);

  const [, , vbWidth, vbHeight] = source.match(/viewBox="([\d.\s-]+)"/)?.[1].split(/\s+/).map(Number) ?? [0, 0, 1, 1];
  const width = (height * vbWidth) / vbHeight;

  return (
    <SvgXml
      xml={xml}
      width={width}
      height={height}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Díade"
    />
  );
};
