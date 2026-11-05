import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, Text, View } from 'react-native';
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

/** Turns forever while `active`, unless the system asks to reduce motion. */
const Spinner: React.FC<{ active: boolean; children: React.ReactNode }> = ({ active, children }) => {
  const turn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return undefined;
    let loop: Animated.CompositeAnimation | undefined;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled || reduce) return;
      loop = Animated.loop(Animated.timing(turn, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }));
      loop.start();
    });
    return () => {
      cancelled = true;
      loop?.stop();
      turn.setValue(0);
    };
  }, [active, turn]);
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return <Animated.View style={{ transform: [{ rotate }] }}>{children}</Animated.View>;
};

/**
 * Offline-first sync state. Icon and words, never colour alone. `spinning` turns the icon while
 * work is in progress; `actionLabel` adds a visible call to action (e.g. "Retry").
 */
export const SyncStatus: React.FC<{
  state: SyncState;
  label?: string;
  spinning?: boolean;
  actionLabel?: string;
}> = ({ state, label, spinning = false, actionLabel }) => {
  const { t } = useTranslation();
  const s = states[state];
  return (
    <View
      className={`flex-row items-center gap-1.5 rounded-full px-3 py-1.5 ${s.container}`}
      // Size to the icon and text even inside a column that would stretch it.
      style={{ alignSelf: 'flex-start' }}
    >
      <Spinner active={spinning}>
        <Icon name={s.icon} size={sizes['icon-sm']} />
      </Spinner>
      <Text className={`text-xs leading-4 font-medium ${s.text}`}>{label ?? t(`sync.${s.word}`)}</Text>
      {actionLabel ? (
        <Text className={`text-xs leading-4 font-semibold underline ${s.text}`}>{actionLabel}</Text>
      ) : null}
    </View>
  );
};
