import React from 'react';
import { Pressable, Text, View } from 'react-native';

/**
 * Event, list or settings row. `tint="shared"` gives the mint shared-space wash.
 * Rows are at least 48px tall.
 */
export const ListItem: React.FC<{
  title: string;
  subtitle?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  tint?: 'default' | 'shared';
  onPress?: () => void;
}> = ({ title, subtitle, leading, trailing, tint = 'default', onPress }) => {
  const body = (
    <>
      {leading ? <View className="mr-3">{leading}</View> : null}
      <View className="flex-1 mr-2">
        <Text className="text-base leading-6 font-semibold text-ink" numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text className="text-sm leading-5 text-ink-muted mt-0.5" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
    </>
  );
  const className = `flex-row items-center min-h-[48px] px-4 py-3 rounded-md ${
    tint === 'shared' ? 'bg-surface-tint' : 'bg-surface'
  }`;
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" className={`${className} active:bg-surface-sunken`}>
      {body}
    </Pressable>
  ) : (
    <View className={className}>{body}</View>
  );
};
