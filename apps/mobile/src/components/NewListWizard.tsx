import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  LIST_TEMPLATES,
  buildGroceryList,
  defaultPlanPeriod,
  getListTemplate,
  periodChoice,
  weekPeriod,
  type GroceryRow,
  type ListTemplateId,
  type MealPlan,
  type MealPlanRecipe,
  type PlanPeriod,
  type Recipe,
  type SharedList,
} from '@diade/domain';
import { getActiveMealPlans } from '../data/queries';
import { useLiveQuery } from '../data/useLiveQuery';
import { createEmptyList, createPlanList } from '../data/newListActions';
import {
  amountText,
  canStartFromPlan,
  chosenRows,
  planForPeriod,
  stepCount,
  wizardPath,
  type StartFrom,
} from '../data/newListFlow';
import { Icon, useColor } from '../design';
import { BottomSheet } from './BottomSheet';
import { DateField } from './DateField';
import { FilterChips } from './FilterChips';
import { RecipeChoiceList } from './RecipePicker';
import { FoldingFooter, StepPager, StepProgress } from './StepPager';
import { Button, Card, Checkbox, EmptyState, SectionLabel, Segmented, TextField, useWriteContext } from './ui';

/** Room for the pinned button: 8 above, 48 high, 16 below. */
const FOOTER_HEIGHT = 72;
/** Long enough to see which tile was chosen, short enough to feel automatic. */
const ADVANCE_MS = 260;

type Step = 1 | 2 | 3 | 4;
type PeriodChoice = 'thisWeek' | 'nextWeek' | 'custom';

/** One ingredient of the review: ticked means it goes on the list. */
const ReviewRow: React.FC<{ row: GroceryRow; on: boolean; first: boolean; onToggle: () => void }> = ({
  row,
  on,
  first,
  onToggle,
}) => {
  const { t } = useTranslation();
  const source = [...new Set(row.contributions.map((c) => c.recipeName))].join(', ');
  const amount = amountText(row);
  return (
    <View>
      {first ? null : <View className="h-px bg-border" />}
      <View className="flex-row items-center min-h-[56px] py-1">
        <Checkbox
          checked={on}
          onToggle={onToggle}
          label={t(on ? 'lists.wizard.exclude' : 'lists.wizard.include', { name: row.name })}
        />
        <Pressable onPress={onToggle} accessible={false} className="flex-1 mr-2">
          <Text className={`text-sm font-semibold ${on ? 'text-ink' : 'text-ink-muted'}`}>{row.name}</Text>
          {source ? (
            <Text className="text-xs text-ink-muted mt-0.5" numberOfLines={1}>
              {source}
            </Text>
          ) : null}
        </Pressable>
        {amount ? <Text className="text-sm text-ink-muted">{amount}</Text> : null}
      </View>
    </View>
  );
};

/**
 * Starts a list in up to four steps inside a bottom sheet: type, name (and where to start from), recipes,
 * review. Starting empty is two steps and ends on the name; starting from a meal plan (groceries only) adds the
 * recipes and a review, and makes the list from them. Same motion as the new-date wizard.
 *
 * The pager always has four steps, so the Empty / Meal plan switch on step 2 never remounts it (that would drop
 * the keyboard); the two plan-only steps are simply empty until the plan path is chosen.
 */
export const NewListWizard: React.FC<{
  visible: boolean;
  onClose: () => void;
  recipes: Recipe[];
  lists: SharedList[];
  /** Called with the new list's id once it has been written. */
  onCreated: (listId: string) => void;
}> = ({ visible, onClose, recipes, lists, onCreated }) => {
  const { t } = useTranslation();
  const ctx = useWriteContext();
  const ink = useColor('ink');
  const plans = useLiveQuery(getActiveMealPlans, [] as MealPlan[]);

  const defaultName = (id: ListTemplateId) => (id === 'blank' ? '' : t(`lists.template.${id}.name`));

  const [step, setStep] = useState<Step>(1);
  const [templateId, setTemplateId] = useState<ListTemplateId | null>(null);
  const [name, setName] = useState('');
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [start, setStart] = useState<StartFrom>('empty');
  const [period, setPeriod] = useState<PlanPeriod>(() => defaultPlanPeriod(new Date()));
  const [customOpen, setCustomOpen] = useState(false);
  const [selection, setSelection] = useState<MealPlanRecipe[]>([]);
  // Until the member picks or changes a recipe, the selection follows the plan for the chosen dates.
  const [touched, setTouched] = useState(false);
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [addedStaples, setAddedStaples] = useState<Set<string>>(new Set());
  const [staplesOpen, setStaplesOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    },
    [],
  );

  // Reset after the sheet has finished closing, so opening costs no extra render.
  const reset = () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    advanceTimer.current = null;
    setStep(1);
    setTemplateId(null);
    setName('');
    setSkipped(new Set());
    setStart('empty');
    setPeriod(defaultPlanPeriod(new Date()));
    setCustomOpen(false);
    setSelection([]);
    setTouched(false);
    setUnticked(new Set());
    setAddedStaples(new Set());
    setStaplesOpen(false);
    setSaving(false);
  };

  const today = new Date();
  const template = getListTemplate(templateId ?? 'blank');
  const path = templateId ? wizardPath(templateId, start) : 'empty';
  const total = stepCount(path);
  const known = useMemo(() => new Set(recipes.map((r) => r.id)), [recipes]);
  const build = useMemo(
    () => (path === 'plan' ? buildGroceryList(selection, recipes) : null),
    [path, selection, recipes],
  );
  const chosen = useMemo(
    () => (build ? chosenRows(build.rows, build.staples, unticked, addedStaples) : []),
    [build, unticked, addedStaples],
  );

  const starterLabel = (id: ListTemplateId, starter: string) =>
    t(`lists.template.${id}.starter.${starter}` as never) as string;

  const chooseType = (next: ListTemplateId) => {
    if (advanceTimer.current) return; // a second tap while advancing
    if (next !== templateId) {
      // Only replace the name when the member has not typed their own.
      if (name === '' || (templateId && name === defaultName(templateId))) setName(defaultName(next));
      // Everything that depended on the old type goes with it.
      setSkipped(new Set());
      setStart('empty');
      setSelection([]);
      setTouched(false);
      setUnticked(new Set());
      setAddedStaples(new Set());
      setStaplesOpen(false);
      setTemplateId(next);
    }
    advanceTimer.current = setTimeout(() => {
      advanceTimer.current = null;
      setStep(2);
    }, ADVANCE_MS);
  };

  const followPlan = (forPeriod: PlanPeriod) => setSelection(planForPeriod(plans.data, forPeriod)?.recipes ?? []);

  const chooseStart = (next: StartFrom) => {
    setStart(next);
    if (next === 'plan' && !touched) followPlan(period);
  };

  const changePeriod = (next: PlanPeriod) => {
    setPeriod(next);
    if (!touched) followPlan(next);
  };

  const choosePeriod = (choice: PeriodChoice) => {
    if (choice === 'custom') {
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    changePeriod(weekPeriod(today, choice === 'thisWeek' ? 0 : 1));
  };

  const changeSelection = (next: MealPlanRecipe[]) => {
    setTouched(true);
    setSelection(next);
  };

  const toggleIn = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  const goBack = () => setStep((s) => (s > 1 ? ((s - 1) as Step) : s));

  const canContinueName = name.trim().length > 0;

  const create = async () => {
    if (!ctx || !templateId || saving || !canContinueName) return;
    const trimmed = name.trim();
    setSaving(true);
    try {
      const listId =
        path === 'plan'
          ? await createPlanList(ctx, {
              name: trimmed,
              period,
              recipes: selection.filter((entry) => known.has(entry.recipeId)),
              rows: chosen,
              plans: plans.data,
              lists,
            })
          : await createEmptyList(
              ctx,
              trimmed,
              template,
              template.starterItems.filter((id) => !skipped.has(id)).map((id) => starterLabel(template.id, id)),
            );
      onCreated(listId);
    } catch (err) {
      setSaving(false);
      Alert.alert(t('lists.couldNotCreate'), err instanceof Error ? err.message : t('common.tryAgain'));
    }
  };

  // Step 2's primary action: create (empty) or carry on to the recipes (plan).
  const afterName = () => {
    if (!canContinueName) return;
    if (path === 'plan') setStep(3);
    else create();
  };

  const progress = (
    <View className="mb-5">
      <View className="flex-row items-center justify-between mb-3 min-h-[32px]">
        {step > 1 ? (
          <Pressable
            onPress={goBack}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            hitSlop={8}
            className="flex-row items-center -ml-1 active:opacity-70"
          >
            <Icon name="chevron-left" size={20} color={ink} />
            <Text className="text-sm font-semibold text-ink">{t(`lists.template.${template.id}.name`)}</Text>
          </Pressable>
        ) : (
          <View />
        )}
        <Text className="text-xs text-ink-muted" accessibilityLiveRegion="polite">
          {t('lists.wizard.step', { step, total })}
        </Text>
      </View>
      <StepProgress step={step} total={total} />
    </View>
  );

  const typeStep = (
    <>
      <Text className="text-title-2 font-bold text-ink mb-4">{t('lists.wizard.typeHeading')}</Text>
      <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
        {LIST_TEMPLATES.map((tpl) => {
          const selected = tpl.id === templateId;
          return (
            <Pressable
              key={tpl.id}
              onPress={() => chooseType(tpl.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected, checked: selected }}
              className={`items-center justify-center min-h-[72px] w-[31%] rounded-lg border px-2 ${
                selected ? 'border-action bg-surface-tint' : 'border-border bg-surface'
              }`}
            >
              <Icon name={tpl.icon} />
              <Text className="mt-1.5 text-sm font-medium text-ink text-center" numberOfLines={1}>
                {t(`lists.template.${tpl.id}.name`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );

  const nameStep = (
    <>
      <Text className="text-title-2 font-bold text-ink mb-4">{t('lists.wizard.nameHeading')}</Text>
      <TextField
        value={name}
        onChangeText={setName}
        placeholder={t('lists.newListPlaceholder')}
        accessibilityLabel={t('lists.listName')}
        maxLength={100}
        onSubmitEditing={afterName}
        returnKeyType={path === 'plan' ? 'next' : 'done'}
      />

      {templateId && canStartFromPlan(templateId) ? (
        <View className="mt-5">
          <SectionLabel>{t('lists.wizard.startFrom')}</SectionLabel>
          {recipes.length > 0 ? (
            <>
              <Segmented<StartFrom>
                value={start}
                onChange={chooseStart}
                options={[
                  { value: 'empty', label: t('lists.wizard.empty') },
                  { value: 'plan', label: t('lists.wizard.mealPlan') },
                ]}
              />
              {start === 'plan' ? (
                <Text className="text-sm leading-5 text-ink-muted mt-2">{t('lists.wizard.mealPlanHint')}</Text>
              ) : null}
            </>
          ) : (
            <Text className="text-sm leading-5 text-ink-muted">{t('lists.wizard.noRecipesHint')}</Text>
          )}
        </View>
      ) : null}

      {path === 'empty' && template.starterItems.length > 0 ? (
        <View className="mt-5">
          <SectionLabel>{t('lists.starterItems')}</SectionLabel>
          <View className="flex-row flex-wrap gap-2">
            {template.starterItems.map((id) => {
              const on = !skipped.has(id);
              const label = starterLabel(template.id, id);
              return (
                <Pressable
                  key={id}
                  onPress={() => setSkipped((prev) => toggleIn(prev, id))}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={t('lists.toggleStarter', { name: label })}
                  className={`flex-row items-center min-h-[48px] px-4 rounded-full border ${
                    on ? 'border-action bg-surface-tint' : 'border-border-strong bg-surface'
                  }`}
                >
                  {/* The tick keeps its space when off, so chips do not change width as they toggle. */}
                  <View style={{ width: 16, opacity: on ? 1 : 0 }}>
                    <Icon name="check" size={16} />
                  </View>
                  <Text className={`ml-1.5 text-sm font-medium ${on ? 'text-ink' : 'text-ink-muted'}`}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </>
  );

  const periodChoiceNow: PeriodChoice = customOpen ? 'custom' : periodChoice(period, today);

  const recipesStep =
    path === 'plan' ? (
      <>
        <Text className="text-title-2 font-bold text-ink mb-4">{t('lists.wizard.recipesHeading')}</Text>
        <FilterChips
          label={t('plan.periodLabel')}
          value={periodChoiceNow}
          onChange={choosePeriod}
          options={[
            { value: 'thisWeek', label: t('plan.thisWeek') },
            { value: 'nextWeek', label: t('plan.nextWeek') },
            { value: 'custom', label: t('plan.custom') },
          ]}
        />
        {periodChoiceNow === 'custom' ? (
          <Card>
            <View className="gap-3">
              <View>
                <SectionLabel>{t('plan.from')}</SectionLabel>
                <DateField
                  label={t('plan.from')}
                  value={period.startsOn}
                  onChange={(startsOn) =>
                    changePeriod(startsOn > period.endsOn ? { startsOn, endsOn: startsOn } : { ...period, startsOn })
                  }
                />
              </View>
              <View>
                <SectionLabel>{t('plan.to')}</SectionLabel>
                <DateField
                  label={t('plan.to')}
                  value={period.endsOn}
                  onChange={(endsOn) =>
                    changePeriod(endsOn < period.startsOn ? { startsOn: endsOn, endsOn } : { ...period, endsOn })
                  }
                />
              </View>
            </View>
          </Card>
        ) : null}
        <RecipeChoiceList recipes={recipes} selected={selection} onChange={changeSelection} />
      </>
    ) : null;

  const staplesLeft = build ? build.staples.filter((row) => !addedStaples.has(row.key)) : [];
  const reviewStep =
    path === 'plan' && build ? (
      <>
        <Text className="text-title-2 font-bold text-ink mb-1">{t('lists.wizard.reviewHeading')}</Text>
        <Text className="text-sm text-ink-muted">
          {t('plan.toBuy', { count: chosen.length })}
          {staplesLeft.length > 0 ? ` · ${t('plan.staplesLeftOut', { count: staplesLeft.length })}` : ''}
        </Text>
        <Text className="text-xs text-ink-muted mt-0.5 mb-3">{t('lists.wizard.reviewHint')}</Text>

        {build.rows.length === 0 ? (
          <Card>
            <EmptyState message={t('lists.wizard.nothingToBuy')} />
          </Card>
        ) : (
          <Card>
            {build.rows.map((row, index) => (
              <ReviewRow
                key={row.key}
                row={row}
                on={!unticked.has(row.key)}
                first={index === 0}
                onToggle={() => setUnticked((prev) => toggleIn(prev, row.key))}
              />
            ))}
          </Card>
        )}

        {build.staples.length > 0 ? (
          <View className="bg-surface-sunken rounded-2xl p-4 mb-4">
            <Pressable
              onPress={() => setStaplesOpen((open) => !open)}
              accessibilityRole="button"
              accessibilityState={{ expanded: staplesOpen }}
              className="flex-row items-center min-h-[48px] -my-2"
            >
              <View className="flex-1 mr-2">
                <Text className="text-sm font-semibold text-ink">
                  {t('plan.list.staplesHeading', { count: staplesLeft.length })}
                </Text>
                <Text className="text-xs text-ink-muted mt-0.5">{t('plan.list.staplesHint')}</Text>
              </View>
              <Icon name={staplesOpen ? 'chevron-up' : 'chevron-down'} size={18} />
            </Pressable>
            {staplesOpen ? (
              <View className="mt-2">
                {build.staples.map((row, index) => (
                  <ReviewRow
                    key={row.key}
                    row={row}
                    on={addedStaples.has(row.key)}
                    first={index === 0}
                    onToggle={() => setAddedStaples((prev) => toggleIn(prev, row.key))}
                  />
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </>
    ) : null;

  const footer = (
    <FoldingFooter open={step > 1} height={FOOTER_HEIGHT}>
      <View className="px-4 pt-2 pb-4">
        {step === 2 ? (
          <Button
            label={path === 'plan' ? t('lists.wizard.continue') : t('lists.createList')}
            onPress={afterName}
            disabled={!canContinueName || saving}
          />
        ) : step === 3 ? (
          <Button
            label={
              selection.length > 0
                ? t('lists.wizard.continueRecipes', { count: selection.length })
                : t('lists.wizard.continue')
            }
            onPress={() => setStep(4)}
            disabled={selection.length === 0}
          />
        ) : (
          <Button label={t('lists.createList')} onPress={create} disabled={chosen.length === 0 || saving} />
        )}
      </View>
    </FoldingFooter>
  );

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      onClosed={reset}
      title={t('lists.newList')}
      footer={footer}
      bareFooter
    >
      {progress}
      <StepPager index={step - 1} steps={[typeStep, nameStep, recipesStep, reviewStep]} />
    </BottomSheet>
  );
};
