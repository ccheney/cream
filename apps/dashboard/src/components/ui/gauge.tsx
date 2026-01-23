/**
 * Gauge Component
 *
 * Semi-circular gauge for single-metric visualization.
 * Used for RSI, Stochastic, and other bounded indicators.
 *
 * @see docs/plans/ui/26-data-viz.md Gauges section (lines 152-162)
 */

"use client";

import { memo, useMemo } from "react";

// ============================================
// Types
// ============================================

export type GaugeVariant = "default" | "rsi" | "stochastic" | "percentb";

export interface GaugeZone {
	/** Start value for this zone (inclusive) */
	start: number;
	/** End value for this zone (exclusive) */
	end: number;
	/** Color class for this zone */
	color: string;
	/** Optional label for the zone */
	label?: string;
}

export interface GaugeProps {
	/** Current value */
	value: number | null;
	/** Minimum value (default: 0) */
	min?: number;
	/** Maximum value (default: 100) */
	max?: number;
	/** Label shown below the value */
	label?: string;
	/** Size of the gauge in pixels */
	size?: number;
	/** Stroke width of the arc */
	strokeWidth?: number;
	/** Variant with predefined zones */
	variant?: GaugeVariant;
	/** Custom zones (overrides variant) */
	zones?: GaugeZone[];
	/** Number of decimal places for value display */
	decimals?: number;
	/** Unit suffix (e.g., "%" or "d") */
	unit?: string;
	/** Additional CSS classes */
	className?: string;
	/** Test ID for testing */
	"data-testid"?: string;
}

// ============================================
// Constants
// ============================================

const DEFAULT_SIZE = 80;
const DEFAULT_STROKE_WIDTH = 8;

// Arc angles: -120° to +120° (240° total sweep)
const START_ANGLE = -120;
const END_ANGLE = 120;
const SWEEP_ANGLE = END_ANGLE - START_ANGLE;

// Predefined zone configurations
const ZONE_PRESETS: Record<GaugeVariant, GaugeZone[]> = {
	default: [
		{ start: 0, end: 100, color: "#78716C", label: "Normal" }, // stone-500
	],
	rsi: [
		{ start: 0, end: 30, color: "#22C55E", label: "Oversold" }, // green-500
		{ start: 30, end: 70, color: "#78716C", label: "Neutral" }, // stone-500
		{ start: 70, end: 100, color: "#EF4444", label: "Overbought" }, // red-500
	],
	stochastic: [
		{ start: 0, end: 20, color: "#22C55E", label: "Oversold" }, // green-500
		{ start: 20, end: 80, color: "#78716C", label: "Neutral" }, // stone-500
		{ start: 80, end: 100, color: "#EF4444", label: "Overbought" }, // red-500
	],
	percentb: [
		{ start: 0, end: 0.2, color: "#22C55E", label: "Below" }, // green-500
		{ start: 0.2, end: 0.8, color: "#78716C", label: "Within" }, // stone-500
		{ start: 0.8, end: 1, color: "#EF4444", label: "Above" }, // red-500
	],
};

// ============================================
// Utility Functions
// ============================================

/**
 * Convert value to angle on the gauge arc
 */
function valueToAngle(value: number, min: number, max: number): number {
	const normalizedValue = Math.max(min, Math.min(max, value));
	const percentage = (normalizedValue - min) / (max - min);
	return START_ANGLE + percentage * SWEEP_ANGLE;
}

/**
 * Convert polar coordinates to cartesian (SVG coordinates)
 */
function polarToCartesian(
	centerX: number,
	centerY: number,
	radius: number,
	angleInDegrees: number,
): { x: number; y: number } {
	const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
	return {
		x: centerX + radius * Math.cos(angleInRadians),
		y: centerY + radius * Math.sin(angleInRadians),
	};
}

/**
 * Generate SVG arc path
 */
function describeArc(
	centerX: number,
	centerY: number,
	radius: number,
	startAngle: number,
	endAngle: number,
): string {
	const start = polarToCartesian(centerX, centerY, radius, endAngle);
	const end = polarToCartesian(centerX, centerY, radius, startAngle);
	const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

	return ["M", start.x, start.y, "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y].join(" ");
}

/**
 * Get color for value based on zones
 */
function getColorForValue(value: number, zones: GaugeZone[]): string {
	for (const zone of zones) {
		if (value >= zone.start && value < zone.end) {
			return zone.color;
		}
	}
	// Handle edge case for max value
	const lastZone = zones[zones.length - 1];
	if (lastZone && value >= lastZone.start) {
		return lastZone.color;
	}
	return "#78716C"; // Default stone-500
}

// ============================================
// Component
// ============================================

/**
 * Gauge displays a semi-circular meter for bounded indicators.
 *
 * Features:
 * - Configurable min/max range
 * - Zone-based coloring (e.g., RSI overbought/oversold)
 * - Smooth arc rendering
 * - Accessible with ARIA labels
 *
 * @example
 * ```tsx
 * // RSI gauge
 * <Gauge value={65} variant="rsi" label="RSI(14)" />
 *
 * // Stochastic gauge
 * <Gauge value={25} variant="stochastic" label="%K" />
 *
 * // Custom range gauge
 * <Gauge value={0.75} min={0} max={1} variant="percentb" label="%B" />
 * ```
 */
export const Gauge = memo(function Gauge({
	value,
	min = 0,
	max = 100,
	label,
	size = DEFAULT_SIZE,
	strokeWidth = DEFAULT_STROKE_WIDTH,
	variant = "default",
	zones,
	decimals = 1,
	unit = "",
	className = "",
	"data-testid": testId,
}: GaugeProps) {
	// Use custom zones or preset
	const activeZones = zones ?? ZONE_PRESETS[variant];

	// Calculate SVG dimensions
	const viewBoxSize = size;
	const center = viewBoxSize / 2;
	const radius = (viewBoxSize - strokeWidth * 2) / 2;

	// Calculate value angle and color
	const { valueAngle, valueColor } = useMemo(() => {
		if (value === null) {
			return { valueAngle: START_ANGLE, valueColor: "#A8A29E" }; // stone-400
		}
		return {
			valueAngle: valueToAngle(value, min, max),
			valueColor: getColorForValue(value, activeZones),
		};
	}, [value, min, max, activeZones]);

	// Generate arc paths
	const backgroundArc = useMemo(
		() => describeArc(center, center, radius, START_ANGLE, END_ANGLE),
		[center, radius],
	);

	const valueArc = useMemo(() => {
		if (value === null || valueAngle <= START_ANGLE) {
			return "";
		}
		return describeArc(center, center, radius, START_ANGLE, valueAngle);
	}, [center, radius, value, valueAngle]);

	// Format display value
	const displayValue = value !== null ? value.toFixed(decimals) : "—";

	// ARIA label
	const ariaLabel = label
		? `${label}: ${displayValue}${unit}`
		: `Gauge value: ${displayValue}${unit}`;

	return (
		<div className={`inline-flex flex-col items-center ${className}`} data-testid={testId}>
			<svg
				width={size}
				height={size * 0.65} // Crop bottom portion
				viewBox={`0 0 ${viewBoxSize} ${viewBoxSize * 0.75}`}
				role="meter"
				aria-label={ariaLabel}
				aria-valuenow={value ?? undefined}
				aria-valuemin={min}
				aria-valuemax={max}
			>
				{/* Background track */}
				<path
					d={backgroundArc}
					fill="none"
					stroke="#D6D3D1" // stone-300
					strokeWidth={strokeWidth}
					strokeLinecap="round"
					className="dark:stroke-stone-700"
				/>

				{/* Value arc */}
				{valueArc && (
					<path
						d={valueArc}
						fill="none"
						stroke={valueColor}
						strokeWidth={strokeWidth}
						strokeLinecap="round"
						style={{
							transition: "stroke-dashoffset 0.3s ease-out",
						}}
					/>
				)}

				{/* Center value display */}
				<text
					x={center}
					y={center + 2}
					textAnchor="middle"
					dominantBaseline="middle"
					className="fill-stone-900 dark:fill-stone-100 font-mono text-sm font-semibold"
					style={{ fontSize: size * 0.18 }}
				>
					{displayValue}
					{unit && (
						<tspan className="fill-stone-500 dark:fill-stone-400" style={{ fontSize: size * 0.12 }}>
							{unit}
						</tspan>
					)}
				</text>
			</svg>

			{/* Label */}
			{label && (
				<span className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 font-medium">
					{label}
				</span>
			)}
		</div>
	);
});

// ============================================
// Convenience Components
// ============================================

/**
 * RSIGauge - Pre-configured gauge for RSI indicator
 */
export const RSIGauge = memo(function RSIGauge(props: Omit<GaugeProps, "variant" | "min" | "max">) {
	return <Gauge {...props} variant="rsi" min={0} max={100} />;
});

/**
 * StochasticGauge - Pre-configured gauge for Stochastic %K/%D
 */
export const StochasticGauge = memo(function StochasticGauge(
	props: Omit<GaugeProps, "variant" | "min" | "max">,
) {
	return <Gauge {...props} variant="stochastic" min={0} max={100} />;
});

/**
 * PercentBGauge - Pre-configured gauge for Bollinger %B
 */
export const PercentBGauge = memo(function PercentBGauge(
	props: Omit<GaugeProps, "variant" | "min" | "max" | "decimals">,
) {
	return <Gauge {...props} variant="percentb" min={0} max={1} decimals={2} />;
});

// ============================================
// Exports
// ============================================

export default Gauge;
