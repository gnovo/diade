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

function useSyncDisplay(): { state: SyncState; label: string; retry: () => void; refreshing: boolean } {
  const { t } = useTranslation();
  const { status, pendingCount, syncNow, refreshing } = useSync();
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
  return { state, label, retry: () => void syncNow(), refreshing };
}

/**
 * Decides when the pill is on screen: after a short delay once something is happening, for as
 * long as it lasts, then briefly as "synced". Offline and error show at once and stay.
 */
function usePresence(state: SyncState, label: string, refreshing: boolean) {
  const [present, setPresent] = useState(false);
  const [shown, setShown] = useState({ state, label });
  // While the user is pulling to refresh, the refresh spinner is the feedback: the pill stays
  // away for "in progress", but still reports offline and error.
  const quiet = refreshing && state === 'pending';

  // When a pull finishes, confirm it briefly, so the spinner vanishing is not the only signal.
  const wasRefreshing = useRef(false);
  useEffect(() => {
    if (wasRefreshing.current && !refreshing && state === 'synced') {
      setShown({ state: 'synced', label });
      setPresent(true);
    }
    wasRefreshing.current = refreshing;
    // Only the end of a refresh matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshing]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (quiet) {
      // nothing: the refresh control is showing progress
    } else if (state !== 'synced') {
      setShown({ state, label });
      if (!present) timer = setTimeout(() => setPresent(true), state === 'pending' ? SHOW_DELAY_MS : 0);
    } else if (present) {
      setShown({ state: 'synced', label });
      timer = setTimeout(() => setPresent(false), LINGER_MS);
    }
    return () => clearTimeout(timer);
  }, [state, label, present, quiet]);

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
  const { state, label, retry, refreshing } = useSyncDisplay();
  const { present, shown } = usePresence(state, label, refreshing);
  const progress = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (present) {
      setMounted(true);
      Animated.timing(progress, { toValue: 1, duration: 260, easing: Easing.bezier(0.2, 0, 0, 1), useNativeDriver: true }).start();
    } else {
      Animated.timing(progress, { toValue: 0, duration: 180, easing: Easing.bezier(0.3, 0, 0.8, 0.15), useNativeDriver: true }).start(
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
      <SyncStatus
        state={shown.state}
        label={shown.label}
        spinning={shown.state === 'pending'}
        actionLabel={retryable ? t('sync.retry') : undefined}
      />
    </View>
  );

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 8, left: 0, right: 0, alignItems: 'center' }}>
      <Animated.View
        accessibilityLiveRegion="polite"
        style={{
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) },
            { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
          ],
        }}
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
