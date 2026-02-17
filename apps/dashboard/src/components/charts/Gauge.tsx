/**
 * Semi-Circular Gauge Component
 *
 * Risk utilization gauge with color-coded thresholds.
 *
 * @see docs/plans/ui/26-data-viz.md lines 153-159
 */

"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { CHART_COLORS } from "@/lib/chart-config";

// ============================================
// Types
// ============================================

export interface GaugeThresholds {
	/** Comfortable threshold (0-60%) */
	comfortable: number;
	/** Warning threshold (60-80%) */
	warning: number;
	/** Critical threshold (80-100%) */
	critical: number;
}

export interface GaugeProps {
	/** Value (0-100) */
	value: number;
	/** Maximum value (default: 100) */
	max?: number;
	/** Label text below value */
	label?: string;
	/** Custom thresholds */
	thresholds?: GaugeThresholds;
	/** Diameter in pixels (default: 120) */
	size?: number;
	/** Show numeric value (default: true) */
	showValue?: boolean;
	/** Animate on mount and value change (default: true) */
	animate?: boolean;
	/** Animation duration in ms (default: 500) */
	animationDuration?: number;
	/** Additional CSS class */
	className?: string;
}

// ============================================
// Constants
// ============================================

/**
 * Default thresholds.
 */
export const DEFAULT_THRESHOLDS: GaugeThresholds = {
	comfortable: 60,
	warning: 80,
	critical: 100,
};

/**
 * Gauge colors.
 */
export const GAUGE_COLORS = {
	/** Track background */
	track: "#E7E5E4", // cream-300
	/** Comfortable zone (0-60%) */
	comfortable: "#78716C", // stone-400
	/** Warning zone (60-80%) */
	warning: "#D97706", // amber/primary
	/** Critical zone (80-100%) */
	critical: "#EF4444", // red/loss
} as const;

// ============================================
// Geometry Helpers
// ============================================

function degreesToRadians(degrees: number): number {
	return (degrees * Math.PI) / 180;
}

function polarToCartesian(cx: number, cy: number, radius: number, degrees: number) {
	const radians = degreesToRadians(degrees);
	return {
		x: cx + radius * Math.cos(radians),
		y: cy + radius * Math.sin(radians),
	};
}

function describeArc(
	cx: number,
	cy: number,
	radius: number,
	startAngle: number,
	endAngle: number,
): string {
	const start = polarToCartesian(cx, cy, radius, endAngle);
	const end = polarToCartesian(cx, cy, radius, startAngle);
	const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
	return ["M", start.x, start.y, "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y].join(" ");
}

function valueToAngle(value: number, max: number): number {
	const percentage = Math.min(Math.max(value / max, 0), 1);
	return -120 + percentage * 240;
}

export function getGaugeColor(value: number, thresholds: GaugeThresholds): string {
	if (value < thresholds.comfortable) {
		return GAUGE_COLORS.comfortable;
	}
	if (value < thresholds.warning) {
		return GAUGE_COLORS.warning;
	}
	return GAUGE_COLORS.critical;
}

interface GaugeGeometry {
	cx: number;
	cy: number;
	radius: number;
	startAngle: number;
	endAngle: number;
	trackPath: string;
	trackStrokeWidth: number;
	valueStrokeWidth: number;
}

function buildGeometry(size: number): GaugeGeometry {
	const trackStrokeWidth = size * 0.08;
	const valueStrokeWidth = size * 0.1;
	const radius = (size - valueStrokeWidth) / 2;
	const cx = size / 2;
	const cy = size / 2;
	const startAngle = -120;
	const endAngle = 120;
	return {
		cx,
		cy,
		radius,
		startAngle,
		endAngle,
		trackPath: describeArc(cx, cy, radius, startAngle, endAngle),
		trackStrokeWidth,
		valueStrokeWidth,
	};
}

function useAnimatedGaugeValue({
	value,
	max,
	animate,
	animationDuration,
}: Pick<GaugeProps, "value" | "max" | "animate" | "animationDuration">) {
	const [displayValue, setDisplayValue] = useState(animate ? 0 : value);
	const animationRef = useRef<number | null>(null);

	useEffect(() => {
		if (!animate) {
			setDisplayValue(value);
			return;
		}

		const startValue = displayValue;
		const endValue = Math.min(Math.max(value, 0), max ?? 100);
		const startTime = performance.now();
		const tick = (currentTime: number) => {
			const elapsed = currentTime - startTime;
			const progress = Math.min(elapsed / (animationDuration ?? 500), 1);
			const eased = 1 - (1 - progress) ** 3;
			const currentValue = startValue + (endValue - startValue) * eased;
			setDisplayValue(currentValue);

			if (progress < 1) {
				animationRef.current = requestAnimationFrame(tick);
			}
		};

		animationRef.current = requestAnimationFrame(tick);

		return () => {
			if (animationRef.current) {
				cancelAnimationFrame(animationRef.current);
			}
		};
	}, [value, max, animate, animationDuration, displayValue]);

	return displayValue;
}

interface GaugeValueTextProps {
	valuePercent: number;
	showValue: boolean;
	size: number;
}

function GaugeValueText({ valuePercent, showValue, size }: GaugeValueTextProps) {
	if (!showValue) {
		return null;
	}

	const x = size / 2;
	const y = size * 0.55;

	return (
		<text
			x={x}
			y={y}
			textAnchor="middle"
			dominantBaseline="middle"
			fill={CHART_COLORS.text}
			fontSize={size * 0.2}
			fontFamily="Geist Mono, monospace"
			fontWeight="600"
		>
			{`${Math.round(valuePercent)}%`}
		</text>
	);
}

function GaugeComponent({
	value,
	max = 100,
	label,
	thresholds = DEFAULT_THRESHOLDS,
	size = 120,
	showValue = true,
	animate = true,
	animationDuration = 500,
	className,
}: GaugeProps) {
	const displayValue = useAnimatedGaugeValue({ value, max, animate, animationDuration });
	const { cx, cy, radius, startAngle, trackPath, trackStrokeWidth, valueStrokeWidth } =
		buildGeometry(size);
	const valueAngle = valueToAngle(displayValue, max);
	const valuePath = useMemo(
		() => describeArc(cx, cy, radius, startAngle, valueAngle),
		[cx, cy, radius, startAngle, valueAngle],
	);
	const displayPercent = (displayValue / max) * 100;

	return (
		<div className={className} style={{ width: size, height: size * 0.65 }}>
			<svg
				width={size}
				height={size * 0.65}
				viewBox={`0 0 ${size} ${size * 0.65}`}
				role="img"
				aria-label={`Gauge showing ${Math.round(displayPercent)}%${label ? ` - ${label}` : ""}`}
			>
				<path
					d={trackPath}
					fill="none"
					stroke={GAUGE_COLORS.track}
					strokeWidth={trackStrokeWidth}
					strokeLinecap="round"
				/>
				{displayValue > 0 && (
					<path
						d={valuePath}
						fill="none"
						stroke={getGaugeColor(displayPercent, thresholds)}
						strokeWidth={valueStrokeWidth}
						strokeLinecap="round"
					/>
				)}

				<GaugeValueText valuePercent={displayPercent} showValue={showValue} size={size} />

				{label && (
					<text
						x={cx}
						y={size * 0.62}
						textAnchor="middle"
						dominantBaseline="hanging"
						fill={CHART_COLORS.text}
						fontSize={size * 0.1}
						fontFamily="Geist Mono, monospace"
					>
						{label}
					</text>
				)}
			</svg>
		</div>
	);
}

export const Gauge = memo(GaugeComponent);

export default Gauge;
