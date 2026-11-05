import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View, Text, TextInput, ScrollView, Pressable, RefreshControl, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../sync/SyncProvider';
import {
  Badge,
  Button as DSButton,
  Checkbox as DSCheckbox,
  Icon,
  useColor,
  useShadow,
  type BadgeTone,
} from '../design';
import { space } from '@diade/design-tokens';

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
  children: React.ReactNode;
}> = ({ eyebrow, title, right, onBack, backLabel, refreshable = true, children }) => {
  const { refresh, refreshing } = useSync();
  const accent = useColor('action');
  const surface = useColor('surface');
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: space[4], paddingTop: space[4], paddingBottom: space[8] }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          refreshable ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void refresh()}
              tintColor={accent}
              colors={[accent]}
              progressBackgroundColor={surface}
            />
          ) : undefined
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
          <View className="flex-1 mr-3">
            {eyebrow ? <Text className="text-sm leading-5 text-ink-muted mb-1">{eyebrow}</Text> : null}
            <Text className="text-title-1 font-bold text-ink">{title}</Text>
          </View>
          {right}
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
};

export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => {
  const shadow = useShadow('shadowSm');
  return (
    <View style={shadow} className={`bg-surface rounded-lg p-5 border border-border mb-5 ${className}`}>
      {children}
    </View>
  );
};

export const SectionLabel: React.FC<{ children: React.ReactNode; right?: React.ReactNode }> = ({
  children,
  right,
}) => (
  <View className="flex-row items-center justify-between mb-3">
    <Text className="text-xs leading-4 font-semibold text-ink-muted tracking-wider uppercase">{children}</Text>
    {right}
  </View>
);

export const TextField: React.FC<TextInputProps> = (props) => {
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
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((option) => option.value === value));
  const position = useRef(new Animated.Value(index)).current;
  const placed = useRef(false);
  const segmentWidth = width > 0 ? (width - PADDING * 2) / options.length : 0;

  // The highlight glides to the chosen segment. It jumps there the first time, so it does not slide in on mount.
  useEffect(() => {
    if (segmentWidth === 0) return;
    if (!placed.current) {
      position.setValue(index);
      placed.current = true;
      return;
    }
    Animated.timing(position, {
      toValue: index,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [index, position, segmentWidth]);

  return (
    <View
      className="flex-row bg-surface-sunken rounded-md p-1"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {segmentWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          className="absolute bg-action rounded-sm"
          style={{
            top: PADDING,
            bottom: PADDING,
            left: PADDING,
            width: segmentWidth,
            transform: [{ translateX: Animated.multiply(position, segmentWidth) }],
          }}
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
            <Text className={`text-sm leading-5 font-semibold ${selected ? 'text-on-action' : 'text-ink-muted'}`}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const Checkbox: React.FC<{ checked: boolean; onToggle: () => void; label: string }> = (props) => (
  <DSCheckbox {...props} />
);

/** Ownership label: "Shared" / "Personal" / neutral. Always icon + word. */
export const Pill: React.FC<{ label: string; tone?: 'shared' | 'personal' | 'neutral' }> = ({
  label,
  tone = 'neutral',
}) => <Badge tone={tone as BadgeTone}>{label}</Badge>;

export const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <Text className="text-sm leading-5 text-ink-muted py-2">{message}</Text>
);
