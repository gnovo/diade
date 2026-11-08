import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, type LayoutChangeEvent, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

/**
 * Wizard motion, shared by every multi-step sheet.
 *
 * Everything here runs on the UI thread, so a busy JS thread (a step mounting, a list
 * rendering) cannot make it stutter. One value, `progress` (a step index that may be
 * fractional), drives the slide, the height, the parallax and the fade, so they can never
 * drift apart or restart each other.
 */

/**
 * A softer deceleration than Material's emphasized curve (0.2, 0, 0, 1), which spends most of
 * its travel in the first tenth of the duration and then crawls, so it reads as a snap.
 * This is the curve iOS uses for its own sheets.
 */
export const STEP_EASING = Easing.bezier(0.32, 0.72, 0, 1);
export const STEP_MS = 460;
/** Growing or shrinking inside one step (a section opening) is quicker than changing step. */
export const RESIZE_MS = 260;
/** The outgoing step travels this fraction of the distance while the incoming one travels all of it. */
const PARALLAX = 0.3;

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

/** Moves `value` to `to`, or jumps there when the system asks for less motion. */
function glide(value: SharedValue<number>, to: number, reduceMotion: boolean, ms = STEP_MS) {
  value.value = reduceMotion ? to : withTiming(to, { duration: ms, easing: STEP_EASING });
}

/** The step index as an animated number: 0, then 1, then 2, easing between each. */
export function useStepProgress(index: number): SharedValue<number> {
  const reduceMotion = useReduceMotion();
  const progress = useSharedValue(index);
  useEffect(() => {
    glide(progress, index, reduceMotion);
  }, [index, reduceMotion, progress]);
  return progress;
}

/**
 * One segment of the progress bar per step. A filled segment grows from the left rather than
 * switching colour, so the bar visibly travels with the step.
 */
export const StepProgress: React.FC<{ step: number; total: number }> = ({ step, total }) => {
  const reduceMotion = useReduceMotion();
  return (
    <View className="flex-row gap-2" accessible={false}>
      {Array.from({ length: total }, (_, i) => (
        <Segment key={i} filled={i < step} reduceMotion={reduceMotion} />
      ))}
    </View>
  );
};

const Segment: React.FC<{ filled: boolean; reduceMotion: boolean }> = ({
  filled,
  reduceMotion,
}) => {
  const fill = useSharedValue(filled ? 1 : 0);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    glide(fill, filled ? 1 : 0, reduceMotion);
  }, [filled, reduceMotion, fill]);
  // Scale from the left edge: scaleX pivots on the centre, so shift by half the lost width.
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: (-width * (1 - fill.value)) / 2 },
      { scaleX: Math.max(fill.value, 0.001) },
    ],
  }));
  return (
    <View
      className="flex-1 h-1 rounded-full bg-surface-sunken overflow-hidden"
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
    >
      <Animated.View className="h-1 rounded-full bg-action" style={style} />
    </View>
  );
};

/**
 * A footer that folds away (height and fade) when `open` is false, easing in step with the pager.
 * Content keeps its natural height inside, so nothing inside it reflows while it moves.
 */
export const FoldingFooter: React.FC<{
  open: boolean;
  height: number;
  children: React.ReactNode;
}> = ({ open, height, children }) => {
  const reduceMotion = useReduceMotion();
  const amount = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    glide(amount, open ? 1 : 0, reduceMotion);
  }, [open, reduceMotion, amount]);
  const style = useAnimatedStyle(() => ({
    height: amount.value * height,
    // Fade in over the second half, so the button does not appear squashed.
    opacity: interpolate(amount.value, [0, 0.5, 1], [0, 0, 1], Extrapolation.CLAMP),
  }));
  return (
    <Animated.View style={[{ overflow: 'hidden' }, style]} pointerEvents={open ? 'auto' : 'none'}>
      <View style={{ height }}>{children}</View>
    </Animated.View>
  );
};

/**
 * Shows one of several steps and moves between them with a horizontal slide, while the
 * container's height eases to the height of the step now in view.
 *
 * Every step is laid out side by side at its own natural height, so a step is measured before
 * it is shown. The height is read off the same `progress` value as the slide (interpolated
 * between the steps' heights), so it needs no tween of its own to chase the slide. A step
 * that changes height while in view (a section opening) is eased with a decaying offset.
 * Steps out of view are hidden from touch and screen readers.
 */
export const StepPager: React.FC<{ index: number; steps: React.ReactNode[] }> = ({
  index,
  steps,
}) => {
  const count = steps.length;
  const progress = useStepProgress(index);
  const width = useSharedValue(0);
  const heights = useSharedValue<number[]>(steps.map(() => 0));
  // Added to the interpolated height and eased back to 0: how a step resizes smoothly in place.
  const resize = useSharedValue(0);
  const reduceMotion = useReduceMotion();
  const [measured, setMeasured] = useState(false);
  const known = useRef<number[]>(steps.map(() => 0));
  const indexRef = useRef(index);
  indexRef.current = index;

  const onHeight = (i: number, h: number) => {
    const before = known.current[i];
    if (Math.abs(before - h) < 0.5) return;
    known.current = known.current.map((v, n) => (n === i ? h : v));
    const placed = before > 0;
    heights.value = known.current;
    if (placed && i === indexRef.current && !reduceMotion) {
      resize.value = before - h;
      resize.value = withTiming(0, { duration: RESIZE_MS, easing: STEP_EASING });
    }
    if (known.current[indexRef.current] > 0) setMeasured(true);
  };

  const containerStyle = useAnimatedStyle(() => {
    const hs = heights.value;
    const base =
      count > 1
        ? interpolate(
            progress.value,
            hs.map((_, i) => i),
            hs,
            Extrapolation.CLAMP,
          )
        : hs[0];
    return { height: base + resize.value };
  });

  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -progress.value * width.value }],
  }));

  return (
    <Animated.View
      // Until the active step has been measured the container sizes itself, so nothing is clipped.
      style={[{ overflow: 'hidden' }, measured ? containerStyle : null]}
      onLayout={(e) => {
        width.value = e.nativeEvent.layout.width;
      }}
    >
      <Animated.View
        style={[
          { flexDirection: 'row', alignItems: 'flex-start', width: `${count * 100}%` },
          trackStyle,
        ]}
      >
        {steps.map((step, i) => (
          <PagerStep
            key={i}
            i={i}
            count={count}
            active={i === index}
            progress={progress}
            width={width}
            onHeight={onHeight}
          >
            {step}
          </PagerStep>
        ))}
      </Animated.View>
    </Animated.View>
  );
};

const PagerStep: React.FC<{
  i: number;
  count: number;
  active: boolean;
  progress: SharedValue<number>;
  width: SharedValue<number>;
  onHeight: (i: number, h: number) => void;
  children: React.ReactNode;
}> = ({ i, count, active, progress, width, onHeight, children }) => {
  const style = useAnimatedStyle(() => {
    // 0 while this step is in view, +1 / -1 when a whole step away.
    const d = progress.value - i;
    return {
      // The track moves every step by the same amount; this lets the one leaving trail behind
      // and the one arriving settle in, which gives the slide depth.
      transform: [{ translateX: d * width.value * PARALLAX }],
      opacity: interpolate(Math.abs(d), [0, 0.6, 1], [1, 0.2, 0], Extrapolation.CLAMP),
    };
  });
  return (
    <Animated.View
      style={[{ width: `${100 / count}%` }, style]}
      pointerEvents={active ? 'auto' : 'none'}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
      accessibilityElementsHidden={!active}
      onLayout={(e) => onHeight(i, e.nativeEvent.layout.height)}
    >
      {children}
    </Animated.View>
  );
};
