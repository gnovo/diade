import React from 'react';
import { Text, View } from 'react-native';
import { sizes } from '@diade/design-tokens';

/** The two people, overlapping. The first is `action`, the second `brand-mint`. */
export const AvatarPair: React.FC<{ people: [string, string]; size?: number }> = ({
  people,
  size = sizes['avatar-md'],
}) => {
  const initials = (name: string) => name.trim().charAt(0).toUpperCase();
  const avatar = (name: string, index: number) => (
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
      accessibilityLabel={`${people[0]} and ${people[1]}`}
      className="flex-row items-center"
    >
      {people.map(avatar)}
    </View>
  );
};
