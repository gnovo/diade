import type React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { Badge } from './Badge';
import { Checkbox } from './Checkbox';

/** Checkable shopping / to-do row. Completed rows are struck through in `ink-muted`. */
export const TaskItem: React.FC<{
  title: string;
  meta?: string;
  checked: boolean;
  owner?: string;
  onToggle: () => void;
  onLongPress?: () => void;
}> = ({ title, meta, checked, owner, onToggle, onLongPress }) => {
  const { t } = useTranslation();
  return (
    <View className="flex-row items-center min-h-[48px]">
      <Checkbox
        checked={checked}
        onToggle={onToggle}
        label={t(checked ? 'household.reopen' : 'household.complete', { title })}
      />
      <Pressable
        onLongPress={onLongPress}
        accessibilityHint={onLongPress ? t('household.longPressToDelete') : undefined}
        className="flex-1 mr-2 py-2"
      >
        <Text
          className={`text-base leading-6 ${checked ? 'text-ink-muted line-through' : 'font-medium text-ink'}`}
          numberOfLines={2}
        >
          {title}
        </Text>
        {meta ? <Text className="text-sm leading-5 text-ink-muted">{meta}</Text> : null}
      </Pressable>
      {owner ? <Badge tone="neutral">{owner}</Badge> : null}
    </View>
  );
};
