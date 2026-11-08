import { formatAmount, parseRecipeNotes, type Recipe } from '@diade/domain';
import { useKeepAwake } from 'expo-keep-awake';
import type React from 'react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '../design';
import { decimalFor } from './RecipeForm';
import { Button, Checkbox, Segmented } from './ui';

type Tab = 'steps' | 'ingredients';

/** Large enough to read from across a counter; it still follows the system font size. */
const STEP_TEXT = { fontSize: 26, lineHeight: 38 } as const;

/**
 * What is on screen while cooking. It is mounted only while the cooking view is open, so the screen stays
 * awake exactly that long, and the step and the ticks start fresh each time.
 */
const CookingContent: React.FC<{ recipe: Recipe; onClose: () => void }> = ({ recipe, onClose }) => {
  const { t, i18n } = useTranslation();
  useKeepAwake();
  const decimal = decimalFor(i18n.language);
  const steps = useMemo(() => parseRecipeNotes(recipe.notes).steps, [recipe.notes]);
  const [tab, setTab] = useState<Tab>('steps');
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState<Set<string>>(new Set());

  const last = index >= steps.length - 1;
  const toggle = (id: string) =>
    setReady((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
      <View className="flex-row items-center px-4 pt-2 pb-3">
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('recipes.cook.close')}
          hitSlop={8}
          className="w-11 h-11 rounded-full bg-surface-sunken items-center justify-center mr-3"
        >
          <Icon name="x" />
        </Pressable>
        <Text className="flex-1 text-base font-semibold text-ink" numberOfLines={1}>
          {recipe.name}
        </Text>
      </View>

      <View className="px-4 mb-4">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'steps', label: t('recipes.cook.stepsTab') },
            { value: 'ingredients', label: t('recipes.cook.ingredientsTab') },
          ]}
        />
      </View>

      {tab === 'steps' ? (
        <>
          <View className="px-4">
            <Text className="text-sm text-ink-muted mb-2" accessibilityLiveRegion="polite">
              {t('recipes.cook.stepOf', { n: index + 1, total: steps.length })}
            </Text>
            <View className="h-1 rounded-full bg-surface-sunken overflow-hidden">
              <View
                className="h-1 rounded-full bg-action"
                style={{ width: `${((index + 1) / steps.length) * 100}%` }}
              />
            </View>
          </View>
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ padding: 16, paddingTop: 24, paddingBottom: 24 }}
          >
            <Text className="text-ink font-medium" style={STEP_TEXT} selectable>
              {steps[index]}
            </Text>
          </ScrollView>
          <View className="flex-row gap-3 px-4 pb-3">
            <View className="flex-1">
              <Button
                label={t('recipes.cook.previous')}
                variant="outline"
                disabled={index === 0}
                onPress={() => setIndex((i) => Math.max(0, i - 1))}
              />
            </View>
            <View className="flex-1">
              <Button
                label={last ? t('recipes.cook.done') : t('recipes.cook.next')}
                onPress={() => (last ? onClose() : setIndex((i) => i + 1))}
              />
            </View>
          </View>
        </>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
          <Text className="text-sm text-ink-muted mb-2" accessibilityLiveRegion="polite">
            {t('recipes.cook.ready', {
              done: recipe.ingredients.filter((row) => ready.has(row.id)).length,
              total: recipe.ingredients.length,
            })}
          </Text>
          {recipe.ingredients.map((row, i) => {
            const on = ready.has(row.id);
            const amount = formatAmount(row.quantity, row.unit, decimal);
            return (
              <View key={row.id}>
                {i === 0 ? null : <View className="h-px bg-border" />}
                <View className="flex-row items-center min-h-[56px]">
                  <Checkbox
                    checked={on}
                    onToggle={() => toggle(row.id)}
                    label={t(on ? 'recipes.cook.untick' : 'recipes.cook.tick', { name: row.name })}
                  />
                  <Pressable
                    onPress={() => toggle(row.id)}
                    accessible={false}
                    className="flex-1 flex-row items-center"
                  >
                    <Text
                      className={`flex-1 text-base mr-2 ${on ? 'text-ink-muted line-through' : 'text-ink'}`}
                    >
                      {row.name}
                    </Text>
                    {amount ? <Text className="text-base text-ink-muted">{amount}</Text> : null}
                  </Pressable>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

/** Full-screen cooking mode: one big step at a time, the ingredients to tick off, and the screen kept awake. */
export const CookingView: React.FC<{
  recipe: Recipe;
  visible: boolean;
  onClose: () => void;
}> = ({ recipe, visible, onClose }) => (
  <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    {visible ? <CookingContent recipe={recipe} onClose={onClose} /> : null}
  </Modal>
);
