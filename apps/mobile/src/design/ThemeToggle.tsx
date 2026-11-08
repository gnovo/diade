import { sizes } from '@diade/design-tokens';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { type ThemePreference, useThemePreference } from './ThemeProvider';
import { useColor } from './theme';

const options: { value: ThemePreference; icon: IconName }[] = [
  { value: 'system', icon: 'monitor' },
  { value: 'light', icon: 'sun' },
  { value: 'dark', icon: 'moon' },
];

/** Appearance control: System, Light or Dark. Icon and word, never colour alone. */
export const ThemeToggle: React.FC = () => {
  const { t } = useTranslation();
  const { preference, setPreference } = useThemePreference();
  const selectedColor = useColor('on-action');
  const idleColor = useColor('ink');
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t('theme.appearance')}
      className="flex-row bg-surface-sunken rounded-md p-1"
    >
      {options.map((option) => {
        const selected = option.value === preference;
        const label = t(`theme.${option.value}`);
        return (
          <Pressable
            key={option.value}
            onPress={() => setPreference(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={t('theme.appearanceOption', { label })}
            className={`flex-1 min-h-[40px] flex-row items-center justify-center gap-1.5 rounded-sm ${
              selected ? 'bg-action' : ''
            }`}
          >
            <Icon
              name={option.icon}
              size={sizes['icon-sm']}
              color={selected ? selectedColor : idleColor}
            />
            <Text
              className={`text-sm leading-5 font-semibold ${selected ? 'text-on-action' : 'text-ink'}`}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};
