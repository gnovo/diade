import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Dimensions,
  Easing,
  Keyboard,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const OPEN_MS = 300;
const CLOSE_MS = 220;
const KEYBOARD_MS = 200;
const DISMISS_DRAG = 90; // px dragged down that closes the sheet
const DISMISS_VELOCITY = 0.9;
const MAX_HEIGHT_RATIO = 0.85;
const TOP_GAP = 16; // minimum gap between the sheet and the top of the screen

// Material's emphasized curves: decelerate in, accelerate out.
const openEasing = Easing.bezier(0.2, 0, 0, 1);
const closeEasing = Easing.bezier(0.3, 0, 0.8, 0.15);

/**
 * A modal sheet anchored to the bottom of the screen: a dimmed backdrop (tap to close), a
 * drag handle (drag down to close), content that scrolls once it outgrows the available
 * height, and the system back button closes it.
 *
 * Motion: the sheet measures itself and slides in from exactly its own height, so there is no
 * dead time off-screen. The backdrop is derived from the sheet's position, so the two can
 * never drift apart, including while dragging. The sheet rises above the keyboard and shrinks
 * to fit, and animations are skipped when the system asks to reduce motion.
 */
export const BottomSheet: React.FC<{
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Pinned below the scrolling content, so a primary action stays visible above the keyboard. */
  footer?: React.ReactNode;
  /** The footer brings its own padding (and may animate its own height), so it is not wrapped. */
  bareFooter?: boolean;
  /** Called once the closing animation has finished and the content is gone. */
  onClosed?: () => void;
}> = ({ visible, onClose, title, children, footer, bareFooter, onClosed }) => {
  const insets = useSafeAreaInsets();
  const screenH = Dimensions.get('window').height;
  const maxHeight = screenH * MAX_HEIGHT_RATIO;

  // translateY is native-driven (outer view). paddingBottom/maxHeight are layout props and
  // therefore JS-driven (inner view). One node cannot mix both, hence the two views.
  const translateY = useRef(new Animated.Value(screenH)).current;
  const bottomPad = useRef(new Animated.Value(insets.bottom)).current;
  const sheetHeight = useRef(screenH);
  const [mounted, setMounted] = useState(visible);
  const mountedRef = useRef(visible);
  const wantOpen = useRef(visible);
  const settledOpen = useRef(false);
  const reduceMotion = useRef(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      reduceMotion.current = on;
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (on) => {
      reduceMotion.current = on;
    });
    return () => sub.remove();
  }, []);

  const slideTo = useCallback(
    (open: boolean, done?: () => void) => {
      translateY.stopAnimation();
      Animated.timing(translateY, {
        toValue: open ? 0 : sheetHeight.current + 40,
        duration: reduceMotion.current ? 0 : open ? OPEN_MS : CLOSE_MS,
        easing: open ? openEasing : closeEasing,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) done?.();
      });
    },
    [translateY],
  );

  useEffect(() => {
    wantOpen.current = visible;
    if (visible) {
      if (mountedRef.current) {
        // Reopened while still closing: slide back from wherever it is.
        settledOpen.current = true;
        slideTo(true);
      } else {
        translateY.setValue(screenH);
        // A sheet closed while the keyboard was up never hears it hide, so drop the old lift.
        bottomPad.setValue(insets.bottom);
        setKeyboardHeight(0);
        mountedRef.current = true;
        setMounted(true); // the slide-in starts from onLayout, once the height is known
      }
    } else if (mountedRef.current) {
      slideTo(false, () => {
        settledOpen.current = false;
        mountedRef.current = false;
        setMounted(false);
        onClosedRef.current?.();
      });
    }
    // Only `visible` drives this; the rest are stable refs or values read at call time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const onSheetLayout = (height: number) => {
    sheetHeight.current = height;
    if (wantOpen.current && !settledOpen.current && height > 0) {
      settledOpen.current = true;
      translateY.setValue(height);
      slideTo(true);
    }
  };

  // Rise above the keyboard. Modals on Android do not resize for it, so do it by hand.
  useEffect(() => {
    if (!mounted) return undefined;
    const ios = Platform.OS === 'ios';
    const move = (to: number, duration: number) =>
      Animated.timing(bottomPad, {
        toValue: to,
        duration: reduceMotion.current ? 0 : duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    // On Android the reported height leaves out the navigation-bar inset that the keyboard
    // also covers; on iOS it already includes the home-indicator area.
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      const covered = e.endCoordinates.height + (ios ? 0 : insets.bottom);
      setKeyboardHeight(covered);
      move(covered, ios && e.duration ? e.duration : KEYBOARD_MS);
    });
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', (e) => {
      setKeyboardHeight(0);
      move(insets.bottom, ios && e?.duration ? e.duration : KEYBOARD_MS);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [mounted, bottomPad, insets.bottom]);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > DISMISS_DRAG || g.vy > DISMISS_VELOCITY) onCloseRef.current();
        else slideTo(true);
      },
      onPanResponderTerminate: () => slideTo(true),
    }),
  ).current;

  if (!mounted) return null;

  // The cap includes the bottom padding that lifts the sheet over the keyboard, so with the
  // keyboard open the sheet may grow until it is TOP_GAP below the top of the screen.
  const keyboardOpenHeight = screenH - insets.top - TOP_GAP;
  const lift = Math.max(keyboardHeight, insets.bottom + 1);
  const animatedMaxHeight = bottomPad.interpolate({
    inputRange: [insets.bottom, lift],
    outputRange: [maxHeight, keyboardOpenHeight],
    extrapolate: 'clamp',
  });
  // 0 when the sheet is fully open, 1 when it is off-screen: the backdrop follows it.
  const backdropOpacity = translateY.interpolate({
    inputRange: [0, Math.max(sheetHeight.current, 1)],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View className="flex-1 justify-end">
        <Animated.View
          style={{ opacity: backdropOpacity, position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' }}
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
          style={{ transform: [{ translateY }] }}
          onLayout={(e) => onSheetLayout(e.nativeEvent.layout.height)}
        >
          <Animated.View
            style={{ maxHeight: animatedMaxHeight, paddingBottom: bottomPad }}
            className="bg-surface rounded-t-2xl border-t border-border-strong"
          >
            <View {...pan.panHandlers} className="items-center pt-3 pb-2" accessibilityRole="header">
              <View className="w-10 h-1 rounded-full bg-border-strong mb-3" />
              <Text className="text-base font-semibold text-ink">{title}</Text>
            </View>
            <ScrollView
              style={{ flexGrow: 0 }}
              contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 }}
              keyboardShouldPersistTaps="handled"
              bounces={false}
            >
              {children}
            </ScrollView>
            {footer ? bareFooter ? footer : <View className="px-4 pt-2 pb-4">{footer}</View> : null}
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
};
