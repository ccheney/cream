/**
 * useAutoScroll Hook
 *
 * Manages auto-scroll behavior for real-time feeds.
 * Auto-scrolls to bottom when new items arrive (if already at bottom),
 * pauses when user scrolls up, and resumes when user scrolls back to bottom.
 *
 * @see docs/plans/ui/31-realtime-patterns.md lines 50-52
 */

import { useCallback, useEffect, useRef, useState } from "react";

// ============================================
// Types
// ============================================

export interface UseAutoScrollOptions {
  /** Threshold in pixels to consider "at bottom" */
  threshold?: number;
  /** Debounce time in ms for scroll position checks */
  debounceMs?: number;
}

export interface UseAutoScrollReturn {
  /** Reference to attach to the scrollable container */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Whether auto-scroll is currently active */
  isAutoScrolling: boolean;
  /** Whether user is at the bottom of the feed */
  isAtBottom: boolean;
  /** Number of new items since user scrolled away */
  newItemCount: number;
  /** Scroll to bottom and resume auto-scroll */
  scrollToBottom: () => void;
  /** Notify that new items have arrived */
  onNewItems: (count?: number) => void;
  /** Handle scroll events (attach to onScroll) */
  onScroll: () => void;
}

// ============================================
// Hook Implementation
// ============================================

export function useAutoScroll(options: UseAutoScrollOptions = {}): UseAutoScrollReturn {
  const { threshold = 50, debounceMs = 100 } = options;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isAutoScrolling, setIsAutoScrolling] = useState(true);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [newItemCount, setNewItemCount] = useState(0);

  // Debounce timer ref
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isScrollingRef = useRef(false);

  /**
   * Check if container is scrolled to bottom.
   */
  const checkIsAtBottom = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      return true;
    }

    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    return distanceFromBottom <= threshold;
  }, [threshold]);

  /**
   * Scroll to the bottom of the container.
   */
  const scrollToBottom = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });

    setIsAutoScrolling(true);
    setIsAtBottom(true);
    setNewItemCount(0);
  }, []);

  /**
   * Handle scroll events with debouncing.
   */
  const onScroll = useCallback(() => {
    // Clear existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Mark as scrolling
    isScrollingRef.current = true;

    // Debounce the scroll position check
    debounceTimerRef.current = setTimeout(() => {
      isScrollingRef.current = false;
      const atBottom = checkIsAtBottom();

      setIsAtBottom(atBottom);

      if (atBottom) {
        // User scrolled back to bottom, resume auto-scroll
        setIsAutoScrolling(true);
        setNewItemCount(0);
      } else {
        // User scrolled away from bottom, pause auto-scroll
        setIsAutoScrolling(false);
      }
    }, debounceMs);
  }, [checkIsAtBottom, debounceMs]);

  /**
   * Notify that new items have arrived.
   */
  const onNewItems = useCallback(
    (count = 1) => {
      if (isAutoScrolling && !isScrollingRef.current) {
        // Auto-scroll to show new items
        requestAnimationFrame(() => {
          scrollToBottom();
        });
      } else {
        // Increment new item count
        setNewItemCount((prev) => prev + count);
      }
    },
    [isAutoScrolling, scrollToBottom]
  );

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    containerRef,
    isAutoScrolling,
    isAtBottom,
    newItemCount,
    scrollToBottom,
    onNewItems,
    onScroll,
  };
}

export default useAutoScroll;
