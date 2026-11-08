import React, { useEffect, useMemo, useState } from "react";
import { Alert, BackHandler, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import {
  formatAmount,
  normalizeIngredientName,
  type Recipe,
  type RecipeIngredient,
} from "@diade/domain";
import { getActiveRecipes } from "../data/queries";
import { deleteRecord } from "../data/repository";
import { useLiveQuery } from "../data/useLiveQuery";
import { Icon } from "../design";
import {
  Button,
  Card,
  EmptyState,
  HeaderAddButton,
  ScreenScaffold,
  SectionLabel,
  TextField,
} from "./ui";
import { RecipeForm, decimalFor } from "./RecipeForm";

const IngredientLine: React.FC<{
  ingredient: RecipeIngredient;
  first: boolean;
  decimal: string;
}> = ({ ingredient, first, decimal }) => {
  const amount = formatAmount(ingredient.quantity, ingredient.unit, decimal);
  return (
    <View>
      {first ? null : <View className="h-px bg-border" />}
      <View className="flex-row items-center min-h-[44px]">
        <Text className="flex-1 text-sm font-medium text-ink mr-2">
          {ingredient.name}
        </Text>
        {amount ? (
          <Text className="text-sm text-ink-muted">{amount}</Text>
        ) : null}
      </View>
    </View>
  );
};

/** One recipe: its ingredients (pantry staples set apart), notes, and edit / delete. */
const RecipeDetail: React.FC<{
  recipe: Recipe;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ recipe, onBack, onEdit, onDelete }) => {
  const { t, i18n } = useTranslation();
  const decimal = decimalFor(i18n.language);
  const fresh = recipe.ingredients.filter((row) => !row.staple);
  const pantry = recipe.ingredients.filter((row) => row.staple);

  return (
    <ScreenScaffold
      eyebrow={t("recipes.servings", { count: recipe.servings })}
      title={recipe.name}
      onBack={onBack}
      backLabel={t("common.back")}
      right={
        <Button
          label={t("common.edit")}
          variant="ghost"
          small
          onPress={onEdit}
        />
      }
    >
      <Card>
        <SectionLabel>{t("recipes.ingredientsHeading")}</SectionLabel>
        {recipe.ingredients.length === 0 ? (
          <EmptyState message={t("recipes.noIngredients")} />
        ) : null}
        {fresh.map((row, index) => (
          <IngredientLine
            key={row.id}
            ingredient={row}
            first={index === 0}
            decimal={decimal}
          />
        ))}
        {pantry.length > 0 ? (
          <View
            className={
              fresh.length > 0 ? "mt-4 pt-4 border-t border-border" : ""
            }
          >
            <SectionLabel>{t("recipes.pantryHeading")}</SectionLabel>
            <Text className="text-sm leading-5 text-ink-muted mb-1">
              {t("recipes.pantryHint")}
            </Text>
            {pantry.map((row, index) => (
              <IngredientLine
                key={row.id}
                ingredient={row}
                first={index === 0}
                decimal={decimal}
              />
            ))}
          </View>
        ) : null}
      </Card>

      {recipe.notes ? (
        <Card>
          <SectionLabel>{t("recipes.notes")}</SectionLabel>
          <Text className="text-sm leading-5 text-ink">{recipe.notes}</Text>
        </Card>
      ) : null}

      <Button
        label={t("recipes.deleteRecipe")}
        variant="danger"
        onPress={onDelete}
      />
    </ScreenScaffold>
  );
};

/** The recipe library: search, add, open one. Shown in the Lists tab beside the lists themselves. */
export const RecipesView: React.FC<{ switcher: React.ReactNode }> = ({
  switcher,
}) => {
  const { t } = useTranslation();
  const recipes = useLiveQuery(getActiveRecipes, [] as Recipe[]);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Recipe | null>(null);

  const open = recipes.data.find((r) => r.id === openId) ?? null;

  // The system back button closes the recipe before it leaves the tab, as it does for a list.
  useEffect(() => {
    if (!open) return undefined;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setOpenId(null);
      return true;
    });
    return () => sub.remove();
  }, [open]);

  const matches = useMemo(() => {
    const needle = normalizeIngredientName(query);
    if (!needle) return recipes.data;
    // Searching "salmon" also finds the recipes that use it, not only ones named after it.
    return recipes.data.filter(
      (r) =>
        normalizeIngredientName(r.name).includes(needle) ||
        r.ingredients.some((row) =>
          normalizeIngredientName(row.name).includes(needle),
        ),
    );
  }, [recipes.data, query]);

  const confirmDelete = (recipe: Recipe) =>
    Alert.alert(
      t("recipes.deleteTitle"),
      t("recipes.deleteBody", { name: recipe.name }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            setOpenId(null);
            await deleteRecord("recipes", recipe.id);
          },
        },
      ],
    );

  const form = (
    <RecipeForm
      visible={formOpen}
      recipe={editing}
      onClose={() => setFormOpen(false)}
      onSaved={(id) => setOpenId(id)}
    />
  );

  if (open) {
    return (
      <>
        <RecipeDetail
          recipe={open}
          onBack={() => setOpenId(null)}
          onEdit={() => {
            setEditing(open);
            setFormOpen(true);
          }}
          onDelete={() => confirmDelete(open)}
        />
        {form}
      </>
    );
  }

  return (
    <>
      <ScreenScaffold
        title={t("recipes.title")}
        right={
          <HeaderAddButton
            label={t("recipes.newRecipe")}
            onPress={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          />
        }
      >
        {switcher}

        {recipes.data.length === 0 ? (
          <Card>
            <EmptyState message={t("recipes.empty")} />
          </Card>
        ) : (
          <>
            <View className="mb-4">
              <TextField
                value={query}
                onChangeText={setQuery}
                placeholder={t("recipes.searchPlaceholder")}
                accessibilityLabel={t("recipes.searchPlaceholder")}
                returnKeyType="search"
                autoCorrect={false}
                clearButtonMode="while-editing"
              />
            </View>
            {matches.length === 0 ? (
              <Card>
                <EmptyState
                  message={t("recipes.noMatches", { query: query.trim() })}
                />
              </Card>
            ) : null}
          </>
        )}

        {matches.map((recipe) => (
          <Pressable
            key={recipe.id}
            onPress={() => setOpenId(recipe.id)}
            accessibilityRole="button"
            className="bg-surface rounded-2xl p-5 border border-border mb-3 active:opacity-70"
          >
            <View className="flex-row items-center">
              <View className="w-10 h-10 rounded-full bg-surface-tint items-center justify-center mr-3">
                <Icon name="utensils" />
              </View>
              <View className="flex-1">
                <Text className="text-base font-semibold text-ink">
                  {recipe.name}
                </Text>
                <Text className="text-sm text-ink-muted mt-0.5">
                  {t("recipes.ingredients", {
                    count: recipe.ingredients.length,
                  })}
                  {" · "}
                  {t("recipes.servings", { count: recipe.servings })}
                </Text>
              </View>
              <Icon name="chevron-right" size={18} />
            </View>
          </Pressable>
        ))}
      </ScreenScaffold>
      {form}
    </>
  );
};
