import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
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

export const ListsScreen: React.FC = () => {
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
      Alert.alert('Could not create list', err instanceof Error ? err.message : 'Please try again.');
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
      Alert.alert('Could not add item', err instanceof Error ? err.message : 'Please try again.');
    }
  };

  const toggleItem = (item: ListItem) => updateRecord('list_items', item.id, { isChecked: !item.isChecked });

  const clearChecked = () => {
    if (!openList) return;
    const checked = itemsFor(openList.id).filter((i) => i.isChecked);
    if (checked.length === 0) return;
    Alert.alert('Clear checked items?', `Remove ${checked.length} item${checked.length === 1 ? '' : 's'} from ${openList.name}.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          for (const item of checked) await deleteRecord('list_items', item.id);
        },
      },
    ]);
  };

  const removeList = () => {
    if (!openList) return;
    Alert.alert('Delete this list?', `"${openList.name}" and its items will be removed for both of you.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
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
        eyebrow={openList.category}
        title={openList.name}
        right={<Button label="Back" variant="ghost" small onPress={() => setOpenListId(null)} />}
      >
        <View className="mb-4">
          <SyncBadge />
        </View>

        <Card>
          <View className="flex-row gap-2 mb-3">
            <View className="flex-1">
              <TextField value={newItemName} onChangeText={setNewItemName} placeholder="Add an item" maxLength={200} onSubmitEditing={addItem} returnKeyType="done" />
            </View>
            <View className="w-20">
              <TextField value={newItemQuantity} onChangeText={setNewItemQuantity} placeholder="Qty" maxLength={50} />
            </View>
          </View>
          <Button label="Add item" onPress={addItem} disabled={!newItemName.trim()} />
        </Card>

        <Card>
          <SectionLabel right={<Text className="text-sm text-ink-muted">{open.length} to get</Text>}>Items</SectionLabel>
          {open.length === 0 ? <EmptyState message="Nothing on this list yet." /> : null}
          {open.map((item, index) => (
            <ItemRow key={item.id} item={item} first={index === 0} onToggle={() => toggleItem(item)} />
          ))}
          {done.length > 0 ? (
            <View className="mt-4 pt-4 border-t border-border">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-sm text-ink-muted">{done.length} checked</Text>
                <Button label="Clear checked" variant="ghost" small onPress={clearChecked} />
              </View>
              {done.map((item) => (
                <ItemRow key={item.id} item={item} first onToggle={() => toggleItem(item)} />
              ))}
            </View>
          ) : null}
        </Card>

        <Button label="Delete list" variant="danger" onPress={removeList} />
      </ScreenScaffold>
    );
  }

  return (
    <ScreenScaffold eyebrow="Shared" title="Lists" right={<SyncBadge />}>
      {lists.data.length === 0 ? (
        <Card>
          <EmptyState message="No lists yet. Start with groceries." />
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
              <Text className="text-sm text-ink-muted mt-0.5 capitalize">{list.category}</Text>
            </View>
            <Text className="text-sm font-medium text-action">{remaining} to get</Text>
          </TouchableOpacity>
        );
      })}

      <Card>
        <SectionLabel>New list</SectionLabel>
        <TextField value={newListName} onChangeText={setNewListName} placeholder="Groceries, pharmacy, packing…" maxLength={100} onSubmitEditing={createList} returnKeyType="done" />
        <View className="mt-3">
          <Button label="Create list" onPress={createList} disabled={!newListName.trim()} />
        </View>
      </Card>
    </ScreenScaffold>
  );
};

const ItemRow: React.FC<{ item: ListItem; first: boolean; onToggle: () => void }> = ({ item, first, onToggle }) => (
  <View>
    {first ? null : <View className="h-px bg-border my-3" />}
    <View className="flex-row items-center">
      <Checkbox checked={item.isChecked} onToggle={onToggle} label={`${item.isChecked ? 'Uncheck' : 'Check'} ${item.name}`} />
      <Text className={`flex-1 text-sm ${item.isChecked ? 'text-ink-muted line-through' : 'text-ink font-medium'}`}>
        {item.name}
      </Text>
      {item.quantity ? <Text className="text-sm text-ink-muted">{item.quantity}</Text> : null}
    </View>
  </View>
);
