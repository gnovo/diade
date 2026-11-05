import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LIST_TEMPLATES, getListTemplate, type ListTemplate, type ListTemplateId } from '@diade/domain';
import { BottomSheet } from './BottomSheet';
import { Button, SectionLabel, TextField } from './ui';
import { Icon } from '../design';

export interface NewListRequest {
  name: string;
  template: ListTemplate;
  /** Starter item names, already translated, in template order. */
  starterNames: string[];
}

/** Pick a template, name the list, and choose which starter items to begin with. */
export const NewListSheet: React.FC<{
  visible: boolean;
  onClose: () => void;
  onCreate: (request: NewListRequest) => void;
}> = ({ visible, onClose, onCreate }) => {
  const { t } = useTranslation();
  const defaultName = (id: ListTemplateId) => (id === 'blank' ? '' : t(`lists.template.${id}.name`));
  // The form is reset after the sheet has finished closing, never while it opens, so opening
  // costs no extra render during the slide-in.
  const [templateId, setTemplateId] = useState<ListTemplateId>('groceries');
  const [name, setName] = useState(() => defaultName('groceries'));
  const [skipped, setSkipped] = useState<Set<string>>(new Set());

  const template = getListTemplate(templateId);
  const starterLabel = (id: ListTemplateId, starter: string) =>
    t(`lists.template.${id}.starter.${starter}` as never) as string;

  const pickTemplate = (next: ListTemplateId) => {
    // Only replace the name when the user has not typed their own.
    if (name === '' || name === defaultName(templateId)) setName(defaultName(next));
    setTemplateId(next);
    setSkipped(new Set());
  };

  const toggleStarter = (id: string) =>
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const reset = () => {
    setTemplateId('groceries');
    setName(defaultName('groceries'));
    setSkipped(new Set());
  };

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate({
      name: trimmed,
      template,
      starterNames: template.starterItems.filter((id) => !skipped.has(id)).map((id) => starterLabel(template.id, id)),
    });
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      onClosed={reset}
      title={t('lists.newList')}
      footer={<Button label={t('lists.createList')} onPress={submit} disabled={!name.trim()} />}
    >
      <SectionLabel>{t('lists.startFrom')}</SectionLabel>
      <View className="flex-row flex-wrap gap-2 mb-5" accessibilityRole="radiogroup">
        {LIST_TEMPLATES.map((tpl) => {
          const selected = tpl.id === templateId;
          return (
            <Pressable
              key={tpl.id}
              onPress={() => pickTemplate(tpl.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
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

      <SectionLabel>{t('lists.listName')}</SectionLabel>
      <TextField
        value={name}
        onChangeText={setName}
        placeholder={t('lists.newListPlaceholder')}
        maxLength={100}
        onSubmitEditing={submit}
        returnKeyType="done"
      />

      {template.starterItems.length > 0 ? (
        <View className="mt-5">
          <SectionLabel>{t('lists.starterItems')}</SectionLabel>
          <View className="flex-row flex-wrap gap-2">
            {template.starterItems.map((id) => {
              const on = !skipped.has(id);
              const label = starterLabel(template.id, id);
              return (
                <Pressable
                  key={id}
                  onPress={() => toggleStarter(id)}
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
    </BottomSheet>
  );
};
