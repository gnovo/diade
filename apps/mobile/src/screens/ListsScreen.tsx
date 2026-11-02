import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from '@diade/i18n';
import type { ListItem, SharedList } from '@diade/domain';
import { getActiveLists, getActiveListItems } from '../data/queries';
import { insertRecord, updateRecord, deleteRecord } from '../data/repository';
import { useLiveQuery } from '../data/useLiveQuery';
import {
  Button,
  Card,
  Checkbox,
  EmptyState,
  ScreenScaffold,
  SectionLabel,
  SyncBadge,
  TextField,
  useWriteContext,
} from '../components/ui';

/** Built-in categories have a translated name; anything else is shown as stored. */
const categoryLabel = (t: TFunction, category: string): string =>
  category === 'groceries' ? t('lists.category.groceries') : category;

export const ListsScreen: React.FC = () => {
  const { t } = useTranslation();
  const ctx = useWriteContext();
  const lists = useLiveQuery(getActiveLists, [] as SharedList[]);
  const items = useLiveQuery(getActiveListItems, [] as ListItem[]);
  const [openListId, setOpenListId] = useState<string | null>(null);
  const [newListName, setNewListName] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemQuantity, setNewItemQuantity] = useState('');

  const openList = lists.data.find((l) => l.id === openListId) ?? null;
  const itemsFor = (listId: string) => items.data.filter((i) => i.listId === listId);

  const createList = async () => {
    const name = newListName.trim();
    if (!name || !ctx) return;
    try {
      await insertRecord('lists', ctx, { name, category: 'groceries', icon: null });
      setNewListName('');
    } catch (err) {
      Alert.alert(t('lists.couldNotCreate'), err instanceof Error ? err.message : t('common.tryAgain'));
    }
  };

  const addItem = async () => {
    const name = newItemName.trim();
    if (!name || !openList || !ctx) return;
    try {
      await insertRecord('list_items', ctx, {
        listId: openList.id,
        name,
        quantity: newItemQuantity.trim() || null,
        isChecked: false,
      });
      setNewItemName('');
      setNewItemQuantity('');
    } catch (err) {
      Alert.alert(t('lists.couldNotAddItem'), err instanceof Error ? err.message : t('common.tryAgain'));
    }
  };

  const toggleItem = (item: ListItem) => updateRecord('list_items', item.id, { isChecked: !item.isChecked });

  const clearChecked = () => {
    if (!openList) return;
    const checked = itemsFor(openList.id).filter((i) => i.isChecked);
    if (checked.length === 0) return;
    Alert.alert(t('lists.clearTitle'), t('lists.clearBody', { count: checked.length, name: openList.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('lists.clearChecked'),
        style: 'destructive',
        onPress: async () => {
          for (const item of checked) await deleteRecord('list_items', item.id);
        },
      },
    ]);
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

  if (openList) {
    const listItems = itemsFor(openList.id);
    const open = listItems.filter((i) => !i.isChecked);
    const done = listItems.filter((i) => i.isChecked);

    return (
      <ScreenScaffold
        eyebrow={categoryLabel(t, openList.category)}
        title={openList.name}
        right={<Button label={t('common.back')} variant="ghost" small onPress={() => setOpenListId(null)} />}
      >
        <View className="mb-4">
          <SyncBadge />
        </View>

        <Card>
          <View className="flex-row gap-2 mb-3">
            <View className="flex-1">
              <TextField value={newItemName} onChangeText={setNewItemName} placeholder={t('lists.addItemPlaceholder')} maxLength={200} onSubmitEditing={addItem} returnKeyType="done" />
            </View>
            <View className="w-20">
              <TextField value={newItemQuantity} onChangeText={setNewItemQuantity} placeholder={t('lists.quantityPlaceholder')} maxLength={50} />
            </View>
          </View>
          <Button label={t('lists.addItem')} onPress={addItem} disabled={!newItemName.trim()} />
        </Card>

        <Card>
          <SectionLabel right={<Text className="text-sm text-ink-muted">{t('lists.toGet', { count: open.length })}</Text>}>{t('lists.items')}</SectionLabel>
          {open.length === 0 ? <EmptyState message={t('lists.emptyItems')} /> : null}
          {open.map((item, index) => (
            <ItemRow key={item.id} item={item} first={index === 0} onToggle={() => toggleItem(item)} />
          ))}
          {done.length > 0 ? (
            <View className="mt-4 pt-4 border-t border-border">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-sm text-ink-muted">{t('lists.checked', { count: done.length })}</Text>
                <Button label={t('lists.clearChecked')} variant="ghost" small onPress={clearChecked} />
              </View>
              {done.map((item) => (
                <ItemRow key={item.id} item={item} first onToggle={() => toggleItem(item)} />
              ))}
            </View>
          ) : null}
        </Card>

        <Button label={t('lists.deleteList')} variant="danger" onPress={removeList} />
      </ScreenScaffold>
    );
  }

  return (
    <ScreenScaffold eyebrow={t('lists.eyebrow')} title={t('lists.title')} right={<SyncBadge />}>
      {lists.data.length === 0 ? (
        <Card>
          <EmptyState message={t('lists.empty')} />
        </Card>
      ) : null}

      {lists.data.map((list) => {
        const remaining = itemsFor(list.id).filter((i) => !i.isChecked).length;
        return (
          <TouchableOpacity
            key={list.id}
            onPress={() => setOpenListId(list.id)}
            activeOpacity={0.7}
            className="bg-surface rounded-2xl p-5 border border-border mb-3 flex-row items-center justify-between"
          >
            <View>
              <Text className="text-base font-semibold text-ink">{list.name}</Text>
              <Text className="text-sm text-ink-muted mt-0.5 capitalize">{categoryLabel(t, list.category)}</Text>
            </View>
            <Text className="text-sm font-medium text-action">{t('lists.toGet', { count: remaining })}</Text>
          </TouchableOpacity>
        );
      })}

      <Card>
        <SectionLabel>{t('lists.newList')}</SectionLabel>
        <TextField value={newListName} onChangeText={setNewListName} placeholder={t('lists.newListPlaceholder')} maxLength={100} onSubmitEditing={createList} returnKeyType="done" />
        <View className="mt-3">
          <Button label={t('lists.createList')} onPress={createList} disabled={!newListName.trim()} />
        </View>
      </Card>
    </ScreenScaffold>
  );
};

const ItemRow: React.FC<{ item: ListItem; first: boolean; onToggle: () => void }> = ({ item, first, onToggle }) => {
  const { t } = useTranslation();
  return (
  <View>
    {first ? null : <View className="h-px bg-border my-3" />}
    <View className="flex-row items-center">
      <Checkbox checked={item.isChecked} onToggle={onToggle} label={t(item.isChecked ? 'lists.uncheck' : 'lists.check', { name: item.name })} />
      <Text className={`flex-1 text-sm ${item.isChecked ? 'text-ink-muted line-through' : 'text-ink font-medium'}`}>
        {item.name}
      </Text>
      {item.quantity ? <Text className="text-sm text-ink-muted">{item.quantity}</Text> : null}
    </View>
  </View>
);
};
