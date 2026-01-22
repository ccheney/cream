/**
 * IndicatorValue Component
 *
 * Displays a single indicator value with label, formatting, and status coloring.
 * Follows the "Precision Warmth" design system.
 *
 * Supports two coloring modes:
 * 1. `status` - Discrete states (positive, negative, neutral, warning, critical)
 * 2. `signal` - Continuous gradient from bearish (-1) to bullish (+1)
 *
 * @see docs/plans/ui/20-design-philosophy.md
 */

import { cn } from "@/lib/utils";

export interface IndicatorValueProps {
	label: string;
	value: number | string | null | undefined;
	format?: "number" | "percent" | "currency" | "ratio" | "days";
	decimals?: number;
	/** Discrete status coloring (takes precedence over signal) */
	status?: "positive" | "negative" | "neutral" | "warning" | "critical";
	/** Continuous signal from -1 (bearish/red) through 0 (neutral/amber) to +1 (bullish/green) */
	signal?: number;
	tooltip?: string;
	size?: "sm" | "md" | "lg";
	className?: string;
}

function formatValue(
	value: number | string | null | undefined,
	format: IndicatorValueProps["format"] = "number",
	decimals = 2,
): string {
	if (value === null || value === undefined) {
		return "--";
	}

	if (typeof value === "string") {
		return value;
	}

	switch (format) {
		case "percent":
			return `${(value * 100).toFixed(decimals)}%`;
		case "currency":
			return new Intl.NumberFormat("en-US", {
				style: "currency",
				currency: "USD",
				minimumFractionDigits: decimals,
				maximumFractionDigits: decimals,
			}).format(value);
		case "ratio":
			return `${value.toFixed(decimals)}x`;
		case "days":
			return `${value.toFixed(0)}d`;
		default:
			return value.toFixed(decimals);
	}
}

const sizeClasses = {
	sm: {
		label: "text-xs",
		value: "text-sm",
	},
	md: {
		label: "text-xs",
		value: "text-base",
	},
	lg: {
		label: "text-sm",
		value: "text-lg",
	},
};

const statusClasses = {
	positive: "text-profit dark:text-profit",
	negative: "text-loss dark:text-loss",
	neutral: "text-neutral dark:text-neutral",
	warning: "text-amber-500 dark:text-amber-400",
	critical: "text-red-600 dark:text-red-500",
};

/**
 * Interpolates between bearish (red) → neutral (amber) → bullish (green) based on signal.
 * Uses HSL color space for smooth transitions.
 *
 * Signal values:
 *   -1.0 = Full bearish (red, hue ~0)
 *    0.0 = Neutral (amber, hue ~35)
 *   +1.0 = Full bullish (green, hue ~142)
 *
 * Returns CSS color string.
 */
function getSignalColor(signal: number): string {
	// Clamp signal to [-1, 1]
	const s = Math.max(-1, Math.min(1, signal));

	// Color stops in HSL (using design system colors)
	// Loss (bearish): hsl(0, 84%, 60%) - #EF4444
	// Neutral: hsl(38, 92%, 50%) - #F59E0B
	// Profit (bullish): hsl(142, 71%, 45%) - #22C55E

	let hue: number;
	let saturation: number;
	let lightness: number;

	if (s <= 0) {
		// Interpolate from loss (red) to neutral (amber)
		const t = s + 1; // 0 to 1 as s goes from -1 to 0
		hue = 0 + t * 38; // 0 → 38
		saturation = 84 + t * (92 - 84); // 84 → 92
		lightness = 60 + t * (50 - 60); // 60 → 50
	} else {
		// Interpolate from neutral (amber) to profit (green)
		const t = s; // 0 to 1 as s goes from 0 to 1
		hue = 38 + t * (142 - 38); // 38 → 142
		saturation = 92 + t * (71 - 92); // 92 → 71
		lightness = 50 + t * (45 - 50); // 50 → 45
	}

	return `hsl(${hue.toFixed(0)}, ${saturation.toFixed(0)}%, ${lightness.toFixed(0)}%)`;
}

export function IndicatorValue({
	label,
	value,
	format = "number",
	decimals = 2,
	status,
	signal,
	tooltip,
	size = "md",
	className,
}: IndicatorValueProps) {
	const formattedValue = formatValue(value, format, decimals);
	const isNull = value === null || value === undefined;

	// Determine text color: status takes precedence, then signal, then default
	const hasSignal = signal !== undefined && !isNull;
	const signalStyle = hasSignal ? { color: getSignalColor(signal) } : undefined;

	return (
		<div className={cn("flex flex-col gap-0.5", className)} title={tooltip}>
			<span
				className={cn(
					"uppercase tracking-wide text-stone-400 dark:text-night-400",
					sizeClasses[size].label,
				)}
			>
				{label}
			</span>
			<span
				className={cn(
					"font-mono font-medium tabular-nums",
					sizeClasses[size].value,
					isNull && "text-stone-300 dark:text-night-600",
					!isNull && status && statusClasses[status],
					!isNull && !status && !hasSignal && "text-stone-700 dark:text-night-200",
				)}
				style={!status ? signalStyle : undefined}
			>
				{formattedValue}
			</span>
		</div>
	);
}

export default IndicatorValue;
