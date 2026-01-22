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

export interface UseStaggeredAnimationOptions {
	staggerDelay?: number;
	maxDelay?: number;
	duration?: number;
	enabled?: boolean;
}

export interface StaggeredAnimationStyle {
	animation: string;
	opacity: number;
	transform: string;
}

export interface UseStaggeredAnimationReturn {
	getStyle: (index: number) => StaggeredAnimationStyle;
	getDelay: (index: number) => number;
	prefersReducedMotion: boolean;
	keyframes: string;
}

const DEFAULT_STAGGER_DELAY = 50;
const DEFAULT_MAX_DELAY = 500;
const DEFAULT_DURATION = 300;

const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";

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

export function useStaggeredAnimation(
	options: UseStaggeredAnimationOptions = {},
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
