import { sizes } from '@diade/design-tokens';
import type React from 'react';
import { Text, View } from 'react-native';

/**
 * The two people, overlapping. The first is `action`, the second `brand-mint`.
 * Without a second person (the partner has not joined yet) a dashed placeholder is shown.
 */
export const AvatarPair: React.FC<{ people: [string, string | null]; size?: number }> = ({
  people,
  size = sizes['avatar-md'],
}) => {
  const initials = (name: string) => name.trim().charAt(0).toUpperCase();
  const avatar = (name: string | null, index: number) =>
    name === null ? (
      <View
        key={`pending${index}`}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          marginLeft: -size * 0.25,
          borderWidth: 2,
          borderStyle: 'dashed',
        }}
        className="items-center justify-center border-border-strong bg-bg"
      >
        <Text
          style={{ fontSize: size * 0.4, lineHeight: size * 0.5 }}
          className="font-semibold text-ink-muted"
        >
          +
        </Text>
      </View>
    ) : (
      <View
        key={name + index}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          marginLeft: index === 0 ? 0 : -size * 0.25,
          borderWidth: 2,
        }}
        className={`items-center justify-center border-bg ${index === 0 ? 'bg-action' : 'bg-brand-mint'}`}
      >
        <Text
          style={{ fontSize: size * 0.4, lineHeight: size * 0.5 }}
          className={`font-semibold ${index === 0 ? 'text-on-action' : 'text-brand-deep'}`}
        >
          {initials(name)}
        </Text>
      </View>
    );
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={people[1] ? `${people[0]} and ${people[1]}` : people[0]}
      className="flex-row items-center"
    >
      {people.map(avatar)}
    </View>
  );
};
