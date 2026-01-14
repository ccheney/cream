/**
 * StatusDot Component
 *
 * Living indicator that shows system status through continuous animation.
 * Implements the "Living Indicators" design pattern for an alive-feeling dashboard.
 *
 * @see docs/plans/ui/20-design-philosophy.md — Key Visual Signatures (lines 94-95)
 * @see docs/plans/ui/25-motion.md — Animation timings
 */

import { forwardRef, type HTMLAttributes } from "react";

// Simple className merger utility
function cn(...classes: (string | boolean | undefined | null)[]): string {
	return classes.filter(Boolean).join(" ");
}

// ============================================
// Types
// ============================================

export type StatusDotStatus = "active" | "processing" | "idle" | "error" | "paused" | "streaming";

export type StatusDotSize = "xs" | "sm" | "md" | "lg";

export interface StatusDotProps extends HTMLAttributes<HTMLSpanElement> {
	/** Status determines color and animation */
	status: StatusDotStatus;
	/** Size of the dot */
	size?: StatusDotSize;
	/** Show outer glow effect */
	glow?: boolean;
	/** Accessible label (required for screen readers) */
	label?: string;
	/** Additional class names */
	className?: string;
}

// ============================================
// Status Configuration
// ============================================

const statusConfig: Record<
	StatusDotStatus,
	{ color: string; animation: string; glowColor: string; ariaLabel: string }
> = {
	active: {
		color: "bg-green-500",
		animation: "animate-pulse-scale",
		glowColor: "shadow-[0_0_8px_rgba(34,197,94,0.6)]",
		ariaLabel: "Active",
	},
	processing: {
		color: "bg-amber-500",
		animation: "animate-spin",
		glowColor: "shadow-[0_0_8px_rgba(245,158,11,0.6)]",
		ariaLabel: "Processing",
	},
	idle: {
		color: "bg-stone-400",
		animation: "animate-breathe",
		glowColor: "shadow-[0_0_6px_rgba(168,162,158,0.4)]",
		ariaLabel: "Idle",
	},
	error: {
		color: "bg-red-500",
		animation: "", // Static
		glowColor: "shadow-[0_0_8px_rgba(239,68,68,0.6)]",
		ariaLabel: "Error",
	},
	paused: {
		color: "bg-amber-500",
		animation: "", // Static
		glowColor: "",
		ariaLabel: "Paused",
	},
	streaming: {
		color: "bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-500",
		animation: "animate-flow",
		glowColor: "shadow-[0_0_8px_rgba(59,130,246,0.6)]",
		ariaLabel: "Streaming",
	},
};

const sizeConfig: Record<StatusDotSize, { dot: string; container: string }> = {
	xs: { dot: "h-1.5 w-1.5", container: "h-3 w-3" },
	sm: { dot: "h-2 w-2", container: "h-4 w-4" },
	md: { dot: "h-2.5 w-2.5", container: "h-5 w-5" },
	lg: { dot: "h-3 w-3", container: "h-6 w-6" },
};

// ============================================
// Component
// ============================================

/**
 * StatusDot - A living indicator for system status.
 *
 * @example
 * ```tsx
 * <StatusDot status="active" size="sm" />
 * <StatusDot status="processing" glow />
 * <StatusDot status="error" label="Connection lost" />
 * ```
 */
export const StatusDot = forwardRef<HTMLSpanElement, StatusDotProps>(
	({ status, size = "sm", glow = false, label, className, ...props }, ref) => {
		const config = statusConfig[status];
		const sizeStyles = sizeConfig[size];

		// Determine the dot style based on status
		const isDotAnimated = config.animation !== "";

		return (
			// biome-ignore lint/a11y/useSemanticElements: role="status" is appropriate for status indicator
			<span
				ref={ref}
				role="status"
				aria-label={label ?? config.ariaLabel}
				className={cn(
					"relative inline-flex items-center justify-center",
					sizeStyles.container,
					className
				)}
				{...props}
			>
				{/* Main dot */}
				<span
					className={cn(
						"rounded-full",
						sizeStyles.dot,
						config.color,
						isDotAnimated && config.animation,
						glow && config.glowColor,
						// GPU acceleration for animations
						isDotAnimated && "will-change-transform"
					)}
				/>
				{/* Processing indicator uses a partial ring instead of filled dot */}
				{status === "processing" && (
					<span
						className={cn(
							"absolute inset-0 rounded-full border-2 border-transparent border-t-amber-500",
							config.animation
						)}
					/>
				)}
			</span>
		);
	}
);

StatusDot.displayName = "StatusDot";

// ============================================
// Utility Hook
// ============================================

/**
 * Hook to determine if animations should be shown.
 * Checks prefers-reduced-motion preference.
 */
export function usePrefersReducedMotion(): boolean {
	if (typeof window === "undefined") {
		return false;
	}
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// ============================================
// Export
// ============================================

export default StatusDot;
