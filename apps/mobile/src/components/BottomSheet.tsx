import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Modal, PanResponder, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SLIDE_MS = 240;
const DISMISS_DRAG = 90; // px dragged down that closes the sheet
const DISMISS_VELOCITY = 0.9;

/**
 * A modal sheet anchored to the bottom of the screen, like Material's modal bottom sheet:
 * a dimmed backdrop (tap to close), a drag handle (drag down to close), content that scrolls
 * once it outgrows 85% of the screen, and the system back button closes it.
 */
export const BottomSheet: React.FC<{
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}> = ({ visible, onClose, title, children }) => {
  const insets = useSafeAreaInsets();
  const height = Dimensions.get('window').height;
  const translateY = useRef(new Animated.Value(height)).current;
  const backdrop = useRef(new Animated.Value(0)).current;
  // The Modal stays mounted while the closing animation runs.
  const [mounted, setMounted] = useState(visible);

  const animate = useCallback(
    (open: boolean, done?: () => void) => {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: open ? 0 : height,
          duration: SLIDE_MS,
          easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdrop, { toValue: open ? 1 : 0, duration: SLIDE_MS, useNativeDriver: true }),
      ]).start(done ? () => done() : undefined);
    },
    [backdrop, height, translateY],
  );

  useEffect(() => {
    if (visible) {
      setMounted(true);
      // Next frame, so the Modal has laid out before it slides in.
      const id = requestAnimationFrame(() => animate(true));
      return () => cancelAnimationFrame(id);
    }
    if (mounted) animate(false, () => setMounted(false));
    return undefined;
    // `mounted` is deliberately not a dependency: it only follows `visible`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > DISMISS_DRAG || g.vy > DISMISS_VELOCITY) onCloseRef.current();
        else animate(true);
      },
      onPanResponderTerminate: () => animate(true),
    }),
  ).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  if (!mounted) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View className="flex-1 justify-end">
        <Animated.View
          style={{ opacity: backdrop, position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <Pressable
            style={{ flex: 1 }}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={title}
            accessibilityHint="Close"
          />
        </Animated.View>
        <Animated.View
          style={{ transform: [{ translateY }], maxHeight: height * 0.85, paddingBottom: insets.bottom }}
          className="bg-surface rounded-t-2xl border-t border-border-strong"
        >
          <View {...pan.panHandlers} className="items-center pt-3 pb-2" accessibilityRole="header">
            <View className="w-10 h-1 rounded-full bg-border-strong mb-3" />
            <Text className="text-base font-semibold text-ink">{title}</Text>
          </View>
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 }}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
};
