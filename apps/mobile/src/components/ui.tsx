import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../sync/SyncProvider';

/** Write context for repository calls. Null until the member has a space. */
export function useWriteContext(): { spaceId: string; userId: string } | null {
  const { user, space } = useAuth();
  if (!user || !space) return null;
  return { spaceId: space.id, userId: user.id };
}

export const ScreenScaffold: React.FC<{
  eyebrow?: string;
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}> = ({ eyebrow, title, right, children }) => (
  <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
    <ScrollView
      contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="flex-row items-end justify-between mb-6">
        <View className="flex-1 mr-3">
          {eyebrow ? (
            <Text className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-1">
              {eyebrow}
            </Text>
          ) : null}
          <Text className="text-2xl font-bold text-ink">{title}</Text>
        </View>
        {right}
      </View>
      {children}
    </ScrollView>
  </SafeAreaView>
);

export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <View className={`bg-surface rounded-2xl p-5 border border-border mb-5 ${className}`}>
    {children}
  </View>
);

export const SectionLabel: React.FC<{ children: React.ReactNode; right?: React.ReactNode }> = ({
  children,
  right,
}) => (
  <View className="flex-row items-center justify-between mb-3">
    <Text className="text-xs font-bold text-ink-muted tracking-wider uppercase">{children}</Text>
    {right}
  </View>
);

export const TextField: React.FC<TextInputProps> = (props) => (
  <TextInput
    placeholderTextColor="#94A3B8"
    className="bg-canvas border border-border rounded-xl px-3 py-2.5 text-ink text-sm"
    {...props}
  />
);

export const Button: React.FC<{
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  small?: boolean;
}> = ({ label, onPress, variant = 'primary', disabled, small }) => {
  const base = small ? 'px-3 py-1.5 rounded-full' : 'px-4 py-3 rounded-xl items-center';
  const styles = {
    primary: 'bg-primary',
    ghost: 'bg-surface-subtle border border-border',
    danger: 'bg-red-50 border border-red-200',
  }[variant];
  const textStyles = {
    primary: 'text-white font-semibold',
    ghost: 'text-ink font-semibold',
    danger: 'text-red-700 font-semibold',
  }[variant];
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      className={`${base} ${styles} ${disabled ? 'opacity-40' : ''}`}
    >
      <Text className={`${textStyles} ${small ? 'text-xs' : 'text-sm'}`}>{label}</Text>
    </TouchableOpacity>
  );
};

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
  return (
    <View className="flex-row bg-canvas rounded-xl p-1 border border-border">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <TouchableOpacity
            key={option.value}
            onPress={() => onChange(option.value)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            className={`flex-1 py-2 rounded-lg items-center ${selected ? 'bg-primary' : ''}`}
          >
            <Text className={`text-xs font-semibold ${selected ? 'text-white' : 'text-ink-muted'}`}>
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export const Checkbox: React.FC<{ checked: boolean; onToggle: () => void; label: string }> = ({
  checked,
  onToggle,
  label,
}) => (
  <TouchableOpacity
    onPress={onToggle}
    activeOpacity={0.7}
    accessibilityRole="checkbox"
    accessibilityState={{ checked }}
    accessibilityLabel={label}
    className={`w-6 h-6 rounded-md border items-center justify-center mr-3 ${
      checked ? 'bg-primary border-primary' : 'border-border-subtle bg-surface'
    }`}
  >
    {checked ? <Text className="text-white text-xs font-bold">✓</Text> : null}
  </TouchableOpacity>
);

export const Pill: React.FC<{ label: string; tone?: 'shared' | 'personal' | 'neutral' }> = ({
  label,
  tone = 'neutral',
}) => {
  const styles = {
    shared: 'bg-accent-light border-accent',
    personal: 'bg-surface-subtle border-border-subtle',
    neutral: 'bg-canvas border-border',
  }[tone];
  return (
    <View className={`px-2 py-0.5 rounded-md border ${styles}`}>
      <Text className="text-[11px] font-medium text-ink-muted">{label}</Text>
    </View>
  );
};

export const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <Text className="text-sm text-ink-muted py-2">{message}</Text>
);

/** Shows whether local changes are saved, waiting, or synced. Never relies on colour alone. */
export const SyncBadge: React.FC = () => {
  const { status, pendingCount } = useSync();
  const label =
    status === 'syncing'
      ? 'Syncing…'
      : status === 'offline'
        ? `Offline${pendingCount ? ` · ${pendingCount} saved on this device` : ''}`
        : status === 'error'
          ? 'Sync problem'
          : pendingCount > 0
            ? `${pendingCount} waiting to sync`
            : 'Synced';
  const dot =
    status === 'offline' || status === 'error'
      ? 'bg-amber-500'
      : status === 'syncing' || pendingCount > 0
        ? 'bg-secondary'
        : 'bg-emerald-500';
  return (
    <View className="flex-row items-center bg-surface px-3 py-1.5 rounded-full border border-border">
      <View className={`w-2 h-2 rounded-full mr-2 ${dot}`} />
      <Text className="text-xs font-medium text-ink-muted">{label}</Text>
    </View>
  );
};
