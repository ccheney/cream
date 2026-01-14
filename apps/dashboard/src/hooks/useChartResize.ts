/**
 * Chart Resize Hook
 *
 * Responsive chart sizing and resize handling with ResizeObserver,
 * debouncing, and aspect ratio support.
 *
 * @see docs/plans/ui/26-data-viz.md
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface ChartDimensions {
	width: number;
	height: number;
}

export type Breakpoint = "mobile" | "tablet" | "desktop";

export interface UseChartResizeOptions {
	/** Aspect ratio (width / height). Default: 16/9 */
	aspectRatio?: number;

	/** Fixed height (overrides aspect ratio) */
	fixedHeight?: number;

	/** Minimum width */
	minWidth?: number;

	/** Maximum width */
	maxWidth?: number;

	/** Minimum height */
	minHeight?: number;

	/** Maximum height */
	maxHeight?: number;

	/** Debounce delay in ms. Default: 100 */
	debounceMs?: number;

	/** Callback when dimensions change */
	onResize?: (dimensions: ChartDimensions, breakpoint: Breakpoint) => void;
}

/**
 * Resize hook return type.
 */
export interface UseChartResizeReturn {
	/** Container ref to attach */
	containerRef: React.RefObject<HTMLDivElement | null>;

	/** Current dimensions */
	dimensions: ChartDimensions;

	/** Current breakpoint */
	breakpoint: Breakpoint;

	/** Whether initial measurement is complete */
	isReady: boolean;

	/** Force recalculation */
	recalculate: () => void;
}

// ============================================
// Constants
// ============================================

/**
 * Breakpoint thresholds.
 */
export const BREAKPOINTS = {
	mobile: 768,
	tablet: 1024,
} as const;

/**
 * Common aspect ratios.
 */
export const ASPECT_RATIOS = {
	widescreen: 16 / 9,
	ultrawide: 21 / 9,
	standard: 4 / 3,
	golden: 1.618,
	square: 1,
	threeTwo: 3 / 2,
} as const;

/**
 * Default options.
 */
const DEFAULT_OPTIONS: Required<
	Omit<
		UseChartResizeOptions,
		"onResize" | "fixedHeight" | "minWidth" | "maxWidth" | "minHeight" | "maxHeight"
	>
> = {
	aspectRatio: ASPECT_RATIOS.widescreen,
	debounceMs: 100,
};

// ============================================
// Utility Functions
// ============================================

/**
 * Debounce function.
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
	fn: T,
	delay: number
): (...args: Parameters<T>) => void {
	let timeoutId: ReturnType<typeof setTimeout> | null = null;

	return (...args: Parameters<T>) => {
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
		timeoutId = setTimeout(() => {
			fn(...args);
			timeoutId = null;
		}, delay);
	};
}

/**
 * Get breakpoint from width.
 */
export function getBreakpoint(width: number): Breakpoint {
	if (width < BREAKPOINTS.mobile) {
		return "mobile";
	}
	if (width < BREAKPOINTS.tablet) {
		return "tablet";
	}
	return "desktop";
}

/**
 * Clamp value between min and max.
 */
export function clamp(value: number, min?: number, max?: number): number {
	let result = value;
	if (min !== undefined && result < min) {
		result = min;
	}
	if (max !== undefined && result > max) {
		result = max;
	}
	return result;
}

/**
 * Calculate dimensions from width and aspect ratio.
 */
export function calculateDimensions(
	containerWidth: number,
	options: UseChartResizeOptions
): ChartDimensions {
	const {
		aspectRatio = DEFAULT_OPTIONS.aspectRatio,
		fixedHeight,
		minWidth,
		maxWidth,
		minHeight,
		maxHeight,
	} = options;

	// Apply width constraints
	const width = clamp(containerWidth, minWidth, maxWidth);

	// Calculate height
	let height: number;
	if (fixedHeight !== undefined) {
		height = fixedHeight;
	} else {
		height = width / aspectRatio;
	}

	// Apply height constraints
	const finalHeight = clamp(height, minHeight, maxHeight);

	return {
		width: Math.round(width),
		height: Math.round(finalHeight),
	};
}

// ============================================
// Hook Implementation
// ============================================

/**
 * Hook for responsive chart sizing.
 *
 * Uses ResizeObserver for efficient container size detection
 * with debouncing to prevent excessive re-renders.
 *
 * @example
 * ```tsx
 * function Chart() {
 *   const { containerRef, dimensions, breakpoint, isReady } = useChartResize({
 *     aspectRatio: 16 / 9,
 *     debounceMs: 100,
 *   });
 *
 *   return (
 *     <div ref={containerRef}>
 *       {isReady && (
 *         <svg width={dimensions.width} height={dimensions.height}>
 *           ...
 *         </svg>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */
export function useChartResize(options: UseChartResizeOptions = {}): UseChartResizeReturn {
	const { debounceMs = DEFAULT_OPTIONS.debounceMs, onResize } = options;

	// Container ref
	const containerRef = useRef<HTMLDivElement>(null);

	// State
	const [dimensions, setDimensions] = useState<ChartDimensions>({
		width: 0,
		height: 0,
	});
	const [breakpoint, setBreakpoint] = useState<Breakpoint>("desktop");
	const [isReady, setIsReady] = useState(false);

	// Refs for callback stability
	const optionsRef = useRef(options);
	const onResizeRef = useRef(onResize);

	// Update refs
	useEffect(() => {
		optionsRef.current = options;
		onResizeRef.current = onResize;
	}, [options, onResize]);

	// Calculate and update dimensions
	const updateDimensions = useCallback(() => {
		const container = containerRef.current;
		if (!container) {
			return;
		}

		const rect = container.getBoundingClientRect();
		const containerWidth = rect.width;

		if (containerWidth === 0) {
			return;
		}

		const newDimensions = calculateDimensions(containerWidth, optionsRef.current);
		const newBreakpoint = getBreakpoint(containerWidth);

		setDimensions((prev) => {
			// Only update if changed
			if (prev.width === newDimensions.width && prev.height === newDimensions.height) {
				return prev;
			}
			return newDimensions;
		});

		setBreakpoint((prev) => {
			if (prev === newBreakpoint) {
				return prev;
			}
			return newBreakpoint;
		});

		setIsReady(true);

		// Call resize callback
		onResizeRef.current?.(newDimensions, newBreakpoint);
	}, []);

	// Recalculate function (manual trigger)
	const recalculate = useCallback(() => {
		updateDimensions();
	}, [updateDimensions]);

	// Setup ResizeObserver
	useEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return;
		}

		// Initial measurement
		updateDimensions();

		// Debounced resize handler
		const debouncedUpdate = debounce(updateDimensions, debounceMs);

		// Create observer
		const observer = new ResizeObserver((_entries) => {
			// Use requestAnimationFrame for smooth updates
			requestAnimationFrame(() => {
				debouncedUpdate();
			});
		});

		observer.observe(container);

		return () => {
			observer.disconnect();
		};
	}, [updateDimensions, debounceMs]);

	return {
		containerRef,
		dimensions,
		breakpoint,
		isReady,
		recalculate,
	};
}

// ============================================
// Preset Hooks
// ============================================

/**
 * Hook for widescreen charts (16:9).
 */
export function useWidescreenChart(
	options?: Omit<UseChartResizeOptions, "aspectRatio">
): UseChartResizeReturn {
	return useChartResize({
		...options,
		aspectRatio: ASPECT_RATIOS.widescreen,
	});
}

/**
 * Hook for square charts (1:1).
 */
export function useSquareChart(
	options?: Omit<UseChartResizeOptions, "aspectRatio">
): UseChartResizeReturn {
	return useChartResize({
		...options,
		aspectRatio: ASPECT_RATIOS.square,
	});
}

/**
 * Hook for sparklines (fixed height).
 */
export function useSparklineSize(
	height = 32,
	options?: Omit<UseChartResizeOptions, "fixedHeight">
): UseChartResizeReturn {
	return useChartResize({
		...options,
		fixedHeight: height,
	});
}

/**
 * Hook for ultrawide charts (21:9).
 */
export function useUltrawideChart(
	options?: Omit<UseChartResizeOptions, "aspectRatio">
): UseChartResizeReturn {
	return useChartResize({
		...options,
		aspectRatio: ASPECT_RATIOS.ultrawide,
	});
}

export default useChartResize;
