import React from 'react';
import { Text, View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { sizes } from '@diade/design-tokens';
import { useColor, type ColorToken } from './theme';

export type BadgeTone = 'shared' | 'personal' | 'neutral' | 'success' | 'warning' | 'danger' | 'info';

interface ToneStyle {
  container: string;
  text: string;
  /** Token for the icon colour, matching the text colour. */
  token: ColorToken;
  icon?: IconName;
}

const tones: Record<BadgeTone, ToneStyle> = {
  shared: { container: 'bg-surface-tint', text: 'text-on-action-soft', token: 'on-action-soft', icon: 'users' },
  personal: { container: 'bg-personal-soft', text: 'text-on-personal', token: 'on-personal', icon: 'lock' },
  neutral: { container: 'bg-surface border border-border', text: 'text-ink-muted', token: 'ink-muted' },
  success: { container: 'bg-success-soft', text: 'text-success', token: 'success', icon: 'circle-check' },
  warning: { container: 'bg-warning-soft', text: 'text-warning', token: 'warning', icon: 'clock' },
  danger: { container: 'bg-danger-soft', text: 'text-danger', token: 'danger', icon: 'triangle-alert' },
  info: { container: 'bg-info-soft', text: 'text-info', token: 'info', icon: 'info' },
};

/**
 * Ownership or status label. Always icon + word, so meaning never depends on colour alone.
 * Shared = users icon, personal = lock icon (handover §5).
 */
export const Badge: React.FC<{ tone?: BadgeTone; children: string; icon?: IconName }> = ({
  tone = 'neutral',
  children,
  icon,
}) => {
  const t = tones[tone];
  const iconName = icon ?? t.icon;
  const iconColor = useColor(t.token);
  return (
    <View className={`flex-row items-center gap-1 rounded-full px-3 py-1 ${t.container}`}>
      {iconName ? <Icon name={iconName} size={sizes['icon-sm']} color={iconColor} /> : null}
      <Text className={`text-xs leading-4 font-semibold ${t.text}`}>{children}</Text>
    </View>
  );
};
