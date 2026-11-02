import React from 'react';
import { ActivityIndicator, Pressable, Text, type PressableProps } from 'react-native';
import { Icon, type IconName } from './Icon';
import { sizes } from '@diade/design-tokens';
import { useColor } from './theme';

export type ButtonVariant = 'primary' | 'soft' | 'outline' | 'ghost' | 'danger';

export interface ButtonProps extends Omit<PressableProps, 'children'> {
  label: string;
  variant?: ButtonVariant;
  /** md = 48px (default); sm = 36px visual height with a 48px hit area. */
  size?: 'md' | 'sm';
  icon?: IconName;
  iconAfter?: IconName;
  loading?: boolean;
}

const container: Record<ButtonVariant, string> = {
  primary: 'bg-action active:bg-action-pressed',
  soft: 'bg-action-soft active:bg-action-soft',
  outline: 'bg-transparent border border-border-strong active:bg-surface-sunken',
  ghost: 'bg-transparent active:bg-surface-sunken',
  danger: 'bg-danger-soft border border-danger active:bg-danger-soft',
};

const label: Record<ButtonVariant, string> = {
  primary: 'text-on-action',
  soft: 'text-on-action-soft',
  outline: 'text-ink',
  ghost: 'text-ink',
  danger: 'text-danger',
};

/** Pill button (radius-full). Labels use `label` type style, never hard-coded white. */
export const Button: React.FC<ButtonProps> = ({
  label: text,
  variant = 'primary',
  size = 'md',
  icon,
  iconAfter,
  loading = false,
  disabled,
  style,
  ...rest
}) => {
  const isDisabled = disabled || loading;
  const iconColor = useColor(variant === 'primary' ? 'on-action' : variant === 'soft' ? 'on-action-soft' : variant === 'danger' ? 'danger' : 'ink');
  const heightClass = size === 'md' ? 'h-12 px-5' : 'h-9 px-4';
  const hitSlop = size === 'sm' ? { top: 6, bottom: 6, left: 4, right: 4 } : undefined;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      hitSlop={hitSlop}
      style={[{ opacity: isDisabled ? 0.4 : 1 }, style as object]}
      className={`flex-row items-center justify-center gap-2 rounded-full ${heightClass} ${container[variant]}`}
      {...rest}
    >
      {loading ? <ActivityIndicator color={iconColor} /> : null}
      {icon && !loading ? <Icon name={icon} size={sizes['icon-md']} color={iconColor} /> : null}
      <Text className={`text-[15px] leading-6 font-semibold ${label[variant]}`}>{text}</Text>
      {iconAfter ? <Icon name={iconAfter} size={sizes['icon-md']} color={iconColor} /> : null}
    </Pressable>
  );
};
