import React from 'react';
import { View } from 'react-native';
import { sizes } from '@diade/design-tokens';
import type { ImportantDateType } from '@diade/domain';
import { Icon, useColor } from '../design';
import { IMPORTANT_DATE_TYPE_META } from '../data/importantDateDisplay';

/** Round type icon on the shared-space tint, the same treatment as dashboard tiles. */
export const ImportantDateIcon: React.FC<{ type: ImportantDateType; large?: boolean }> = ({ type, large }) => {
  const tint = useColor('on-action-soft');
  return (
    <View
      className={`${large ? 'w-14 h-14' : 'w-10 h-10'} rounded-full bg-surface-tint items-center justify-center`}
    >
      <Icon
        name={IMPORTANT_DATE_TYPE_META[type].icon}
        size={large ? sizes['icon-lg'] + 4 : sizes['icon-lg']}
        color={tint}
      />
    </View>
  );
};
