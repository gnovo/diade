import type React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { Icon } from '../design';
import { BottomSheet } from './BottomSheet';

const Row: React.FC<{ title: string; hint: string; onPress: () => void }> = ({
  title,
  hint,
  onPress,
}) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    className="flex-row items-center min-h-[72px] rounded-lg border border-border bg-surface px-4 py-3 active:opacity-70"
  >
    <View className="flex-1 mr-2">
      <Text className="text-base font-semibold text-ink">{title}</Text>
      <Text className="text-sm text-ink-muted mt-0.5">{hint}</Text>
    </View>
    <Icon name="chevron-right" size={18} />
  </Pressable>
);

/** What the + in Recipes opens: write a recipe, or import one by pasting its text. */
export const AddRecipeChooser: React.FC<{
  visible: boolean;
  onClose: () => void;
  onWrite: () => void;
  onImport: () => void;
}> = ({ visible, onClose, onWrite, onImport }) => {
  const { t } = useTranslation();
  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('recipes.add.title')}>
      <View className="gap-2 pb-2">
        <Row
          title={t('recipes.add.write')}
          hint={t('recipes.add.writeHint')}
          onPress={() => {
            onClose();
            onWrite();
          }}
        />
        <Row
          title={t('recipes.add.import')}
          hint={t('recipes.add.importHint')}
          onPress={() => {
            onClose();
            onImport();
          }}
        />
      </View>
    </BottomSheet>
  );
};
