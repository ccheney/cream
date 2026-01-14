/**
 * Sparkline Component
 *
 * Lightweight inline trend visualization for tables and cards.
 *
 * @see docs/plans/ui/26-data-viz.md lines 129-135
 */

"use client";

import { memo, useMemo } from "react";
import { CHART_COLORS } from "@/lib/chart-config";

export type SparklineColor = "profit" | "loss" | "primary" | "neutral";

export interface SparklineProps {
	/** Array of numeric values */
	data: number[];

	/** Width in pixels (default: 80) */
	width?: number;

	/** Height in pixels (default: 24) */
	height?: number;

	/** Line color (default: based on trend) */
	color?: SparklineColor | string;

	/** Show dot on last value (default: true) */
	showLastPoint?: boolean;

	/** Stroke width (default: 1.5) */
	strokeWidth?: number;

	/** Additional CSS class */
	className?: string;

	/** Auto-detect color based on trend */
	autoColor?: boolean;
}

function getColor(color: SparklineColor | string): string {
	switch (color) {
		case "profit":
			return CHART_COLORS.profit;
		case "loss":
			return CHART_COLORS.loss;
		case "primary":
			return CHART_COLORS.primary;
		case "neutral":
			return CHART_COLORS.text;
		default:
			return color;
	}
}

function getTrendColor(data: number[]): SparklineColor {
	if (data.length < 2) {
		return "neutral";
	}
	const first = data[0] ?? 0;
	const last = data[data.length - 1] ?? 0;
	if (last > first) {
		return "profit";
	}
	if (last < first) {
		return "loss";
	}
	return "neutral";
}

function generatePath(data: number[], width: number, height: number, padding = 2): string {
	if (data.length === 0) {
		return "";
	}
	if (data.length === 1) {
		// Single point: draw horizontal line
		const y = height / 2;
		return `M 0 ${y} L ${width} ${y}`;
	}

	const min = Math.min(...data);
	const max = Math.max(...data);
	const range = max - min || 1;

	const points: [number, number][] = data.map((value, index) => {
		const x = (index / (data.length - 1)) * (width - padding * 2) + padding;
		const y = height - padding - ((value - min) / range) * (height - padding * 2);
		return [x, y];
	});

	let path = `M ${points[0]?.[0] ?? 0} ${points[0]?.[1] ?? 0}`;

	for (let i = 0; i < points.length - 1; i++) {
		const p0 = points[Math.max(0, i - 1)];
		const p1 = points[i];
		const p2 = points[i + 1];
		const p3 = points[Math.min(points.length - 1, i + 2)];

		// Catmull-Rom to Bezier conversion
		const cp1x = (p1?.[0] ?? 0) + ((p2?.[0] ?? 0) - (p0?.[0] ?? 0)) / 6;
		const cp1y = (p1?.[1] ?? 0) + ((p2?.[1] ?? 0) - (p0?.[1] ?? 0)) / 6;
		const cp2x = (p2?.[0] ?? 0) - ((p3?.[0] ?? 0) - (p1?.[0] ?? 0)) / 6;
		const cp2y = (p2?.[1] ?? 0) - ((p3?.[1] ?? 0) - (p1?.[1] ?? 0)) / 6;

		path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2?.[0] ?? 0} ${p2?.[1] ?? 0}`;
	}

	return path;
}

function getLastPoint(
	data: number[],
	width: number,
	height: number,
	padding = 2
): { x: number; y: number } | null {
	if (data.length === 0) {
		return null;
	}

	const min = Math.min(...data);
	const max = Math.max(...data);
	const range = max - min || 1;

	const lastValue = data[data.length - 1] ?? 0;
	const x = width - padding;
	const y = height - padding - ((lastValue - min) / range) * (height - padding * 2);

	return { x, y };
}

function SparklineComponent({
	data,
	width = 80,
	height = 24,
	color,
	showLastPoint = true,
	strokeWidth = 1.5,
	className,
	autoColor = true,
}: SparklineProps) {
	const path = useMemo(() => generatePath(data, width, height), [data, width, height]);

	const lastPoint = useMemo(
		() => (showLastPoint ? getLastPoint(data, width, height) : null),
		[data, width, height, showLastPoint]
	);

	const resolvedColor = useMemo(() => {
		if (color) {
			return getColor(color);
		}
		if (autoColor) {
			return getColor(getTrendColor(data));
		}
		return CHART_COLORS.text;
	}, [color, autoColor, data]);

	if (data.length === 0) {
		return (
			<svg width={width} height={height} className={className} role="img" aria-label="No data">
				<line
					x1={0}
					y1={height / 2}
					x2={width}
					y2={height / 2}
					stroke={CHART_COLORS.grid}
					strokeWidth={1}
					strokeDasharray="4 2"
				/>
			</svg>
		);
	}

	return (
		<svg
			width={width}
			height={height}
			className={className}
			role="img"
			aria-label={`Sparkline showing trend from ${data[0]} to ${data[data.length - 1]}`}
		>
			<path
				d={path}
				fill="none"
				stroke={resolvedColor}
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>

			{lastPoint && <circle cx={lastPoint.x} cy={lastPoint.y} r={4} fill={resolvedColor} />}
		</svg>
	);
}

export const Sparkline = memo(SparklineComponent);

export default Sparkline;

export { getColor, getTrendColor, generatePath, getLastPoint };
