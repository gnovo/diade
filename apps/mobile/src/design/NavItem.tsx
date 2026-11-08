import { sizes } from '@diade/design-tokens';
import type React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { useColor } from './theme';

/** Sidebar / rail item. Selected state = `action` indicator bar plus mint wash (never tint alone). */
export const NavItem: React.FC<{
  icon: IconName;
  label: string;
  active?: boolean;
  count?: number;
  onPress?: () => void;
}> = ({ icon, label, active = false, count, onPress }) => {
  const iconColor = useColor(active ? 'ink' : 'ink-muted');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={`flex-row items-center gap-3 h-12 px-3 rounded-md ${active ? 'bg-surface-tint' : 'active:bg-surface-sunken'}`}
    >
      <View className={`w-1 h-6 rounded-full ${active ? 'bg-action' : 'bg-transparent'}`} />
      <Icon name={icon} size={sizes['icon-md']} color={iconColor} />
      <Text
        className={`flex-1 text-[15px] leading-5 font-semibold ${active ? 'text-ink' : 'text-ink-muted'}`}
      >
        {label}
      </Text>
      {count !== undefined ? (
        <Text className="text-xs font-semibold text-ink-muted">{count}</Text>
      ) : null}
    </Pressable>
  );
};
