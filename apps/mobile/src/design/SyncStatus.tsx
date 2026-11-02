import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from './Icon';
import { sizes } from '@diade/design-tokens';

export type SyncState = 'synced' | 'pending' | 'offline' | 'conflict';

const states: Record<SyncState, { container: string; text: string; icon: IconName; word: 'synced' | 'pending' | 'offline' | 'conflict' }> = {
  synced: { container: 'bg-success-soft', text: 'text-success', icon: 'circle-check', word: 'synced' },
  pending: { container: 'bg-warning-soft', text: 'text-warning', icon: 'refresh-cw', word: 'pending' },
  offline: { container: 'bg-surface border border-border', text: 'text-ink-muted', icon: 'cloud-off', word: 'offline' },
  conflict: { container: 'bg-danger-soft', text: 'text-danger', icon: 'triangle-alert', word: 'conflict' },
};

/** Offline-first sync state. Icon and words, never colour alone. */
export const SyncStatus: React.FC<{ state: SyncState; label?: string }> = ({ state, label }) => {
  const { t } = useTranslation();
  const s = states[state];
  return (
    <View className={`flex-row items-center gap-1.5 rounded-full px-3 py-1.5 ${s.container}`}>
      <Icon name={s.icon} size={sizes['icon-sm']} />
      <Text className={`text-xs leading-4 font-medium ${s.text}`}>{label ?? t(`sync.${s.word}`)}</Text>
    </View>
  );
};
