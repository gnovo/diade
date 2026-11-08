import type React from 'react';
import { Pressable, Text, View } from 'react-native';

/** A snackbar pinned to the bottom of the screen with one action. */
export const UndoToast: React.FC<{
  message: string;
  actionLabel: string;
  onAction: () => void;
}> = ({ message, actionLabel, onAction }) => (
  <View pointerEvents="box-none" className="absolute left-4 right-4 bottom-4">
    <View
      accessibilityLiveRegion="polite"
      className="flex-row items-center justify-between bg-ink rounded-md pl-4 pr-1 min-h-[48px]"
    >
      <Text className="flex-1 mr-2 text-sm text-bg" numberOfLines={2}>
        {message}
      </Text>
      <Pressable
        onPress={onAction}
        accessibilityRole="button"
        className="px-3 min-h-[48px] items-center justify-center"
      >
        <Text className="text-sm font-semibold text-bg underline">{actionLabel}</Text>
      </Pressable>
    </View>
  </View>
);
