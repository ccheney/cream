/**
 * useTouchGestures Hook
 *
 * Touch gesture support for mobile interactions including swipe,
 * long-press, and pull-to-refresh.
 *
 * @see docs/plans/ui/30-themes.md Touch Adaptations
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ============================================
// Types
// ============================================

export type SwipeDirection = "left" | "right" | "up" | "down";

export interface TouchGestureHandlers {
  /** Called on swipe gesture */
  onSwipe?: (direction: SwipeDirection, distance: number) => void;
  /** Called on long press (default: 500ms) */
  onLongPress?: () => void;
  /** Called on pull down (for refresh) */
  onPullRefresh?: () => void | Promise<void>;
}

export interface TouchGestureOptions {
  /** Minimum swipe distance in pixels (default: 50) */
  swipeThreshold?: number;
  /** Long press duration in ms (default: 500) */
  longPressDelay?: number;
  /** Pull refresh threshold in pixels (default: 80) */
  pullThreshold?: number;
  /** Whether gestures are enabled (default: true) */
  enabled?: boolean;
}

export interface TouchGestureState {
  /** Whether a touch is active */
  isTouching: boolean;
  /** Whether long press is active */
  isLongPressing: boolean;
  /** Whether pull refresh is active */
  isPulling: boolean;
  /** Current pull distance */
  pullDistance: number;
  /** Whether refresh is in progress */
  isRefreshing: boolean;
}

export interface UseTouchGesturesReturn<T extends HTMLElement> {
  /** Ref to attach to the element */
  ref: React.RefObject<T | null>;
  /** Current gesture state */
  state: TouchGestureState;
  /** Manually reset state */
  reset: () => void;
}

// ============================================
// Constants
// ============================================

const DEFAULT_SWIPE_THRESHOLD = 50;
const DEFAULT_LONG_PRESS_DELAY = 500;
const DEFAULT_PULL_THRESHOLD = 80;

// ============================================
// Hook
// ============================================

/**
 * Hook for touch gesture handling.
 *
 * @example
 * ```tsx
 * function SwipeableCard() {
 *   const { ref, state } = useTouchGestures<HTMLDivElement>({
 *     onSwipe: (direction, distance) => {
 *       if (direction === 'left') {
 *         dismissCard();
 *       }
 *     },
 *     onLongPress: () => {
 *       openContextMenu();
 *     },
 *   });
 *
 *   return (
 *     <div ref={ref} className={state.isTouching ? 'touching' : ''}>
 *       Card content
 *     </div>
 *   );
 * }
 * ```
 */
export function useTouchGestures<T extends HTMLElement = HTMLDivElement>(
  handlers: TouchGestureHandlers,
  options: TouchGestureOptions = {}
): UseTouchGesturesReturn<T> {
  const {
    swipeThreshold = DEFAULT_SWIPE_THRESHOLD,
    longPressDelay = DEFAULT_LONG_PRESS_DELAY,
    pullThreshold = DEFAULT_PULL_THRESHOLD,
    enabled = true,
  } = options;

  const ref = useRef<T>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [state, setState] = useState<TouchGestureState>({
    isTouching: false,
    isLongPressing: false,
    isPulling: false,
    pullDistance: 0,
    isRefreshing: false,
  });

  const reset = useCallback(() => {
    setState({
      isTouching: false,
      isLongPressing: false,
      isPulling: false,
      pullDistance: 0,
      isRefreshing: false,
    });
    touchStartRef.current = null;
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const element = ref.current;
    if (!element) {
      return;
    }

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) {
        return;
      }

      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      };

      setState((prev) => ({ ...prev, isTouching: true }));

      // Start long press timer
      if (handlers.onLongPress) {
        longPressTimerRef.current = setTimeout(() => {
          setState((prev) => ({ ...prev, isLongPressing: true }));
          handlers.onLongPress?.();
        }, longPressDelay);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchStartRef.current) {
        return;
      }

      const touch = e.touches[0];
      if (!touch) {
        return;
      }

      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;

      // Cancel long press on significant movement
      if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
      }

      // Handle pull-to-refresh
      if (deltaY > 0 && handlers.onPullRefresh) {
        // Check if at top of scroll container
        const scrollTop = element.scrollTop ?? 0;
        if (scrollTop === 0) {
          e.preventDefault();
          setState((prev) => ({
            ...prev,
            isPulling: true,
            pullDistance: Math.min(deltaY, pullThreshold * 1.5),
          }));
        }
      }
    };

    const handleTouchEnd = async (e: TouchEvent) => {
      if (!touchStartRef.current) {
        return;
      }

      const touch = e.changedTouches[0];
      if (!touch) {
        reset();
        return;
      }

      // Clear long press timer
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }

      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      // Handle swipe
      if (handlers.onSwipe && (absX >= swipeThreshold || absY >= swipeThreshold)) {
        if (absX > absY) {
          // Horizontal swipe
          const direction: SwipeDirection = deltaX > 0 ? "right" : "left";
          handlers.onSwipe(direction, absX);
        } else {
          // Vertical swipe
          const direction: SwipeDirection = deltaY > 0 ? "down" : "up";
          handlers.onSwipe(direction, absY);
        }
      }

      // Handle pull-to-refresh
      if (state.isPulling && deltaY >= pullThreshold && handlers.onPullRefresh) {
        setState((prev) => ({ ...prev, isRefreshing: true }));
        try {
          await handlers.onPullRefresh();
        } finally {
          reset();
        }
        return;
      }

      reset();
    };

    const handleTouchCancel = () => {
      reset();
    };

    element.addEventListener("touchstart", handleTouchStart, { passive: true });
    element.addEventListener("touchmove", handleTouchMove, { passive: false });
    element.addEventListener("touchend", handleTouchEnd, { passive: true });
    element.addEventListener("touchcancel", handleTouchCancel, { passive: true });

    return () => {
      element.removeEventListener("touchstart", handleTouchStart);
      element.removeEventListener("touchmove", handleTouchMove);
      element.removeEventListener("touchend", handleTouchEnd);
      element.removeEventListener("touchcancel", handleTouchCancel);

      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, [enabled, handlers, swipeThreshold, longPressDelay, pullThreshold, state.isPulling, reset]);

  return {
    ref,
    state,
    reset,
  };
}

// ============================================
// Exports
// ============================================

export default useTouchGestures;
