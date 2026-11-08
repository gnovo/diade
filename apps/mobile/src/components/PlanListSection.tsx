import React, { useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatDateRange } from '@diade/i18n';
import {
  buildGroceryList,
  diffPlanAgainstList,
  groceryAmount,
  isEmptyDiff,
  missingStaples,
  parseDateOnly,
  type GroceryRow,
  type ListItem,
  type MealPlan,
  type PlanListItem,
  type Recipe,
  type SharedList,
} from '@diade/domain';
import { getActiveMealPlans } from '../data/queries';
import { addStapleToList, applyPlanDiff } from '../data/mealPlanActions';
import { useLiveQuery } from '../data/useLiveQuery';
import { Icon } from '../design';
import { BottomSheet } from './BottomSheet';
import { Button, Card, SectionLabel, useWriteContext } from './ui';

/** The items that came from the plan: only those carry contributions. */
export function planItemsOf(items: ListItem[]): PlanListItem[] {
  return items.flatMap((item) =>
    item.contributions && item.contributions.length > 0
      ? [
          {
            id: item.id,
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            isChecked: item.isChecked,
            editedByHand: item.editedByHand,
            contributions: item.contributions,
          },
        ]
      : [],
  );
}

/** "400 g", "3", or "" for a row that is only "to taste". */
const amountText = (row: Pick<GroceryRow, 'quantity' | 'unit'>): string => {
  const { quantity, unit } = groceryAmount(row);
  return quantity === null ? '' : unit ? `${quantity} ${unit}` : quantity;
};

const DiffGroup: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <View className="mb-4">
    <SectionLabel>{title}</SectionLabel>
    {children}
  </View>
);

const DiffLine: React.FC<{ name: string; detail?: string; note?: string }> = ({ name, detail, note }) => (
  <View className="flex-row items-center min-h-[44px] py-1">
    <View className="flex-1 mr-2">
      <Text className="text-sm font-medium text-ink">{name}</Text>
      {note ? <Text className="text-xs text-ink-muted mt-0.5">{note}</Text> : null}
    </View>
    {detail ? <Text className="text-sm text-ink-muted">{detail}</Text> : null}
  </View>
);

/**
 * What belongs on top of a list that was generated from a plan: where it came from, "Update from plan"
 * (a diff the member confirms, never silent) and the pantry staples the plan left out.
 * `items` are the list's visible items.
 */
export const PlanListSection: React.FC<{ list: SharedList; items: ListItem[]; recipes: Recipe[] }> = ({
  list,
  items,
  recipes,
}) => {
  const { t } = useTranslation();
  const ctx = useWriteContext();
  const plans = useLiveQuery(getActiveMealPlans, [] as MealPlan[]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [staplesOpen, setStaplesOpen] = useState(false);

  const plan = plans.data.find((p) => p.id === list.planId) ?? null;
  const planItems = useMemo(() => planItemsOf(items), [items]);
  const build = useMemo(() => (plan ? buildGroceryList(plan.recipes, recipes) : null), [plan, recipes]);
  const diff = useMemo(() => (build ? diffPlanAgainstList(build, planItems) : null), [build, planItems]);
  const staples = useMemo(() => (build ? missingStaples(build, planItems) : []), [build, planItems]);

  if (!plan || !build || !diff) {
    return (
      <Card>
        <Text className="text-sm leading-5 text-ink-muted">{t('plan.list.planGone')}</Text>
      </Card>
    );
  }

  const dates = { from: parseDateOnly(plan.startsOn), to: parseDateOnly(plan.endsOn) };
  const range = dates.from && dates.to ? formatDateRange(t, dates.from, dates.to) : '';
  const nothingToDo = isEmptyDiff(diff);

  const apply = async () => {
    if (!ctx) return;
    try {
      await applyPlanDiff(ctx, list.id, diff);
      setSheetOpen(false);
    } catch (err) {
      Alert.alert(t('plan.update.couldNotApply'), err instanceof Error ? err.message : t('common.tryAgain'));
    }
  };

  const addStaple = (index: number) => {
    if (!ctx) return;
    addStapleToList(ctx, list.id, staples[index]).catch((err) =>
      Alert.alert(t('plan.list.couldNotAdd'), err instanceof Error ? err.message : t('common.tryAgain')),
    );
  };

  return (
    <>
      <Card>
        <View className="flex-row items-center">
          <View className="flex-1 mr-3">
            <Text className="text-base font-semibold text-ink">{t('plan.list.fromPlan', { range })}</Text>
            <Text className="text-sm text-ink-muted mt-0.5">
              {t('plan.list.summary', { count: plan.recipes.length, items: planItems.length })}
            </Text>
          </View>
          <Button label={t('plan.list.update')} variant="ghost" small onPress={() => setSheetOpen(true)} />
        </View>
      </Card>

      {staples.length > 0 ? (
        <View className="bg-surface-sunken rounded-2xl p-4 mb-4">
          <Pressable
            onPress={() => setStaplesOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityState={{ expanded: staplesOpen }}
            className="flex-row items-center min-h-[48px] -my-2"
          >
            <View className="flex-1 mr-2">
              <Text className="text-sm font-semibold text-ink">
                {t('plan.list.staplesHeading', { count: staples.length })}
              </Text>
              <Text className="text-xs text-ink-muted mt-0.5">{t('plan.list.staplesHint')}</Text>
            </View>
            <Icon name={staplesOpen ? 'chevron-up' : 'chevron-down'} size={18} />
          </Pressable>
          {staplesOpen ? (
            <View className="flex-row flex-wrap gap-2 mt-3">
              {staples.map((row, index) => (
                <Pressable
                  key={row.key}
                  onPress={() => addStaple(index)}
                  accessibilityRole="button"
                  accessibilityLabel={t('plan.list.addStaple', { name: row.name })}
                  className="flex-row items-center min-h-[48px] px-4 rounded-full bg-surface border border-border-strong active:opacity-60"
                >
                  <Icon name="plus" size={16} />
                  <Text className="text-sm font-medium text-ink ml-1">{row.name}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      <BottomSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={t('plan.update.title')}
        footer={nothingToDo ? undefined : <Button label={t('plan.update.apply')} onPress={apply} />}
      >
        {nothingToDo ? (
          <Text className="text-sm leading-5 text-ink-muted">{t('plan.update.upToDate')}</Text>
        ) : (
          <>
            <Text className="text-sm leading-5 text-ink-muted mb-4">{t('plan.update.intro')}</Text>
            {diff.added.length > 0 ? (
              <DiffGroup title={t('plan.update.add')}>
                {diff.added.map((row) => (
                  <DiffLine key={row.key} name={row.name} detail={amountText(row)} />
                ))}
              </DiffGroup>
            ) : null}
            {diff.changed.length > 0 ? (
              <DiffGroup title={t('plan.update.change')}>
                {diff.changed.map(({ item, from, to }) => (
                  <DiffLine
                    key={item.id}
                    name={item.name}
                    detail={t('plan.update.changeLine', { from: from || '–', to: to || '–' })}
                    note={item.isChecked ? t('plan.update.checkedNote') : undefined}
                  />
                ))}
              </DiffGroup>
            ) : null}
            {diff.removed.length > 0 ? (
              <DiffGroup title={t('plan.update.remove')}>
                {diff.removed.map((item) => (
                  <DiffLine key={item.id} name={item.name} />
                ))}
              </DiffGroup>
            ) : null}
            {diff.kept.length > 0 ? (
              <DiffGroup title={t('plan.update.keep')}>
                {diff.kept.map(({ item, row }) => (
                  <DiffLine
                    key={item.id}
                    name={item.name}
                    note={
                      row ? t('plan.update.keepWants', { amount: amountText(row) || '–' }) : t('plan.update.keepGone')
                    }
                  />
                ))}
              </DiffGroup>
            ) : null}
          </>
        )}
      </BottomSheet>
    </>
  );
};
