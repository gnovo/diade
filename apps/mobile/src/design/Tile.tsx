import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { sizes } from '@diade/design-tokens';
import { useColor, useShadow } from './theme';

/** Home dashboard module card. */
export const Tile: React.FC<{ icon: IconName; title: string; meta?: string; onPress?: () => void }> = ({
  icon,
  title,
  meta,
  onPress,
}) => {
  const shadow = useShadow('shadowSm');
  const onTint = useColor('on-action-soft');
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={meta ? `${title}, ${meta}` : title}
      style={shadow}
      className="flex-1 min-h-[120px] bg-surface rounded-lg p-5 border border-border active:bg-surface-sunken"
    >
      <View className="w-10 h-10 rounded-md bg-surface-tint items-center justify-center mb-4">
        <Icon name={icon} size={sizes['icon-lg']} color={onTint} />
      </View>
      <Text className="text-lg leading-6 font-semibold text-ink">{title}</Text>
      {meta ? <Text className="text-sm leading-5 text-ink-muted mt-1">{meta}</Text> : null}
    </Pressable>
  );
};
