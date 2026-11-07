import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';

/** Material's emphasized decelerate, the same curve the bottom sheet uses to open. */
export const STEP_EASING = Easing.bezier(0.2, 0, 0, 1);
export const STEP_MS = 300;
/** Growing or shrinking inside one step (a section opening) is quicker than changing step. */
const RESIZE_MS = 200;

/** Whether the system asks for less motion. Read once and kept current. */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}

/**
 * Shows one of several steps and moves between them with a horizontal slide, while the
 * container's height eases to the height of the step now in view. Every step is laid out
 * side by side at its own natural height, so a step is measured before it is shown and the
 * height never jumps. Steps that are out of view are hidden from touch and screen readers.
 */
export const StepPager: React.FC<{ index: number; steps: React.ReactNode[] }> = ({ index, steps }) => {
  const reduceMotion = useReduceMotion();
  const [width, setWidth] = useState(0);
  const [heights, setHeights] = useState<number[]>(() => steps.map(() => 0));
  const x = useRef(new Animated.Value(0)).current;
  const height = useRef(new Animated.Value(0)).current;
  const xPlaced = useRef(false);
  const heightPlaced = useRef(false);

  useEffect(() => {
    if (width === 0) return;
    const to = -index * width;
    if (!xPlaced.current || reduceMotion) {
      xPlaced.current = true;
      x.setValue(to);
      return;
    }
    Animated.timing(x, { toValue: to, duration: STEP_MS, easing: STEP_EASING, useNativeDriver: true }).start();
  }, [index, width, reduceMotion, x]);

  const activeHeight = heights[index] ?? 0;
  const previousIndex = useRef(index);
  useEffect(() => {
    if (activeHeight === 0) return;
    const changedStep = previousIndex.current !== index;
    previousIndex.current = index;
    if (!heightPlaced.current || reduceMotion) {
      heightPlaced.current = true;
      height.setValue(activeHeight);
      return;
    }
    Animated.timing(height, {
      toValue: activeHeight,
      duration: changedStep ? STEP_MS : RESIZE_MS,
      easing: STEP_EASING,
      useNativeDriver: false, // height is a layout property
    }).start();
  }, [activeHeight, index, reduceMotion, height]);

  const setHeightAt = (i: number, h: number) =>
    setHeights((prev) => (Math.abs((prev[i] ?? 0) - h) < 0.5 ? prev : prev.map((v, n) => (n === i ? h : v))));

  return (
    <Animated.View
      style={{ height: heightPlaced.current || activeHeight > 0 ? height : undefined, overflow: 'hidden' }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <Animated.View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          width: width * steps.length || undefined,
          transform: [{ translateX: x }],
        }}
      >
        {steps.map((step, i) => {
          const active = i === index;
          return (
            <View
              key={i}
              style={{ width: width || undefined }}
              pointerEvents={active ? 'auto' : 'none'}
              importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
              accessibilityElementsHidden={!active}
              onLayout={(e) => setHeightAt(i, e.nativeEvent.layout.height)}
            >
              {step}
            </View>
          );
        })}
      </Animated.View>
    </Animated.View>
  );
};
