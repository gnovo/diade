import type React from 'react';
import { useLayoutEffect, useRef } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';

const DURATION_MS = 260;
const SLIDE_PX = 28;

/**
 * Eases new content in when `transitionKey` changes: it fades up while sliding a short way from
 * the side it came from (`direction` 1 enters from the right, -1 from the left, 0 only fades).
 * Used for switching views and for moving between periods.
 */
export const ViewTransition: React.FC<{
  transitionKey: string;
  direction?: -1 | 0 | 1;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}> = ({ transitionKey, direction = 0, style, children }) => {
  const progress = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  const dir = useRef(direction);
  dir.current = direction;

  // Layout effect, so the new content never shows at full opacity for a frame before it fades in.
  // biome-ignore lint/correctness/useExhaustiveDependencies: transitionKey is the trigger that restarts the animation
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [transitionKey, progress]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateX: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [dir.current * SLIDE_PX, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
};
