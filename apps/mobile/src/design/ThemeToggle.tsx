import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { sizes } from '@diade/design-tokens';
import { useColor } from './theme';
import { useThemePreference, type ThemePreference } from './ThemeProvider';

const options: { value: ThemePreference; label: string; icon: IconName }[] = [
  { value: 'system', label: 'System', icon: 'monitor' },
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
];

/** Appearance control: System, Light or Dark. Icon and word, never colour alone. */
export const ThemeToggle: React.FC = () => {
  const { preference, setPreference } = useThemePreference();
  const selectedColor = useColor('on-action');
  const idleColor = useColor('ink');
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Appearance" className="flex-row bg-surface-sunken rounded-md p-1">
      {options.map((option) => {
        const selected = option.value === preference;
        return (
          <Pressable
            key={option.value}
            onPress={() => setPreference(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`${option.label} appearance`}
            className={`flex-1 min-h-[40px] flex-row items-center justify-center gap-1.5 rounded-sm ${
              selected ? 'bg-action' : ''
            }`}
          >
            <Icon name={option.icon} size={sizes['icon-sm']} color={selected ? selectedColor : idleColor} />
            <Text className={`text-sm leading-5 font-semibold ${selected ? 'text-on-action' : 'text-ink'}`}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};
