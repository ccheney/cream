/**
 * usePriceFlash Hook
 *
 * Detects price direction changes and provides flash animation state.
 *
 * @see docs/plans/ui/31-realtime-patterns.md lines 23-26
 */

import { useCallback, useEffect, useRef, useState } from "react";

// ============================================
// Types
// ============================================

export type FlashDirection = "up" | "down" | null;

export interface FlashState {
  /** Current flash direction (null when not flashing) */
  direction: FlashDirection;
  /** Whether the flash animation is active */
  isFlashing: boolean;
}

export interface UsePriceFlashOptions {
  /** Minimum time between flashes (ms) */
  debounceMs?: number;
  /** Total flash duration (ms) */
  flashDurationMs?: number;
}

export interface UsePriceFlashReturn {
  /** Current flash state */
  flash: FlashState;
  /** Trigger a flash manually */
  triggerFlash: (direction: FlashDirection) => void;
}

// ============================================
// Constants
// ============================================

const DEFAULT_DEBOUNCE_MS = 500;
const DEFAULT_FLASH_DURATION_MS = 1100; // 300ms in + 500ms hold + 300ms out

// ============================================
// Hook Implementation
// ============================================

/**
 * Hook to manage price flash animations.
 *
 * Detects price changes and provides flash state for CSS animations.
 *
 * @example
 * ```tsx
 * const { flash } = usePriceFlash(currentPrice, previousPrice);
 *
 * return (
 *   <div className={cn(
 *     flash.isFlashing && flash.direction === 'up' && 'animate-flash-green',
 *     flash.isFlashing && flash.direction === 'down' && 'animate-flash-red'
 *   )}>
 *     {formattedPrice}
 *   </div>
 * );
 * ```
 */
export function usePriceFlash(
  currentPrice: number,
  previousPrice: number | undefined,
  options: UsePriceFlashOptions = {}
): UsePriceFlashReturn {
  const {
    debounceMs = DEFAULT_DEBOUNCE_MS,
    flashDurationMs = DEFAULT_FLASH_DURATION_MS,
  } = options;

  const [flash, setFlash] = useState<FlashState>({
    direction: null,
    isFlashing: false,
  });

  const lastFlashTimeRef = useRef<number>(0);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPriceRef = useRef<number | undefined>(previousPrice);

  // Clear flash after duration
  const clearFlash = useCallback(() => {
    setFlash({ direction: null, isFlashing: false });
  }, []);

  // Trigger a flash
  const triggerFlash = useCallback(
    (direction: FlashDirection) => {
      const now = Date.now();

      // Debounce check
      if (now - lastFlashTimeRef.current < debounceMs) {
        return;
      }

      // Clear any pending timeout
      if (flashTimeoutRef.current) {
        clearTimeout(flashTimeoutRef.current);
      }

      // Start flash
      lastFlashTimeRef.current = now;
      setFlash({ direction, isFlashing: true });

      // Schedule clear
      flashTimeoutRef.current = setTimeout(clearFlash, flashDurationMs);
    },
    [debounceMs, flashDurationMs, clearFlash]
  );

  // Detect price changes
  useEffect(() => {
    // Skip if no previous price to compare
    if (prevPriceRef.current === undefined) {
      prevPriceRef.current = currentPrice;
      return;
    }

    // Skip if price hasn't changed
    if (currentPrice === prevPriceRef.current) {
      return;
    }

    // Determine direction
    const direction: FlashDirection =
      currentPrice > prevPriceRef.current ? "up" : "down";

    // Trigger flash
    triggerFlash(direction);

    // Update previous price
    prevPriceRef.current = currentPrice;
  }, [currentPrice, triggerFlash]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) {
        clearTimeout(flashTimeoutRef.current);
      }
    };
  }, []);

  return { flash, triggerFlash };
}

export default usePriceFlash;
