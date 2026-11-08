import type React from 'react';
import { Text, View } from 'react-native';

/**
 * One person as a round initial: `action` for the signed-in user, `brand-mint` for their partner,
 * the same colours the pair in the Today header uses. Decorative: the label next to it names them.
 */
export const Avatar: React.FC<{ name: string; tone: 'me' | 'partner'; size: number }> = ({
  name,
  tone,
  size,
}) => (
  <View
    importantForAccessibility="no-hide-descendants"
    style={{ width: size, height: size, borderRadius: size / 2 }}
    className={`items-center justify-center ${tone === 'me' ? 'bg-action' : 'bg-brand-mint'}`}
  >
    <Text
      style={{ fontSize: size * 0.4, lineHeight: size * 0.5 }}
      className={`font-semibold ${tone === 'me' ? 'text-on-action' : 'text-brand-deep'}`}
    >
      {name.trim().charAt(0).toUpperCase()}
    </Text>
  </View>
);
