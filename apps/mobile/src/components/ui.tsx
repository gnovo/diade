import { space } from '@diade/design-tokens';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import {
  Badge,
  type BadgeTone,
  Button as DSButton,
  Checkbox as DSCheckbox,
  Icon,
  useColor,
  useShadow,
} from '../design';
import { useSync } from '../sync/SyncProvider';
import { STEP_EASING, useReduceMotion } from './StepPager';

/** Write context for repository calls. Null until the member has a space. */
export function useWriteContext(): { spaceId: string; userId: string } | null {
  const { user, space: activeSpace } = useAuth();
  if (!user || !activeSpace) return null;
  return { spaceId: activeSpace.id, userId: user.id };
}

export const ScreenScaffold: React.FC<{
  eyebrow?: string;
  title: string;
  right?: React.ReactNode;
  /** Shows an arrow at the top-left, where Android users expect "back". */
  onBack?: () => void;
  backLabel?: string;
  /** Pull down to sync. On by default. */
  refreshable?: boolean;
  /** Turn off while something inside is being dragged, so the page does not scroll under it. */
  scrollEnabled?: boolean;
  /** Replaces the eyebrow and title block, for screens that open with their own header (Today's greeting). */
  header?: React.ReactNode;
  /** Pinned below the scrolling content, above the tab bar. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}> = ({
  eyebrow,
  title,
  right,
  onBack,
  backLabel,
  refreshable = true,
  scrollEnabled = true,
  header,
  footer,
  children,
}) => {
  const { refresh, refreshing } = useSync();
  const accent = useColor('action');
  const surface = useColor('surface');
  const body = (
    <>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: space[4],
          paddingTop: space[4],
          paddingBottom: space[8],
        }}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={scrollEnabled}
        // Always mounted and switched with `enabled`: adding or removing a refreshControl changes how
        // the ScrollView wraps its content, which would remount everything inside it mid-gesture.
        refreshControl={
          <RefreshControl
            enabled={refreshable}
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={accent}
            colors={[accent]}
            progressBackgroundColor={surface}
          />
        }
      >
        <View className={`flex-row justify-between mb-6 ${onBack ? 'items-center' : 'items-end'}`}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel={backLabel}
              hitSlop={4}
              className="w-12 h-12 -ml-3 mr-1 rounded-full items-center justify-center active:bg-surface-sunken"
            >
              <Icon name="arrow-left" />
            </Pressable>
          ) : null}
          {header ?? (
            <View className="flex-1 mr-3">
              {eyebrow ? (
                <Text className="text-sm leading-5 text-ink-muted mb-1">{eyebrow}</Text>
              ) : null}
              <Text className="text-title-1 font-bold text-ink">{title}</Text>
            </View>
          )}
          {right}
        </View>
        {children}
      </ScrollView>
      {footer}
    </>
  );
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      {/* A pinned footer has to rise above the keyboard itself: Android's adjustResize is ignored edge-to-edge. */}
      {footer ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
};

/** Round "+" for a screen header's right-hand slot (Lists, Dates). */
export const HeaderAddButton: React.FC<{ label: string; onPress: () => void }> = ({
  label,
  onPress,
}) => {
  const onAction = useColor('on-action');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      className="w-12 h-12 rounded-full bg-action items-center justify-center active:opacity-80"
    >
      <Icon name="plus" color={onAction} strokeWidth={2.5} />
    </Pressable>
  );
};

export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => {
  const shadow = useShadow('shadowSm');
  return (
    <View
      style={shadow}
      className={`bg-surface rounded-lg p-5 border border-border mb-5 ${className}`}
    >
      {children}
    </View>
  );
};

export const SectionLabel: React.FC<{ children: React.ReactNode; right?: React.ReactNode }> = ({
  children,
  right,
}) => (
  <View className="flex-row items-center justify-between mb-3">
    <Text className="text-xs leading-4 font-semibold text-ink-muted tracking-wider uppercase">
      {children}
    </Text>
    {right}
  </View>
);

/** `ref` is a plain prop in React 19, so it reaches the TextInput through the spread. */
export const TextField: React.FC<
  TextInputProps & { ref?: React.Ref<React.ComponentRef<typeof TextInput>> }
> = (props) => {
  const placeholder = useColor('ink-muted');
  const ink = useColor('ink');
  return (
    <TextInput
      placeholderTextColor={placeholder}
      selectionColor={ink}
      className="bg-surface border border-border-strong rounded-md px-3 min-h-[48px] text-base text-ink"
      {...props}
    />
  );
};

/** Screen-level button. `small` gives the 36px visual height with a 48px hit area. */
export const Button: React.FC<{
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  small?: boolean;
}> = ({ small, ...props }) => <DSButton size={small ? 'sm' : 'md'} {...props} />;

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const PADDING = 4;
  /** A short slide: quicker than moving between steps, but on the same curve. */
  const SLIDE_MS = 340;
  const reduceMotion = useReduceMotion();
  const [width, setWidth] = useState(0);
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const position = useSharedValue(index);
  const placed = useRef(false);
  const segmentWidth = width > 0 ? (width - PADDING * 2) / options.length : 0;

  // The highlight glides to the chosen segment on the UI thread. It jumps there the first time,
  // so it does not slide in on mount.
  useEffect(() => {
    if (segmentWidth === 0) return;
    if (!placed.current || reduceMotion) {
      placed.current = true;
      position.value = index;
      return;
    }
    position.value = withTiming(index, { duration: SLIDE_MS, easing: STEP_EASING });
  }, [index, position, segmentWidth, reduceMotion]);

  const highlight = useAnimatedStyle(() => ({
    transform: [{ translateX: position.value * segmentWidth }],
  }));

  return (
    <View
      className="flex-row bg-surface-sunken rounded-md p-1"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {segmentWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          className="absolute bg-action rounded-sm"
          style={[{ top: PADDING, bottom: PADDING, left: PADDING, width: segmentWidth }, highlight]}
        />
      ) : null}
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            className="flex-1 min-h-[40px] rounded-sm items-center justify-center"
          >
            <Text
              className={`text-sm leading-5 font-semibold ${selected ? 'text-on-action' : 'text-ink-muted'}`}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const Checkbox: React.FC<{ checked: boolean; onToggle: () => void; label: string }> = (
  props,
) => <DSCheckbox {...props} />;

/** Ownership label: "Shared" / "Personal" / neutral. Always icon + word. */
export const Pill: React.FC<{ label: string; tone?: 'shared' | 'personal' | 'neutral' }> = ({
  label,
  tone = 'neutral',
}) => <Badge tone={tone as BadgeTone}>{label}</Badge>;

export const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <Text className="text-sm leading-5 text-ink-muted py-2">{message}</Text>
);
