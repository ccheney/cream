/**
 * TickDots Component
 *
 * Displays recent price tick direction history as colored triangles.
 * Shows the last N price direction changes (up/down ticks).
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 5.1
 */

"use client";

import { AnimatePresence, motion } from "framer-motion";
import { memo, useMemo } from "react";

// ============================================
// Types
// ============================================

export type TickDirection = "up" | "down";

export interface TickDotsProps {
	/** Array of tick directions (most recent last) */
	ticks: TickDirection[];
	/** Maximum number of dots to display */
	maxDots?: number;
	/** Size of each dot in pixels */
	dotSize?: number;
	/** Gap between dots in pixels */
	gap?: number;
	/** Custom CSS class */
	className?: string;
	/** Test ID for testing */
	"data-testid"?: string;
}

// ============================================
// Constants
// ============================================

const DEFAULT_MAX_DOTS = 8;
const DEFAULT_DOT_SIZE = 6;
const DEFAULT_GAP = 2;

// ============================================
// Tick Dot Component
// ============================================

interface TickDotProps {
	direction: TickDirection;
	size: number;
	index: number;
}

const TickDot = memo(function TickDot({ direction, size, index }: TickDotProps) {
	const isUp = direction === "up";

	// Triangle points for up/down arrows
	const halfSize = size / 2;
	const points = isUp
		? `${halfSize},0 ${size},${size} 0,${size}` // Up triangle
		: `0,0 ${size},0 ${halfSize},${size}`; // Down triangle

	const color = isUp ? "#22c55e" : "#ef4444"; // green-500 / red-500

	return (
		<motion.svg
			width={size}
			height={size}
			viewBox={`0 0 ${size} ${size}`}
			initial={{ scale: 0, opacity: 0 }}
			animate={{ scale: 1, opacity: 1 }}
			exit={{ scale: 0, opacity: 0 }}
			transition={{
				type: "spring",
				stiffness: 400,
				damping: 20,
				delay: index * 0.03, // Stagger animation
			}}
			aria-hidden="true"
		>
			<polygon points={points} fill={color} />
		</motion.svg>
	);
});

// ============================================
// Component
// ============================================

/**
 * TickDots displays recent price direction changes as triangular indicators.
 *
 * Features:
 * - Up ticks shown as green up-triangles
 * - Down ticks shown as red down-triangles
 * - New dots animate in with spring effect
 * - Limited to maxDots (oldest removed first)
 *
 * @example
 * ```tsx
 * <TickDots
 *   ticks={['up', 'up', 'down', 'up', 'down', 'up']}
 *   maxDots={8}
 * />
 * ```
 */
export const TickDots = memo(function TickDots({
	ticks,
	maxDots = DEFAULT_MAX_DOTS,
	dotSize = DEFAULT_DOT_SIZE,
	gap = DEFAULT_GAP,
	className = "",
	"data-testid": testId,
}: TickDotsProps) {
	// Get the most recent N ticks
	const displayTicks = useMemo(() => {
		return ticks.slice(-maxDots);
	}, [ticks, maxDots]);

	// Generate ARIA label
	const ariaLabel = useMemo(() => {
		if (displayTicks.length === 0) {
			return "No recent price changes";
		}

		const upCount = displayTicks.filter((t) => t === "up").length;
		const downCount = displayTicks.length - upCount;

		return `Last ${displayTicks.length} price changes: ${upCount} up, ${downCount} down`;
	}, [displayTicks]);

	// Handle empty state
	if (displayTicks.length === 0) {
		return (
			<div
				className={`tick-dots flex items-center ${className}`}
				data-testid={testId}
				role="img"
				aria-label={ariaLabel}
				style={{ height: dotSize }}
			>
				<span className="text-xs text-gray-400">--</span>
			</div>
		);
	}

	return (
		<div
			className={`tick-dots flex items-center ${className}`}
			data-testid={testId}
			role="img"
			aria-label={ariaLabel}
			style={{ gap: `${gap}px` }}
		>
			<AnimatePresence mode="popLayout">
				{displayTicks.map((direction, index) => (
					<TickDot
						// Use a stable key based on position from the end
						// This ensures proper animation when new ticks are added
						key={`tick-${ticks.length - displayTicks.length + index}`}
						direction={direction}
						size={dotSize}
						index={index}
					/>
				))}
			</AnimatePresence>
		</div>
	);
});

// ============================================
// Exports
// ============================================

export default TickDots;
