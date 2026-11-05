import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Suggestion } from '../lists/suggest';
import { Icon } from '../design';

/** Tappable suggestions under the item field. Tapping adds the item and leaves the keyboard open. */
export const ItemSuggestions: React.FC<{
  suggestions: Suggestion[];
  heading: string;
  onPick: (suggestion: Suggestion) => void;
}> = ({ suggestions, heading, onPick }) => {
  const { t } = useTranslation();
  if (suggestions.length === 0) return null;
  return (
    <View className="mt-3">
      <Text className="text-xs leading-4 font-semibold text-ink-muted tracking-wider uppercase mb-2">{heading}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {suggestions.map((s) => (
          <Pressable
            key={s.name}
            onPress={() => onPick(s)}
            accessibilityRole="button"
            accessibilityLabel={t(s.reAddItemId ? 'lists.addAgain' : 'lists.addSuggestion', { name: s.name })}
            className="flex-row items-center min-h-[48px] px-4 mr-2 rounded-full border border-border-strong bg-surface active:bg-surface-sunken"
          >
            <Icon name="plus" size={16} />
            <Text className="ml-1.5 text-sm font-medium text-ink">{s.name}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
};
