/**
 * useStaggeredAnimation Hook
 *
 * Provides staggered animation delays for list items with reduced motion support.
 *
 * @see docs/plans/ui/25-motion.md staggered list entrance
 */

"use client";

import { useMemo } from "react";
import { useMatchMedia } from "./useMediaQuery";

// ============================================
// Types
// ============================================

export interface UseStaggeredAnimationOptions {
  /** Base delay between items in ms (default: 50) */
  staggerDelay?: number;
  /** Maximum total delay in ms (default: 500) */
  maxDelay?: number;
  /** Animation duration in ms (default: 300) */
  duration?: number;
  /** Whether animations are enabled (default: true) */
  enabled?: boolean;
}

export interface StaggeredAnimationStyle {
  /** CSS animation property */
  animation: string;
  /** Opacity for initial state */
  opacity: number;
  /** Transform for initial state */
  transform: string;
}

export interface UseStaggeredAnimationReturn {
  /** Get animation style for an item at given index */
  getStyle: (index: number) => StaggeredAnimationStyle;
  /** Get delay in ms for an item at given index */
  getDelay: (index: number) => number;
  /** Whether reduced motion is preferred */
  prefersReducedMotion: boolean;
  /** CSS keyframes definition (inject once) */
  keyframes: string;
}

// ============================================
// Constants
// ============================================

const DEFAULT_STAGGER_DELAY = 50;
const DEFAULT_MAX_DELAY = 500;
const DEFAULT_DURATION = 300;

/** CSS easing matching design system */
const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";

/** Keyframes for slide up animation */
export const SLIDE_UP_KEYFRAMES = `
@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
`;

// ============================================
// Hook
// ============================================

/**
 * Hook for staggered list entrance animations.
 *
 * Respects prefers-reduced-motion and provides consistent timing.
 *
 * @example
 * ```tsx
 * function ItemList({ items }: { items: string[] }) {
 *   const { getStyle, keyframes } = useStaggeredAnimation();
 *
 *   return (
 *     <>
 *       <style>{keyframes}</style>
 *       <ul>
 *         {items.map((item, index) => (
 *           <li key={item} style={getStyle(index)}>
 *             {item}
 *           </li>
 *         ))}
 *       </ul>
 *     </>
 *   );
 * }
 * ```
 */
export function useStaggeredAnimation(
  options: UseStaggeredAnimationOptions = {}
): UseStaggeredAnimationReturn {
  const {
    staggerDelay = DEFAULT_STAGGER_DELAY,
    maxDelay = DEFAULT_MAX_DELAY,
    duration = DEFAULT_DURATION,
    enabled = true,
  } = options;

  const prefersReducedMotion = useMatchMedia("(prefers-reduced-motion: reduce)");

  const getDelay = useMemo(() => {
    return (index: number): number => {
      if (!enabled || prefersReducedMotion) {
        return 0;
      }
      // Clamp delay to maxDelay
      return Math.min(index * staggerDelay, maxDelay);
    };
  }, [staggerDelay, maxDelay, enabled, prefersReducedMotion]);

  const getStyle = useMemo(() => {
    return (index: number): StaggeredAnimationStyle => {
      if (!enabled || prefersReducedMotion) {
        // No animation - show immediately
        return {
          animation: "none",
          opacity: 1,
          transform: "none",
        };
      }

      const delay = Math.min(index * staggerDelay, maxDelay);

      return {
        animation: `slideUp ${duration}ms ${EASE_OUT} ${delay}ms forwards`,
        opacity: 0,
        transform: "translateY(8px)",
      };
    };
  }, [staggerDelay, maxDelay, duration, enabled, prefersReducedMotion]);

  return {
    getStyle,
    getDelay,
    prefersReducedMotion,
    keyframes: SLIDE_UP_KEYFRAMES,
  };
}

// ============================================
// Exports
// ============================================

export default useStaggeredAnimation;
