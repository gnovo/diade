import React from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from './Icon';
import { sizes } from '@diade/design-tokens';
import { useColor } from './theme';

/** 24px box inside a 48px hit area. Checked = `action` fill with a check icon. */
export const Checkbox: React.FC<{ checked: boolean; onToggle: () => void; label: string }> = ({
  checked,
  onToggle,
  label,
}) => {
  const onAction = useColor('on-action');
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      hitSlop={12}
      className="w-12 h-12 -ml-3 items-center justify-center"
    >
      <View
        className={`w-6 h-6 rounded-sm border-2 items-center justify-center ${
          checked ? 'bg-action border-action' : 'bg-surface border-border-strong'
        }`}
      >
        {checked ? <Icon name="check" size={sizes['icon-sm']} color={onAction} strokeWidth={3} /> : null}
      </View>
    </Pressable>
  );
};
