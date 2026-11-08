import {
  type Ingredient,
  type IngredientResolver,
  ingredientMatchKey,
  knownIngredientNames,
  mergedGroups,
  type Recipe,
} from '@diade/domain';
import type React from 'react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  mergeIngredientNames,
  renameIngredient,
  separateIngredient,
  setIngredientStaple,
} from '../data/ingredientActions';
import { useIngredientCatalog } from '../data/useIngredientCatalog';
import { Icon } from '../design';
import { BottomSheet } from './BottomSheet';
import { Button, Card, EmptyState, SectionLabel, TextField, useWriteContext } from './ui';

/**
 * The names a member can merge: each ingredient once (names the dictionary or an earlier merge already joins show
 * as one), most used first, and never a name that has been merged away (it would resolve to something else).
 */
function mergeOptions(
  recipes: Recipe[],
  resolver: IngredientResolver,
): Array<{ name: string; count: number }> {
  const seen = new Set<string>();
  return knownIngredientNames(recipes)
    .filter(({ name }) => resolver.key(name) === ingredientMatchKey(name))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .filter(({ name }) => {
      const key = resolver.key(name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** Two steps: the name to keep, then the name to merge into it. Nothing is written until the last tap. */
const MergeNamesSheet: React.FC<{
  visible: boolean;
  onClose: () => void;
  recipes: Recipe[];
  entries: Ingredient[];
  resolver: IngredientResolver;
}> = ({ visible, onClose, recipes, entries, resolver }) => {
  const { t } = useTranslation();
  const ctx = useWriteContext();
  const [keep, setKeep] = useState<string | null>(null);
  const [absorb, setAbsorb] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const options = useMemo(() => mergeOptions(recipes, resolver), [recipes, resolver]);
  const needle = ingredientMatchKey(query);
  const shown = options.filter(
    ({ name }) =>
      (!needle || ingredientMatchKey(name).includes(needle)) &&
      (keep === null || resolver.key(name) !== resolver.key(keep)),
  );

  const close = () => {
    setKeep(null);
    setAbsorb(null);
    setQuery('');
    setSaving(false);
    onClose();
  };

  const confirm = async () => {
    if (!ctx || !keep || !absorb || saving) return;
    setSaving(true);
    try {
      const error = await mergeIngredientNames(ctx, entries, keep, absorb);
      if (error) {
        Alert.alert(t('ingredients.merge.couldNot'), t(`ingredients.merge.${error}`));
        setSaving(false);
        return;
      }
      close();
    } catch (err) {
      setSaving(false);
      Alert.alert(
        t('common.couldNotSave'),
        err instanceof Error ? err.message : t('common.tryAgain'),
      );
    }
  };

  const pick = (name: string) => {
    if (keep === null) setKeep(name);
    else setAbsorb(name);
    setQuery('');
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={close}
      title={t('ingredients.merge.title')}
      footer={
        keep && absorb ? (
          <Button
            label={t('ingredients.merge.confirm', { absorb, keep })}
            onPress={confirm}
            disabled={saving}
          />
        ) : undefined
      }
    >
      <Text className="text-sm leading-5 text-ink-muted mb-3">
        {keep === null
          ? t('ingredients.merge.pickKeep')
          : t('ingredients.merge.pickAbsorb', { keep })}
      </Text>
      {keep ? (
        <Pressable
          onPress={() => {
            setKeep(null);
            setAbsorb(null);
          }}
          accessibilityRole="button"
          accessibilityLabel={t('ingredients.merge.change', { keep })}
          className="flex-row items-center min-h-[48px] mb-2 active:opacity-70"
        >
          <Icon name="chevron-left" size={18} />
          <Text className="text-base font-semibold text-ink ml-1">{keep}</Text>
        </Pressable>
      ) : null}
      <TextField
        value={query}
        onChangeText={setQuery}
        placeholder={t('ingredients.merge.search')}
        accessibilityLabel={t('ingredients.merge.search')}
        autoCorrect={false}
      />
      <View className="mt-2">
        {shown.length === 0 ? (
          <EmptyState message={t('ingredients.merge.noNames')} />
        ) : (
          shown.slice(0, 40).map(({ name, count }, index) => {
            const selected = absorb === name;
            return (
              <View key={name}>
                {index === 0 ? null : <View className="h-px bg-border" />}
                <Pressable
                  onPress={() => pick(name)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className="flex-row items-center min-h-[52px] active:opacity-70"
                >
                  <Text
                    className={`flex-1 text-base ${selected ? 'font-bold text-ink' : 'text-ink'}`}
                  >
                    {name}
                  </Text>
                  <Text className="text-sm text-ink-muted">
                    {t('ingredients.merge.recipeCount', { count })}
                  </Text>
                </Pressable>
              </View>
            );
          })
        )}
      </View>
    </BottomSheet>
  );
};

/** The ingredients the recipes use, each once, with whether lists treat it as a pantry staple right now. */
function stapleRows(
  recipes: Recipe[],
  resolver: IngredientResolver,
): Array<{ name: string; staple: boolean }> {
  const byKey = new Map<string, { name: string; lines: boolean[] }>();
  for (const recipe of recipes) {
    for (const line of recipe.ingredients) {
      const key = resolver.key(line.name);
      if (!key) continue;
      const group = byKey.get(key) ?? { name: resolver.name(key) ?? line.name, lines: [] };
      group.lines.push(line.staple);
      byKey.set(key, group);
    }
  }
  return [...byKey.entries()]
    .map(([key, { name, lines }]) => ({
      name,
      // The household's call when it made one, else what the recipe lines say.
      staple: resolver.staple(key) ?? lines.every(Boolean),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Which ingredients are pantry staples (left out of grocery lists made from recipes): one switch each, one write per tap. */
const StaplesSection: React.FC<{
  recipes: Recipe[];
  entries: Ingredient[];
  resolver: IngredientResolver;
}> = ({ recipes, entries, resolver }) => {
  const { t } = useTranslation();
  const ctx = useWriteContext();
  const [query, setQuery] = useState('');
  const rows = useMemo(() => stapleRows(recipes, resolver), [recipes, resolver]);
  const needle = ingredientMatchKey(query);
  const shown = rows.filter(({ name }) => !needle || ingredientMatchKey(name).includes(needle));

  const toggle = (name: string, staple: boolean) => {
    if (!ctx) return;
    setIngredientStaple(ctx, entries, name, !staple).catch((err) =>
      Alert.alert(
        t('common.couldNotSave'),
        err instanceof Error ? err.message : t('common.tryAgain'),
      ),
    );
  };

  return (
    <View className="mt-6">
      <SectionLabel>{t('ingredients.staplesHeading')}</SectionLabel>
      <Text className="text-sm leading-5 text-ink-muted mb-3">{t('ingredients.staplesHint')}</Text>
      <TextField
        value={query}
        onChangeText={setQuery}
        placeholder={t('ingredients.merge.search')}
        accessibilityLabel={t('ingredients.merge.search')}
        autoCorrect={false}
      />
      <Card className="mt-3 mb-0">
        {shown.length === 0 ? (
          <EmptyState message={t('ingredients.staplesEmpty')} />
        ) : (
          shown.slice(0, 60).map(({ name, staple }, index) => (
            <View key={name}>
              {index === 0 ? null : <View className="h-px bg-border" />}
              <View className="flex-row items-center min-h-[52px]">
                <Text className="flex-1 text-base text-ink mr-2">{name}</Text>
                <Pressable
                  onPress={() => toggle(name, staple)}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: staple }}
                  accessibilityLabel={t(
                    staple ? 'recipes.form.unmarkStaple' : 'recipes.form.markStaple',
                    { name },
                  )}
                  className="min-h-[48px] justify-center px-1"
                >
                  <View
                    className={`px-3 py-1.5 rounded-full border ${
                      staple ? 'bg-surface-tint border-action' : 'border-border-strong'
                    }`}
                  >
                    <Text
                      className={`text-xs font-semibold ${staple ? 'text-action' : 'text-ink-muted'}`}
                    >
                      {t('recipes.form.pantry')}
                    </Text>
                  </View>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </Card>
    </View>
  );
};

const RenameSheet: React.FC<{
  entry: Pick<Ingredient, 'id' | 'name'> | null;
  entries: Ingredient[];
  onClose: () => void;
}> = ({ entry, entries, onClose }) => {
  const { t } = useTranslation();
  const ctx = useWriteContext();
  const [name, setName] = useState('');
  const [openFor, setOpenFor] = useState<string | null>(null);
  // Start from the current name each time a different entry opens.
  if (entry && openFor !== entry.id) {
    setOpenFor(entry.id);
    setName(entry.name);
  }

  const save = async () => {
    if (!ctx || !entry) return;
    try {
      await renameIngredient(ctx, entries, entry.id, name);
      setOpenFor(null);
      onClose();
    } catch (err) {
      Alert.alert(
        t('common.couldNotSave'),
        err instanceof Error ? err.message : t('common.tryAgain'),
      );
    }
  };

  return (
    <BottomSheet
      visible={entry !== null}
      onClose={() => {
        setOpenFor(null);
        onClose();
      }}
      title={t('ingredients.renameTitle')}
      footer={<Button label={t('common.save')} onPress={save} disabled={!name.trim()} />}
    >
      <TextField
        value={name}
        onChangeText={setName}
        placeholder={t('ingredients.renamePlaceholder')}
        accessibilityLabel={t('ingredients.renameTitle')}
        maxLength={120}
        autoCapitalize="sentences"
      />
    </BottomSheet>
  );
};

/**
 * The ingredient names the household has told the app are one thing ("Meet" is "Meat"): each kept name with the
 * names merged into it, a way to merge two more, separate a merge, or rename. Full screen, like the cooking view.
 */
export const IngredientsScreen: React.FC<{
  visible: boolean;
  onClose: () => void;
  recipes: Recipe[];
}> = ({ visible, onClose, recipes }) => {
  const { t } = useTranslation();
  const ctx = useWriteContext();
  const { entries, resolver } = useIngredientCatalog();
  const [mergeOpen, setMergeOpen] = useState(false);
  const [renaming, setRenaming] = useState<Pick<Ingredient, 'id' | 'name'> | null>(null);
  const groups = useMemo(() => mergedGroups(entries), [entries]);

  const separate = (entry: Pick<Ingredient, 'id'>) => {
    if (!ctx) return;
    separateIngredient(ctx, entries, entry.id).catch((err) =>
      Alert.alert(
        t('common.couldNotSave'),
        err instanceof Error ? err.message : t('common.tryAgain'),
      ),
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
        <View className="flex-row items-center px-4 pt-2 pb-3">
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('ingredients.close')}
            hitSlop={8}
            className="w-11 h-11 rounded-full bg-surface-sunken items-center justify-center mr-3"
          >
            <Icon name="x" />
          </Pressable>
          <Text className="flex-1 text-title-2 font-bold text-ink">{t('ingredients.title')}</Text>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
          <Text className="text-sm leading-5 text-ink-muted mb-4">{t('ingredients.intro')}</Text>
          <Button label={t('ingredients.mergeNames')} onPress={() => setMergeOpen(true)} />
          <View className="mt-5">
            <SectionLabel>{t('ingredients.mergedHeading')}</SectionLabel>
            {groups.length === 0 ? (
              <Card>
                <EmptyState message={t('ingredients.empty')} />
              </Card>
            ) : (
              groups.map(({ keep, merged }) => (
                <Card key={keep.id}>
                  <View className="flex-row items-center">
                    <Text className="flex-1 text-base font-semibold text-ink">{keep.name}</Text>
                    <Button
                      label={t('ingredients.rename')}
                      variant="ghost"
                      small
                      onPress={() => setRenaming(keep)}
                    />
                  </View>
                  {merged.map((entry) => (
                    <View key={entry.id}>
                      <View className="h-px bg-border" />
                      <View className="flex-row items-center min-h-[52px]">
                        <Text className="flex-1 text-sm text-ink-muted">
                          {t('ingredients.alsoWritten', { name: entry.name })}
                        </Text>
                        <Button
                          label={t('ingredients.separate')}
                          variant="ghost"
                          small
                          onPress={() => separate(entry)}
                        />
                      </View>
                    </View>
                  ))}
                </Card>
              ))
            )}
          </View>
          <StaplesSection recipes={recipes} entries={entries} resolver={resolver} />
        </ScrollView>
        <MergeNamesSheet
          visible={mergeOpen}
          onClose={() => setMergeOpen(false)}
          recipes={recipes}
          entries={entries}
          resolver={resolver}
        />
        <RenameSheet entry={renaming} entries={entries} onClose={() => setRenaming(null)} />
      </SafeAreaView>
    </Modal>
  );
};
