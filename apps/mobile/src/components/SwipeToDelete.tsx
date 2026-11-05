import React, { useRef } from 'react';
import { Animated, PanResponder, View } from 'react-native';
import { Icon, useColor } from '../design';

const TRIGGER = 96; // px of leftward drag that deletes on release
const OFFSCREEN = 420;

/**
 * Drag a row left to delete it. Vertical movement is left to the parent scroll view, and
 * screen readers get a "delete" custom action since swiping is not discoverable.
 */
export const SwipeToDelete: React.FC<{
  onDelete: () => void;
  deleteLabel: string;
  children: React.ReactNode;
}> = ({ onDelete, deleteLabel, children }) => {
  const x = useRef(new Animated.Value(0)).current;
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;
  const danger = useColor('danger');

  const reset = () => Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dx < -8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_, g) => x.setValue(Math.min(0, g.dx)),
      onPanResponderRelease: (_, g) => {
        if (g.dx < -TRIGGER) {
          Animated.timing(x, { toValue: -OFFSCREEN, duration: 140, useNativeDriver: true }).start(() => {
            onDeleteRef.current();
            x.setValue(0);
          });
        } else {
          reset();
        }
      },
      onPanResponderTerminate: reset,
    }),
  ).current;

  return (
    <View
      accessibilityActions={[{ name: 'delete', label: deleteLabel }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'delete') onDelete();
      }}
    >
      <View className="absolute inset-0 bg-danger-soft rounded-md items-end justify-center pr-4">
        <Icon name="trash-2" color={danger} />
      </View>
      <Animated.View {...pan.panHandlers} style={{ transform: [{ translateX: x }] }} className="bg-surface">
        {children}
      </Animated.View>
    </View>
  );
};
