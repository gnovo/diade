import {
  applyNameSuggestion,
  type DraftLine,
  type DraftRecipe,
  draftLineFromText,
  draftToRecipeInput,
  flagSimilarNames,
  formatAmount,
  isImportable,
  normalizeIngredientName,
  parseRecipesMarkdown,
  type Recipe,
} from '@diade/domain';
import type React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, Text, View } from 'react-native';
import { newId } from '../data/ids';
import { importRecipes } from '../data/recipeImportActions';
import { useIngredientCatalog } from '../data/useIngredientCatalog';
import { Icon } from '../design';
import { BottomSheet } from './BottomSheet';
import { decimalFor } from './RecipeForm';
import { StepPager } from './StepPager';
import { Button, Card, Checkbox, EmptyState, SectionLabel, TextField, useWriteContext } from './ui';

interface ReviewRecipe {
  draft: DraftRecipe;
  include: boolean;
  open: boolean;
  /** Already in the library under the same name. Left out unless the member opts in. */
  duplicate: boolean;
}

/** A member's confirmation of a flagged line. A line that still cannot be saved keeps its flag. */
function fixedLine(id: string, text: string): DraftLine | null {
  const line = draftLineFromText(id, text);
  if (!line) return null;
  return isImportable(line) ? { ...line, flag: null } : line;
}

const canImport = (review: ReviewRecipe): boolean =>
  review.include && review.draft.name.trim().length > 0 && review.draft.lines.some(isImportable);

const ReviewLine: React.FC<{
  line: DraftLine;
  first: boolean;
  decimal: string;
  fixing: boolean;
  fixText: string;
  onFixText: (text: string) => void;
  onStartFix: () => void;
  onFinishFix: () => void;
  onUseSuggestion: (suggestion: string) => void;
}> = ({
  line,
  first,
  decimal,
  fixing,
  fixText,
  onFixText,
  onStartFix,
  onFinishFix,
  onUseSuggestion,
}) => {
  const { t } = useTranslation();
  const { ingredient, flag } = line;
  // A line that cannot be read shows the text as written: what the parser made of it is noise.
  const readable = flag === null || isImportable(line);
  const amount = readable ? formatAmount(ingredient.quantity, ingredient.unit, decimal) : '';

  return (
    <View>
      {first ? null : <View className="h-px bg-border" />}
      {fixing ? (
        <View className="py-2">
          <TextField
            value={fixText}
            onChangeText={onFixText}
            onSubmitEditing={onFinishFix}
            onBlur={onFinishFix}
            placeholder={t('recipes.import.fixPlaceholder')}
            accessibilityLabel={t('recipes.import.fixLabel', { line: line.raw })}
            maxLength={200}
            autoFocus
            autoCorrect={false}
            returnKeyType="done"
          />
        </View>
      ) : (
        <View
          className={
            flag
              ? 'my-1 py-1 px-2 border border-border-strong rounded-md'
              : 'min-h-[44px] px-2 border border-transparent'
          }
        >
          <View className="flex-row items-center min-h-[40px]">
            {/* Every row has the same badge slot and amount column, so the names line up. */}
            {flag ? (
              <View className="w-6 h-6 rounded-full border border-border-strong items-center justify-center mr-2">
                <Text className="text-xs font-bold text-ink">?</Text>
              </View>
            ) : (
              <View className="w-6 mr-2" />
            )}
            {readable ? <Text className="w-16 text-sm text-ink-muted">{amount}</Text> : null}
            <Text className="flex-1 text-sm font-medium text-ink mr-2">
              {readable ? ingredient.name : line.raw}
              {line.convertedFrom ? (
                <Text className="text-ink-muted font-normal">
                  {`  (${t('recipes.import.convertedFrom', { amount: line.convertedFrom })})`}
                </Text>
              ) : null}
              {ingredient.staple && readable ? (
                <Text className="text-ink-muted font-normal">{` · ${t('recipes.form.pantry').toLowerCase()}`}</Text>
              ) : null}
            </Text>
            {flag ? (
              <Button
                label={t('recipes.import.fix')}
                variant="outline"
                small
                onPress={onStartFix}
              />
            ) : null}
          </View>
          {flag ? (
            <Text className="text-xs leading-4 text-ink-muted pb-1">
              {t(`recipes.import.flag.${flag}`, { name: line.suggestion ?? '' })}
            </Text>
          ) : null}
          {line.suggestion ? (
            <View className="flex-row pb-1">
              <Button
                label={t('recipes.form.useName', { name: line.suggestion })}
                variant="soft"
                small
                onPress={() => line.suggestion && onUseSuggestion(line.suggestion)}
              />
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
};

const ReviewCard: React.FC<{
  review: ReviewRecipe;
  decimal: string;
  onChange: (next: ReviewRecipe) => void;
}> = ({ review, decimal, onChange }) => {
  const { t } = useTranslation();
  const { draft } = review;
  const [fixing, setFixing] = useState<{ id: string; text: string } | null>(null);
  const flagged = draft.lines.filter((line) => line.flag).length;
  const hasName = draft.name.trim().length > 0;
  const usable = hasName && draft.lines.some(isImportable);

  const setLines = (lines: DraftLine[]) => onChange({ ...review, draft: { ...draft, lines } });

  const applySuggestion = (id: string, raw: string, suggestion: string) => {
    const next = fixedLine(id, applyNameSuggestion(raw, suggestion));
    setLines(next ? draft.lines.map((line) => (line.id === id ? next : line)) : draft.lines);
  };

  const finishFix = () => {
    if (!fixing) return;
    const next = fixedLine(fixing.id, fixing.text);
    setLines(
      next
        ? draft.lines.map((line) => (line.id === fixing.id ? next : line))
        : draft.lines.filter((line) => line.id !== fixing.id),
    );
    setFixing(null);
  };

  const summary = !usable
    ? hasName
      ? t('recipes.import.noIngredients')
      : t('recipes.import.needsName')
    : flagged > 0
      ? t('recipes.import.toCheck', { count: flagged })
      : t('recipes.import.allRead', { count: draft.lines.length });

  return (
    <Card>
      <View className="flex-row items-center">
        <Checkbox
          checked={review.include && usable}
          onToggle={() => usable && onChange({ ...review, include: !review.include })}
          label={t('recipes.import.include', { name: draft.name })}
        />
        <Pressable
          onPress={() => onChange({ ...review, open: !review.open })}
          accessibilityRole="button"
          accessibilityState={{ expanded: review.open }}
          className="flex-1 flex-row items-center min-h-[48px]"
        >
          <View className="flex-1">
            <Text className="text-base font-semibold text-ink">
              {hasName ? draft.name : t('recipes.import.unnamed')}
            </Text>
            <Text className="text-sm text-ink-muted">
              {t('recipes.servings', { count: draft.servings })}
              {' · '}
              {summary}
            </Text>
          </View>
          <Icon name={review.open ? 'chevron-up' : 'chevron-down'} size={18} />
        </Pressable>
      </View>

      {review.duplicate ? (
        <Text className="text-xs leading-4 text-ink-muted mt-1">
          {t('recipes.import.alreadyHave')}
        </Text>
      ) : null}

      {review.open ? (
        <View className="mt-3">
          {hasName ? null : (
            <View className="mb-3">
              <TextField
                value={draft.name}
                onChangeText={(name) => onChange({ ...review, draft: { ...draft, name } })}
                placeholder={t('recipes.form.namePlaceholder')}
                accessibilityLabel={t('recipes.form.name')}
                maxLength={120}
              />
            </View>
          )}
          {draft.warnings.includes('ingredientsTruncated') ? (
            <Text className="text-xs leading-4 text-ink-muted mb-2">
              {t('recipes.import.warning.ingredientsTruncated')}
            </Text>
          ) : null}
          {draft.warnings.includes('notesTruncated') ? (
            <Text className="text-xs leading-4 text-ink-muted mb-2">
              {t('recipes.import.warning.notesTruncated')}
            </Text>
          ) : null}
          {draft.lines.map((line, index) => (
            <ReviewLine
              key={line.id}
              line={line}
              first={index === 0}
              decimal={decimal}
              fixing={fixing?.id === line.id}
              fixText={fixing?.text ?? ''}
              onFixText={(text) => setFixing((f) => (f ? { ...f, text } : f))}
              onStartFix={() => setFixing({ id: line.id, text: line.raw })}
              onFinishFix={finishFix}
              onUseSuggestion={(suggestion) => applySuggestion(line.id, line.raw, suggestion)}
            />
          ))}
        </View>
      ) : null}
    </Card>
  );
};

/**
 * Import recipes from pasted markdown: paste, preview what was read (nothing is saved yet, and every line the
 * parser could only guess at is outlined for a fix), then import the ones that are ticked in one transaction.
 */
export const ImportRecipesSheet: React.FC<{
  visible: boolean;
  onClose: () => void;
  /** The recipes already in the library, to warn about a repeat. */
  existing: Recipe[];
}> = ({ visible, onClose, existing }) => {
  const { t, i18n } = useTranslation();
  const ctx = useWriteContext();
  const { resolver } = useIngredientCatalog();
  const decimal = decimalFor(i18n.language);
  const [step, setStep] = useState(0);
  const [text, setText] = useState('');
  const [reviews, setReviews] = useState<ReviewRecipe[]>([]);
  const [nothingFound, setNothingFound] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setStep(0);
    setText('');
    setReviews([]);
    setNothingFound(false);
    setSaving(false);
  };

  const preview = () => {
    const have = new Set(existing.map((recipe) => normalizeIngredientName(recipe.name)));
    const drafts = flagSimilarNames(parseRecipesMarkdown(text, newId), existing);
    if (drafts.length === 0) {
      setNothingFound(true);
      return;
    }
    setNothingFound(false);
    setReviews(
      drafts.map((draft) => {
        const duplicate = have.has(normalizeIngredientName(draft.name));
        const needsLook =
          draft.warnings.length > 0 || draft.lines.some((line) => line.flag !== null);
        return { draft, duplicate, include: !duplicate, open: needsLook };
      }),
    );
    setStep(1);
  };

  const chosen = reviews.filter(canImport);

  const save = async () => {
    if (!ctx || chosen.length === 0 || saving) return;
    try {
      setSaving(true);
      await importRecipes(
        ctx,
        chosen.map((review) => draftToRecipeInput(review.draft)),
        resolver,
      );
      onClose();
    } catch (err) {
      Alert.alert(
        t('common.couldNotSave'),
        err instanceof Error ? err.message : t('common.tryAgain'),
      );
    } finally {
      setSaving(false);
    }
  };

  const pasteStep = (
    <View>
      <SectionLabel>{t('recipes.import.pasteLabel')}</SectionLabel>
      <TextField
        value={text}
        onChangeText={(next) => {
          setText(next);
          setNothingFound(false);
        }}
        placeholder={t('recipes.import.placeholder')}
        accessibilityLabel={t('recipes.import.pasteLabel')}
        multiline
        textAlignVertical="top"
        autoCapitalize="none"
        autoCorrect={false}
        style={{ minHeight: 200, paddingTop: 12 }}
      />
      <Text className="text-sm leading-5 text-ink-muted mt-2">{t('recipes.import.pasteHint')}</Text>
      {nothingFound ? (
        <Text className="text-sm leading-5 text-danger mt-2" accessibilityLiveRegion="polite">
          {t('recipes.import.nothingFound')}
        </Text>
      ) : null}
    </View>
  );

  const reviewStep = (
    <View>
      <SectionLabel>{t('recipes.import.found', { count: reviews.length })}</SectionLabel>
      {reviews.length === 0 ? <EmptyState message={t('recipes.import.nothingFound')} /> : null}
      {reviews.map((review, index) => (
        <ReviewCard
          // biome-ignore lint/suspicious/noArrayIndexKey: drafts have no id of their own and are never reordered
          key={index}
          review={review}
          decimal={decimal}
          onChange={(next) => setReviews((all) => all.map((r, i) => (i === index ? next : r)))}
        />
      ))}
    </View>
  );

  const footer =
    step === 0 ? (
      <Button label={t('recipes.import.preview')} onPress={preview} disabled={!text.trim()} />
    ) : (
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Button
            label={t('recipes.import.editText')}
            variant="outline"
            onPress={() => setStep(0)}
          />
        </View>
        <View className="flex-[2]">
          <Button
            label={t('recipes.import.importCount', { count: chosen.length })}
            onPress={save}
            disabled={chosen.length === 0 || saving || !ctx}
          />
        </View>
      </View>
    );

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      onClosed={reset}
      title={t('recipes.import.title')}
      footer={footer}
    >
      <StepPager index={step} steps={[pasteStep, reviewStep]} />
    </BottomSheet>
  );
};
