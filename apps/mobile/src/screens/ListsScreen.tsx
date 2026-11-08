import { type ListItem, listIconFor, type Recipe, type SharedList } from '@diade/domain';
import type { TFunction } from '@diade/i18n';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, BackHandler, Pressable, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { AddRecipeChooser } from '../components/AddRecipeChooser';
import { ImportRecipesSheet } from '../components/ImportRecipesSheet';
import { IngredientsScreen } from '../components/IngredientsScreen';
import { ItemSuggestions } from '../components/ItemSuggestions';
import { NewListWizard } from '../components/NewListWizard';
import { PlanListSection } from '../components/PlanListSection';
import { PlanView } from '../components/PlanView';
import { RecipeForm } from '../components/RecipeForm';
import { RecipeDetailScreen, RecipesLibrary } from '../components/RecipesView';
import { SortableList } from '../components/SortableList';
import { STEP_EASING, STEP_MS, useReduceMotion } from '../components/StepPager';
import { SwipeToDelete } from '../components/SwipeToDelete';
import { UndoToast } from '../components/UndoToast';
import {
  Button,
  Card,
  Checkbox,
  EmptyState,
  HeaderAddButton,
  ScreenScaffold,
  SectionLabel,
  Segmented,
  TextField,
  useWriteContext,
} from '../components/ui';
import {
  getActiveListItems,
  getActiveLists,
  getActiveRecipes,
  getItemHistory,
  type ItemHistoryRow,
} from '../data/queries';
import { deleteRecord, insertRecord, updateRecord, updateRecords } from '../data/repository';
import { useLiveQuery } from '../data/useLiveQuery';
import { Icon } from '../design';
import { dictionaryFor } from '../lists/dictionary';
import { capitalizeFirst, normalizeText } from '../lists/normalize';
import { formatQuantity, parseQuantity } from '../lists/parseQuantity';
import { moveItem } from '../lists/reorder';
import { type HistoryEntry, type Suggestion, suggest } from '../lists/suggest';
import { useUndoableDelete } from '../lists/useUndoableDelete';

const categoryLabel = (t: TFunction, category: SharedList['category']): string =>
  t(`lists.category.${category}`);

/** History is per category, so a packing list is not suggested groceries. "Other" sees everything. */
function historyFor(rows: ItemHistoryRow[], category: SharedList['category']): HistoryEntry[] {
  return rows
    .filter((row) => category === 'other' || row.category === category)
    .map((row) => ({ name: row.name, count: row.count, lastUsedAt: row.lastUsedAt }));
}

export const ListsScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const ctx = useWriteContext();
  const lists = useLiveQuery(getActiveLists, [] as SharedList[]);
  const items = useLiveQuery(getActiveListItems, [] as ListItem[]);
  const history = useLiveQuery(getItemHistory, [] as ItemHistoryRow[]);
  const recipes = useLiveQuery(getActiveRecipes, [] as Recipe[]);
  const reduceMotion = useReduceMotion();
  const [section, setSection] = useState<'lists' | 'recipes' | 'plan'>('lists');
  // The first section shown does not fade in with the screen; only a switch does.
  const [switched, setSwitched] = useState(false);
  const [openRecipeId, setOpenRecipeId] = useState<string | null>(null);
  const [recipeForm, setRecipeForm] = useState<{ open: boolean; recipe: Recipe | null }>({
    open: false,
    recipe: null,
  });
  const [importOpen, setImportOpen] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [ingredientsOpen, setIngredientsOpen] = useState(false);
  const [openListId, setOpenListId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [newItemText, setNewItemText] = useState('');
  const [quantityDismissed, setQuantityDismissed] = useState(false);
  const [dragging, setDragging] = useState(false);

  const undoable = useUndoableDelete(async (ids) => {
    for (const id of ids) await deleteRecord('list_items', id);
  });
  const hiddenIds = useMemo(() => new Set(undoable.pending?.ids ?? []), [undoable.pending]);

  const openList = lists.data.find((l) => l.id === openListId) ?? null;
  const itemsFor = (listId: string) =>
    items.data.filter((i) => i.listId === listId && !hiddenIds.has(i.id));

  const parsed = quantityDismissed
    ? { name: newItemText.trim(), quantity: null, unit: null }
    : parseQuantity(newItemText);

  // biome-ignore lint/correctness/useExhaustiveDependencies: itemsFor closes over items and hiddenIds, so list them instead of the function
  const suggestions = useMemo(() => {
    if (!openList) return [];
    return suggest({
      query: parsed.name,
      history: historyFor(history.data, openList.category),
      dictionary: dictionaryFor(i18n.language, openList.category),
      existing: itemsFor(openList.id),
    });
    // itemsFor closes over items and hiddenIds, so list them instead of the function.
  }, [openList, parsed.name, history.data, items.data, hiddenIds, i18n.language]);

  const resetAdder = () => {
    setNewItemText('');
    setQuantityDismissed(false);
  };

  /** Adds what was typed, or the chosen suggestion, keeping the typed quantity. */
  const addItem = async (picked?: Suggestion) => {
    if (!openList || !ctx) return;
    const name = picked?.name ?? capitalizeFirst(parsed.name);
    if (!name) return;

    // Something already checked off the list comes back instead of being duplicated.
    const norm = normalizeText(name);
    const checkedMatch = picked?.reAddItemId
      ? { id: picked.reAddItemId }
      : itemsFor(openList.id).find((i) => i.isChecked && normalizeText(i.name) === norm);
    try {
      if (checkedMatch) {
        const fromPlan = itemsFor(openList.id).find((i) => i.id === checkedMatch.id)?.contributions;
        await updateRecord('list_items', checkedMatch.id, {
          isChecked: false,
          ...(parsed.quantity
            ? {
                quantity: parsed.quantity,
                unit: parsed.unit,
                // A quantity typed over a plan item is the member's: "Update from plan" must not undo it.
                ...(fromPlan ? { editedByHand: true } : {}),
              }
            : {}),
        });
      } else {
        await insertRecord('list_items', ctx, {
          listId: openList.id,
          name,
          quantity: parsed.quantity,
          unit: parsed.unit,
          isChecked: false,
        });
      }
      resetAdder();
    } catch (err) {
      Alert.alert(
        t('lists.couldNotAddItem'),
        err instanceof Error ? err.message : t('common.tryAgain'),
      );
    }
  };

  /** Saves a new order for the unchecked items. `open` is the order currently on screen. */
  const reorderOpen = (open: ListItem[], from: number, to: number) => {
    const updates = moveItem(open, from, to).map(({ id, position }) => ({
      id,
      changes: { position },
    }));
    updateRecords('list_items', updates).catch((err) =>
      Alert.alert(
        t('lists.couldNotReorder'),
        err instanceof Error ? err.message : t('common.tryAgain'),
      ),
    );
  };

  const toggleItem = (item: ListItem) =>
    updateRecord('list_items', item.id, { isChecked: !item.isChecked });

  const removeItem = (item: ListItem) =>
    undoable.schedule([item.id], t('lists.itemRemoved', { name: item.name }));

  const clearChecked = () => {
    if (!openList) return;
    const checked = itemsFor(openList.id).filter((i) => i.isChecked);
    undoable.schedule(
      checked.map((i) => i.id),
      t('lists.itemsCleared', { count: checked.length }),
    );
  };

  const removeList = () => {
    if (!openList) return;
    Alert.alert(t('lists.deleteTitle'), t('lists.deleteBody', { name: openList.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteRecord('lists', openList.id);
          setOpenListId(null);
        },
      },
    ]);
  };

  const closeList = () => {
    undoable.flush();
    resetAdder();
    setOpenListId(null);
  };

  // The system Back button closes an open list instead of leaving the Lists tab.
  const closeListRef = useRef(closeList);
  closeListRef.current = closeList;
  useEffect(() => {
    if (!openListId) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeListRef.current();
      return true;
    });
    return () => sub.remove();
  }, [openListId]);

  const toast = undoable.pending ? (
    <UndoToast
      message={undoable.pending.message}
      actionLabel={t('lists.undo')}
      onAction={undoable.undo}
    />
  ) : null;

  const switcher = (
    <View className="mb-4">
      <Segmented
        value={section}
        onChange={(next) => {
          setSwitched(true);
          setSection(next);
        }}
        options={[
          { value: 'lists', label: t('lists.title') },
          { value: 'recipes', label: t('recipes.title') },
          { value: 'plan', label: t('plan.title') },
        ]}
      />
    </View>
  );

  const openRecipe = recipes.data.find((r) => r.id === openRecipeId) ?? null;
  const recipeSheet = (
    <RecipeForm
      library={recipes.data}
      visible={recipeForm.open}
      recipe={recipeForm.recipe}
      onClose={() => setRecipeForm((f) => ({ ...f, open: false }))}
      onSaved={(id) => setOpenRecipeId(id)}
    />
  );
  const chooserSheet = (
    <AddRecipeChooser
      visible={chooserOpen}
      onClose={() => setChooserOpen(false)}
      onWrite={() => setRecipeForm({ open: true, recipe: null })}
      onImport={() => setImportOpen(true)}
    />
  );
  const importSheet = (
    <ImportRecipesSheet
      visible={importOpen}
      existing={recipes.data}
      onClose={() => setImportOpen(false)}
    />
  );

  if (section === 'recipes' && openRecipe) {
    return (
      <>
        <RecipeDetailScreen
          recipe={openRecipe}
          onBack={() => setOpenRecipeId(null)}
          onEdit={() => setRecipeForm({ open: true, recipe: openRecipe })}
        />
        {recipeSheet}
      </>
    );
  }

  if (openList) {
    const listItems = itemsFor(openList.id);
    const open = listItems.filter((i) => !i.isChecked);
    const done = listItems.filter((i) => i.isChecked);
    const quantityPill = formatQuantity(parsed.quantity, parsed.unit);

    return (
      <View className="flex-1">
        <ScreenScaffold
          title={openList.name}
          onBack={closeList}
          backLabel={t('common.back')}
          scrollEnabled={!dragging}
          refreshable={!dragging}
        >
          {openList.planId ? (
            <PlanListSection list={openList} items={listItems} recipes={recipes.data} />
          ) : null}

          <Card>
            <TextField
              value={newItemText}
              onChangeText={(text) => {
                setNewItemText(text);
                if (text === '') setQuantityDismissed(false);
              }}
              placeholder={t('lists.addItemPlaceholder')}
              maxLength={200}
              onSubmitEditing={() => addItem()}
              submitBehavior="submit"
              returnKeyType="done"
              autoCorrect={false}
              autoCapitalize="sentences"
            />
            {quantityPill && parsed.name ? (
              <Pressable
                onPress={() => setQuantityDismissed(true)}
                accessibilityRole="button"
                accessibilityLabel={t('lists.removeQuantity', { quantity: quantityPill })}
                className="self-start flex-row items-center mt-2 min-h-[48px] -mb-2 pl-3 pr-2 rounded-full bg-surface-sunken"
              >
                <Text className="text-sm font-medium text-ink">×{quantityPill}</Text>
                <Icon name="x" size={16} />
              </Pressable>
            ) : null}
            <ItemSuggestions
              suggestions={suggestions}
              heading={parsed.name ? t('lists.suggestions') : t('lists.frequent')}
              onPick={(s) => addItem(s)}
            />
          </Card>

          <Card>
            <SectionLabel
              right={
                <Text className="text-sm text-ink-muted">
                  {t('lists.toGet', { count: open.length })}
                </Text>
              }
            >
              {t('lists.items')}
            </SectionLabel>
            {open.length === 0 ? <EmptyState message={t('lists.emptyItems')} /> : null}
            <SortableList
              items={open}
              onReorder={(from, to) => reorderOpen(open, from, to)}
              onDragChange={setDragging}
              renderItem={(item, index, handle) => (
                <ItemRow
                  item={item}
                  first={index === 0}
                  onToggle={() => toggleItem(item)}
                  onDelete={() => removeItem(item)}
                  handle={handle}
                  onMoveUp={index > 0 ? () => reorderOpen(open, index, index - 1) : undefined}
                  onMoveDown={
                    index < open.length - 1 ? () => reorderOpen(open, index, index + 1) : undefined
                  }
                />
              )}
            />
            {done.length > 0 ? (
              <View className="mt-4 pt-4 border-t border-border">
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-sm text-ink-muted">
                    {t('lists.checked', { count: done.length })}
                  </Text>
                  <Button
                    label={t('lists.clearChecked')}
                    variant="ghost"
                    small
                    onPress={clearChecked}
                  />
                </View>
                {done.map((item, index) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    first={index === 0}
                    onToggle={() => toggleItem(item)}
                    onDelete={() => removeItem(item)}
                  />
                ))}
              </View>
            ) : null}
          </Card>

          <Button label={t('lists.deleteList')} variant="danger" onPress={removeList} />
        </ScreenScaffold>
        {toast}
      </View>
    );
  }

  return (
    <>
      <ScreenScaffold
        title={t(
          section === 'lists'
            ? 'lists.title'
            : section === 'recipes'
              ? 'recipes.title'
              : 'plan.title',
        )}
        right={
          section === 'lists' ? (
            <HeaderAddButton label={t('lists.newList')} onPress={() => setSheetOpen(true)} />
          ) : section === 'plan' ? undefined : (
            <HeaderAddButton label={t('recipes.newRecipe')} onPress={() => setChooserOpen(true)} />
          )
        }
      >
        {switcher}
        {/* The header and the switch stay mounted; only what is below them is swapped, and it fades in. */}
        <Animated.View
          key={section}
          entering={
            switched && !reduceMotion ? FadeIn.duration(STEP_MS).easing(STEP_EASING) : undefined
          }
        >
          {section === 'recipes' ? (
            <RecipesLibrary
              recipes={recipes.data}
              onOpen={(recipe) => setOpenRecipeId(recipe.id)}
              onOpenIngredients={() => setIngredientsOpen(true)}
            />
          ) : section === 'plan' ? (
            <PlanView
              recipes={recipes.data}
              lists={lists.data}
              items={items.data}
              onOpenList={(listId) => {
                // The generated list lives in the Lists section, so leave the plan behind.
                setSection('lists');
                setOpenListId(listId);
              }}
            />
          ) : (
            <>
              {lists.data.length === 0 ? (
                <Card>
                  <EmptyState message={t('lists.empty')} />
                </Card>
              ) : null}

              {lists.data.map((list) => {
                const all = itemsFor(list.id);
                const remaining = all.filter((i) => !i.isChecked).length;
                const done = all.length - remaining;
                return (
                  <TouchableOpacity
                    key={list.id}
                    onPress={() => setOpenListId(list.id)}
                    activeOpacity={0.7}
                    className="bg-surface rounded-2xl p-5 border border-border mb-3"
                  >
                    <View className="flex-row items-center">
                      <View className="w-10 h-10 rounded-full bg-surface-tint items-center justify-center mr-3">
                        <Icon name={listIconFor(list)} />
                      </View>
                      <View className="flex-1 mr-2">
                        <Text className="text-base font-semibold text-ink">{list.name}</Text>
                        <Text className="text-sm text-ink-muted mt-0.5">
                          {categoryLabel(t, list.category)}
                          {all.length > 0
                            ? ` · ${t('lists.progress', { done, total: all.length })}`
                            : ''}
                        </Text>
                      </View>
                      <Text className="text-sm font-medium text-action">
                        {t('lists.toGet', { count: remaining })}
                      </Text>
                    </View>
                    {all.length > 0 ? (
                      <View
                        className="h-1 rounded-full bg-surface-sunken mt-3 overflow-hidden"
                        accessible={false}
                      >
                        <View
                          className="h-1 bg-action"
                          style={{ width: `${Math.round((done / all.length) * 100)}%` }}
                        />
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </>
          )}
        </Animated.View>
      </ScreenScaffold>
      <NewListWizard
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        recipes={recipes.data}
        lists={lists.data}
        onCreated={(listId) => {
          setSheetOpen(false);
          setOpenListId(listId);
        }}
      />
      {recipeSheet}
      {chooserSheet}
      {importSheet}
      <IngredientsScreen
        visible={ingredientsOpen}
        onClose={() => setIngredientsOpen(false)}
        recipes={recipes.data}
      />
    </>
  );
};

const ItemRow: React.FC<{
  item: ListItem;
  first: boolean;
  onToggle: () => void;
  onDelete: () => void;
  /** The drag grip, for items that can be reordered. */
  handle?: React.ReactNode;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}> = ({ item, first, onToggle, onDelete, handle, onMoveUp, onMoveDown }) => {
  const { t } = useTranslation();
  const quantity = formatQuantity(item.quantity, item.unit);
  // Items made from a plan say which recipes want them: "Carbonara, Lentil soup".
  const source = item.contributions
    ? [...new Set(item.contributions.map((c) => c.recipeName))].join(', ')
    : null;
  return (
    <View>
      {first ? null : <View className="h-px bg-border my-1" />}
      <SwipeToDelete
        onDelete={onDelete}
        deleteLabel={t('lists.deleteItem', { name: item.name })}
        extraActions={[
          ...(onMoveUp ? [{ name: 'moveUp', label: t('lists.moveUp'), onAction: onMoveUp }] : []),
          ...(onMoveDown
            ? [{ name: 'moveDown', label: t('lists.moveDown'), onAction: onMoveDown }]
            : []),
        ]}
      >
        <View className="flex-row items-center">
          <Checkbox
            checked={item.isChecked}
            onToggle={onToggle}
            label={t(item.isChecked ? 'lists.uncheck' : 'lists.check', { name: item.name })}
          />
          <View className="flex-1">
            <Text
              className={`text-sm ${item.isChecked ? 'text-ink-muted line-through' : 'text-ink font-medium'}`}
            >
              {item.name}
            </Text>
            {source ? (
              <Text className="text-xs text-ink-muted mt-0.5" numberOfLines={1}>
                {source}
              </Text>
            ) : null}
          </View>
          {quantity ? <Text className="text-sm text-ink-muted">{quantity}</Text> : null}
          {handle}
        </View>
      </SwipeToDelete>
    </View>
  );
};
