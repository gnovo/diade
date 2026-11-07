import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Pressable, Alert, BackHandler } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from '@diade/i18n';
import { listIconFor, type ListItem, type SharedList } from '@diade/domain';
import { getActiveLists, getActiveListItems, getItemHistory, type ItemHistoryRow } from '../data/queries';
import { insertRecord, updateRecord, updateRecords, deleteRecord } from '../data/repository';
import { useLiveQuery } from '../data/useLiveQuery';
import {
  Button,
  Card,
  Checkbox,
  EmptyState,
  HeaderAddButton,
  ScreenScaffold,
  SectionLabel,
  TextField,
  useWriteContext,
} from '../components/ui';
import { NewListSheet, type NewListRequest } from '../components/NewListSheet';
import { ItemSuggestions } from '../components/ItemSuggestions';
import { SortableList } from '../components/SortableList';
import { SwipeToDelete } from '../components/SwipeToDelete';
import { UndoToast } from '../components/UndoToast';
import { Icon } from '../design';
import { dictionaryFor } from '../lists/dictionary';
import { formatQuantity, parseQuantity } from '../lists/parseQuantity';
import { capitalizeFirst, normalizeText } from '../lists/normalize';
import { suggest, type HistoryEntry, type Suggestion } from '../lists/suggest';
import { moveItem } from '../lists/reorder';
import { useUndoableDelete } from '../lists/useUndoableDelete';

const categoryLabel = (t: TFunction, category: SharedList['category']): string => t(`lists.category.${category}`);

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
  const itemsFor = (listId: string) => items.data.filter((i) => i.listId === listId && !hiddenIds.has(i.id));

  const parsed = quantityDismissed
    ? { name: newItemText.trim(), quantity: null, unit: null }
    : parseQuantity(newItemText);

  const suggestions = useMemo(() => {
    if (!openList) return [];
    return suggest({
      query: parsed.name,
      history: historyFor(history.data, openList.category),
      dictionary: dictionaryFor(i18n.language, openList.category),
      existing: itemsFor(openList.id),
    });
    // itemsFor closes over items and hiddenIds, so list them instead of the function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openList, parsed.name, history.data, items.data, hiddenIds, i18n.language]);

  const createList = async ({ name, template, starterNames }: NewListRequest) => {
    if (!ctx) return;
    try {
      const listId = await insertRecord('lists', ctx, { name, category: template.category, icon: template.icon });
      for (const starter of starterNames) {
        await insertRecord('list_items', ctx, { listId, name: starter, quantity: null, isChecked: false });
      }
      setSheetOpen(false);
      setOpenListId(listId);
    } catch (err) {
      Alert.alert(t('lists.couldNotCreate'), err instanceof Error ? err.message : t('common.tryAgain'));
    }
  };

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
        await updateRecord('list_items', checkedMatch.id, {
          isChecked: false,
          ...(parsed.quantity ? { quantity: parsed.quantity, unit: parsed.unit } : {}),
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
      Alert.alert(t('lists.couldNotAddItem'), err instanceof Error ? err.message : t('common.tryAgain'));
    }
  };

  /** Saves a new order for the unchecked items. `open` is the order currently on screen. */
  const reorderOpen = (open: ListItem[], from: number, to: number) => {
    const updates = moveItem(open, from, to).map(({ id, position }) => ({ id, changes: { position } }));
    updateRecords('list_items', updates).catch((err) =>
      Alert.alert(t('lists.couldNotReorder'), err instanceof Error ? err.message : t('common.tryAgain')),
    );
  };

  const toggleItem = (item: ListItem) => updateRecord('list_items', item.id, { isChecked: !item.isChecked });

  const removeItem = (item: ListItem) => undoable.schedule([item.id], t('lists.itemRemoved', { name: item.name }));

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
    <UndoToast message={undoable.pending.message} actionLabel={t('lists.undo')} onAction={undoable.undo} />
  ) : null;

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
            <SectionLabel right={<Text className="text-sm text-ink-muted">{t('lists.toGet', { count: open.length })}</Text>}>
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
                  onMoveDown={index < open.length - 1 ? () => reorderOpen(open, index, index + 1) : undefined}
                />
              )}
            />
            {done.length > 0 ? (
              <View className="mt-4 pt-4 border-t border-border">
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-sm text-ink-muted">{t('lists.checked', { count: done.length })}</Text>
                  <Button label={t('lists.clearChecked')} variant="ghost" small onPress={clearChecked} />
                </View>
                {done.map((item, index) => (
                  <ItemRow key={item.id} item={item} first={index === 0} onToggle={() => toggleItem(item)} onDelete={() => removeItem(item)} />
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
        title={t('lists.title')}
        right={<HeaderAddButton label={t('lists.newList')} onPress={() => setSheetOpen(true)} />}
      >
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
                    {all.length > 0 ? ` · ${t('lists.progress', { done, total: all.length })}` : ''}
                  </Text>
                </View>
                <Text className="text-sm font-medium text-action">{t('lists.toGet', { count: remaining })}</Text>
              </View>
              {all.length > 0 ? (
                <View className="h-1 rounded-full bg-surface-sunken mt-3 overflow-hidden" accessible={false}>
                  <View className="h-1 bg-action" style={{ width: `${Math.round((done / all.length) * 100)}%` }} />
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}

      </ScreenScaffold>
      <NewListSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} onCreate={createList} />
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
  return (
    <View>
      {first ? null : <View className="h-px bg-border my-1" />}
      <SwipeToDelete
        onDelete={onDelete}
        deleteLabel={t('lists.deleteItem', { name: item.name })}
        extraActions={[
          ...(onMoveUp ? [{ name: 'moveUp', label: t('lists.moveUp'), onAction: onMoveUp }] : []),
          ...(onMoveDown ? [{ name: 'moveDown', label: t('lists.moveDown'), onAction: onMoveDown }] : []),
        ]}
      >
        <View className="flex-row items-center">
          <Checkbox checked={item.isChecked} onToggle={onToggle} label={t(item.isChecked ? 'lists.uncheck' : 'lists.check', { name: item.name })} />
          <Text className={`flex-1 text-sm ${item.isChecked ? 'text-ink-muted line-through' : 'text-ink font-medium'}`}>
            {item.name}
          </Text>
          {quantity ? <Text className="text-sm text-ink-muted">{quantity}</Text> : null}
          {handle}
        </View>
      </SwipeToDelete>
    </View>
  );
};
