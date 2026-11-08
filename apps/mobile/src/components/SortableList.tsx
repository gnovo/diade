import type React from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, type PanResponderInstance, View } from 'react-native';
import { Icon, useColor, useShadow } from '../design';

const SHIFT_MS = 160;
const SETTLE_MS = 160;
/** If the data never reflects a drop (the write failed), stop holding the local order. */
const LOCAL_ORDER_TIMEOUT_MS = 2500;

export interface SortableItem {
  id: string;
}

interface Gesture {
  id: string;
  start: number;
  target: number;
  heights: number[];
  tops: number[];
}

/**
 * A vertical list whose rows are reordered by dragging a grip handle. Only the handle responds to
 * the drag, so it never competes with a row's own swipe gesture or with scrolling the page. The
 * parent is told when a drag starts and ends (`onDragChange`) so it can lock the page scroll.
 *
 * While dragging, the lifted row follows the finger and the rows it passes slide out of the way
 * on the native thread. On drop the new order is held locally until the data catches up, so the
 * row does not jump back for a frame while the write is saved. Rows are assumed to be fully
 * visible; there is no auto-scroll for lists taller than the screen.
 */
export function SortableList<T extends SortableItem>({
  items,
  renderItem,
  onReorder,
  onDragChange,
}: {
  items: readonly T[];
  /** `handle` is the grip to place inside the row. */
  renderItem: (item: T, index: number, handle: React.ReactNode) => React.ReactNode;
  onReorder: (from: number, to: number) => void;
  onDragChange?: (dragging: boolean) => void;
}) {
  const shadow = useShadow('shadowSm');
  const surface = useColor('surface');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);

  const ordered = useMemo(() => {
    if (!localOrder) return items;
    const byId = new Map(items.map((item) => [item.id, item]));
    const known = localOrder.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
    return known.length === items.length ? known : items;
  }, [items, localOrder]);
  const orderedRef = useRef(ordered);
  orderedRef.current = ordered;

  const heights = useRef<Record<string, number>>({});
  const shifts = useRef(new Map<string, Animated.Value>());
  const gesture = useRef<Gesture | null>(null);
  const responders = useRef(new Map<string, PanResponderInstance>());
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  const onDragChangeRef = useRef(onDragChange);
  onDragChangeRef.current = onDragChange;

  const shiftOf = useCallback((id: string) => {
    let value = shifts.current.get(id);
    if (!value) {
      value = new Animated.Value(0);
      shifts.current.set(id, value);
    }
    return value;
  }, []);

  const resetTransforms = useCallback(() => {
    for (const value of shifts.current.values()) value.setValue(0);
  }, []);

  // The data has caught up with (or moved past) the order we were holding.
  useEffect(() => {
    if (!localOrder) return undefined;
    const sameOrder =
      items.length === localOrder.length && items.every((item, i) => item.id === localOrder[i]);
    const sameSet =
      items.length === localOrder.length && items.every((item) => localOrder.includes(item.id));
    if (sameOrder || !sameSet) {
      setLocalOrder(null);
      return undefined;
    }
    const timer = setTimeout(() => setLocalOrder(null), LOCAL_ORDER_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [items, localOrder]);

  // Clear the drag offsets only after the reordered rows have been laid out, so nothing flashes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: localOrder is a trigger: transforms reset after every committed reorder
  useLayoutEffect(() => {
    resetTransforms();
  }, [localOrder, resetTransforms]);

  const applyShifts = (g: Gesture) => {
    const list = orderedRef.current;
    list.forEach((item, j) => {
      if (j === g.start) return;
      let to = 0;
      if (g.start < g.target && j > g.start && j <= g.target) to = -g.heights[g.start]!;
      else if (g.start > g.target && j >= g.target && j < g.start) to = g.heights[g.start]!;
      Animated.timing(shiftOf(item.id), {
        toValue: to,
        duration: SHIFT_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
  };

  const finish = (g: Gesture) => {
    let settle = 0;
    if (g.target > g.start) for (let j = g.start + 1; j <= g.target; j++) settle += g.heights[j]!;
    else if (g.target < g.start) for (let j = g.target; j < g.start; j++) settle -= g.heights[j]!;

    // The lifted row is driven through its own value, like every other row: swapping which animated
    // value a native-driven view reads leaves the view stuck on the old one's last transform.
    Animated.timing(shiftOf(g.id), {
      toValue: settle,
      duration: SETTLE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      if (g.target !== g.start) {
        const ids = orderedRef.current.map((item) => item.id);
        const [moved] = ids.splice(g.start, 1);
        ids.splice(g.target, 0, moved!);
        setLocalOrder(ids);
        onReorderRef.current(g.start, g.target);
      } else {
        resetTransforms();
      }
      setActiveId(null);
      onDragChangeRef.current?.(false);
    });
  };

  const responderFor = (id: string): PanResponderInstance => {
    let responder = responders.current.get(id);
    if (!responder) {
      responder = PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        // The page's scroll view must not take the drag over once it has started.
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          const list = orderedRef.current;
          const start = list.findIndex((item) => item.id === id);
          if (start < 0) return;
          const hs = list.map((item) => heights.current[item.id] ?? 0);
          const tops: number[] = [];
          let acc = 0;
          hs.forEach((h, i) => {
            tops[i] = acc;
            acc += h;
          });
          gesture.current = { id, start, target: start, heights: hs, tops };
          shiftOf(id).setValue(0);
          setActiveId(id);
          onDragChangeRef.current?.(true);
        },
        onPanResponderMove: (_, g) => {
          const current = gesture.current;
          if (!current) return;
          shiftOf(current.id).setValue(g.dy);
          const center = current.tops[current.start]! + current.heights[current.start]! / 2 + g.dy;
          let target = 0;
          current.heights.forEach((h, j) => {
            if (j !== current.start && current.tops[j]! + h / 2 < center) target++;
          });
          if (target !== current.target) {
            current.target = target;
            applyShifts(current);
          }
        },
        onPanResponderRelease: () => {
          const current = gesture.current;
          gesture.current = null;
          if (current) finish(current);
        },
        onPanResponderTerminate: () => {
          const current = gesture.current;
          gesture.current = null;
          if (current) finish(current);
        },
      });
      responders.current.set(id, responder);
    }
    return responder;
  };

  return (
    <View>
      {ordered.map((item, index) => {
        const active = item.id === activeId;
        const handle = (
          <View
            {...responderFor(item.id).panHandlers}
            // Screen readers reorder with the row's "move up / down" actions instead.
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            className="w-10 h-12 -mr-2 items-center justify-center"
          >
            <Icon name="grip-vertical" />
          </View>
        );
        return (
          <Animated.View
            key={item.id}
            onLayout={(e) => {
              heights.current[item.id] = e.nativeEvent.layout.height;
            }}
            // Inline styles only: toggling a className would swap the element type under NativeWind
            // and remount the row (and the handle that is holding the touch) in the middle of a drag.
            style={[
              {
                zIndex: active ? 10 : 0,
                backgroundColor: active ? surface : 'transparent',
                borderRadius: active ? 8 : 0,
                transform: [{ translateY: shiftOf(item.id) }],
              },
              active ? shadow : null,
            ]}
          >
            {renderItem(item, index, handle)}
          </Animated.View>
        );
      })}
    </View>
  );
}
