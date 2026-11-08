import { Pressable, ScrollView, Text } from 'react-native';

export interface FilterChipOption<T extends string> {
  value: T;
  label: string;
}

/**
 * A horizontally scrolling row of single-choice chips. The chip row bleeds to the screen
 * edges so it reads as scrollable, while its first chip lines up with the page content.
 */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Array<FilterChipOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the group. */
  label: string;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      // Cancels the page's 16px side padding; the content padding puts it back.
      style={{ marginHorizontal: -16, flexGrow: 0, marginBottom: 20 }}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
      keyboardShouldPersistTaps="handled"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            className={`min-h-[44px] px-4 rounded-full border items-center justify-center ${
              selected ? 'bg-action border-action' : 'bg-surface border-border-strong'
            }`}
          >
            <Text
              className={`text-sm leading-5 font-semibold ${selected ? 'text-on-action' : 'text-ink'}`}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
