import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { SyncStatus, useShadow, type SyncState } from '../design';
import { useSync } from '../sync/SyncProvider';

/** A sync that finishes faster than this never shows, so quick syncs do not flicker. */
const SHOW_DELAY_MS = 350;
/** After a sync completes, "synced" stays visible this long before the pill fades away. */
const LINGER_MS = 1400;

function useSyncDisplay(): { state: SyncState; label: string; retry: () => void } {
  const { t } = useTranslation();
  const { status, pendingCount, syncNow } = useSync();
  const state: SyncState =
    status === 'offline'
      ? 'offline'
      : status === 'error'
        ? 'conflict'
        : status === 'syncing' || pendingCount > 0
          ? 'pending'
          : 'synced';
  const label =
    status === 'syncing'
      ? t('sync.syncing')
      : status === 'offline'
        ? pendingCount
          ? t('sync.offlineSaved', { count: pendingCount })
          : t('sync.offline')
        : status === 'error'
          ? t('sync.problem')
          : pendingCount > 0
            ? t('sync.waiting', { count: pendingCount })
            : t('sync.synced');
  return { state, label, retry: () => void syncNow() };
}

/**
 * Decides when the pill is on screen: after a short delay once something is happening, for as
 * long as it lasts, then briefly as "synced". Offline and error show at once and stay.
 */
function usePresence(state: SyncState, label: string) {
  const [present, setPresent] = useState(false);
  const [shown, setShown] = useState({ state, label });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (state !== 'synced') {
      setShown({ state, label });
      if (!present) timer = setTimeout(() => setPresent(true), state === 'pending' ? SHOW_DELAY_MS : 0);
    } else if (present) {
      setShown({ state: 'synced', label });
      timer = setTimeout(() => setPresent(false), LINGER_MS);
    }
    return () => clearTimeout(timer);
  }, [state, label, present]);

  return { present, shown };
}

/**
 * Sync status as a floating pill over whatever screen is showing, instead of a badge that
 * takes up room in every header. It never blocks touches, except that offline and error
 * states can be tapped to retry.
 */
export const SyncOverlay: React.FC = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const shadow = useShadow('shadowSm');
  const { state, label, retry } = useSyncDisplay();
  const { present, shown } = usePresence(state, label);
  const progress = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (present) {
      setMounted(true);
      Animated.timing(progress, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else {
      Animated.timing(progress, { toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(
        ({ finished }) => {
          if (finished) setMounted(false);
        },
      );
    }
  }, [present, progress]);

  if (!mounted) return null;

  const retryable = shown.state === 'offline' || shown.state === 'conflict';
  const pill = (
    <View style={shadow} className="rounded-full bg-surface">
      <SyncStatus state={shown.state} label={shown.label} />
    </View>
  );

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 8, left: 0, right: 0, alignItems: 'center' }}>
      <Animated.View
        accessibilityLiveRegion="polite"
        style={{ opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }] }}
      >
        {retryable ? (
          <Pressable onPress={retry} accessibilityRole="button" accessibilityHint={t('sync.tapToRetry')} hitSlop={8}>
            {pill}
          </Pressable>
        ) : (
          pill
        )}
      </Animated.View>
    </View>
  );
};
