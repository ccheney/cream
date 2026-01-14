import type React from "react";

/**
 * Chart skeleton variant.
 */
export type SkeletonVariant =
	| "candlestick"
	| "line"
	| "area"
	| "bar"
	| "pie"
	| "sparkline"
	| "gauge"
	| "heatmap";

/**
 * Chart skeleton props.
 */
export interface ChartSkeletonProps {
	/** Skeleton variant */
	variant?: SkeletonVariant;
	/** Width in pixels */
	width?: number;
	/** Height in pixels */
	height?: number;
	/** Additional CSS classes */
	className?: string;
	/** Aria label for accessibility */
	"aria-label"?: string;
}

/**
 * Chart error props.
 */
export interface ChartErrorProps {
	/** Error object */
	error?: Error | null;
	/** Retry callback */
	onRetry?: () => void;
	/** Custom error message */
	message?: string;
	/** Show error details */
	showDetails?: boolean;
	/** Height in pixels (for layout stability) */
	height?: number;
	/** Additional CSS classes */
	className?: string;
}

/**
 * Chart empty props.
 */
export interface ChartEmptyProps {
	/** Icon (emoji or component) */
	icon?: React.ReactNode;
	/** Title text */
	title?: string;
	/** Description text */
	description?: string;
	/** Action button */
	action?: {
		label: string;
		onClick: () => void;
	};
	/** Height in pixels (for layout stability) */
	height?: number;
	/** Additional CSS classes */
	className?: string;
}

/**
 * Chart wrapper props.
 */
export interface ChartWrapperProps {
	/** Loading state */
	isLoading?: boolean;
	/** Error state */
	isError?: boolean;
	/** Empty state */
	isEmpty?: boolean;
	/** Error object */
	error?: Error | null;
	/** Retry callback */
	onRetry?: () => void;
	/** Skeleton variant */
	skeletonVariant?: SkeletonVariant;
	/** Empty state config */
	emptyConfig?: Omit<ChartEmptyProps, "height" | "className">;
	/** Height for states */
	height?: number;
	/** Children (the actual chart) */
	children: React.ReactNode;
	/** Additional CSS classes */
	className?: string;
}
