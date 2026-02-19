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

type SparklinePoint = [number, number];

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

function getDataRange(data: number[]) {
	if (data.length === 0) {
		return null;
	}

	const min = Math.min(...data);
	const max = Math.max(...data);
	return { min, range: Math.max(max - min, 1) };
}

function getLastPoint(
	data: number[],
	width: number,
	height: number,
	padding = 2,
): { x: number; y: number } | null {
	if (data.length === 0) {
		return null;
	}

	const bounds = getDataRange(data);
	if (!bounds) {
		return null;
	}

	const lastValue = data.at(-1) ?? 0;
	const x = width - padding;
	const y = height - padding - ((lastValue - bounds.min) / bounds.range) * (height - padding * 2);

	return { x, y };
}

function buildSparklinePoints(
	data: number[],
	width: number,
	height: number,
	padding = 2,
): SparklinePoint[] {
	const bounds = getDataRange(data);
	if (!bounds) {
		return [];
	}

	const xSpan = width - padding * 2;
	const ySpan = height - padding * 2;

	return data.map((value, index) => {
		const x = (index / (data.length - 1)) * xSpan + padding;
		const y = height - padding - ((value - bounds.min) / bounds.range) * ySpan;
		return [x, y];
	});
}

function buildCurveSegment(points: SparklinePoint[], index: number): string {
	const first = points[0] as SparklinePoint;
	const last = points[points.length - 1] as SparklinePoint;
	const current = points.at(index) ?? first;
	const next = points.at(index + 1) ?? last;
	const previous = points.at(index - 1) ?? first;
	const nextNext = points.at(index + 2) ?? last;

	const controlPoint1X = current[0] + (next[0] - previous[0]) / 6;
	const controlPoint1Y = current[1] + (next[1] - previous[1]) / 6;
	const controlPoint2X = next[0] - (nextNext[0] - current[0]) / 6;
	const controlPoint2Y = next[1] - (nextNext[1] - current[1]) / 6;

	return ` C ${controlPoint1X} ${controlPoint1Y}, ${controlPoint2X} ${controlPoint2Y}, ${next[0]} ${next[1]}`;
}

function buildPath(points: SparklinePoint[]): string {
	if (points.length === 0) {
		return "";
	}
	if (points.length === 1) {
		const singlePoint = points[0];
		if (!singlePoint) {
			return "";
		}

		const [x, y] = singlePoint;
		return `M 0 ${y} L ${x * 2} ${y}`;
	}

	const firstPoint = points[0];
	if (!firstPoint) {
		return "";
	}

	const [startX, startY] = firstPoint;
	const segments = points
		.slice(0, points.length - 1)
		.map((_, index) => buildCurveSegment(points, index))
		.join("");

	return `M ${startX} ${startY}${segments}`;
}

function getTrendColor(data: number[]): SparklineColor {
	if (data.length < 2) {
		return "neutral";
	}
	const first = data[0] ?? 0;
	const last = data.at(-1) ?? 0;
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

	const points = buildSparklinePoints(data, width, height, padding);
	return buildPath(points);
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
		[data, width, height, showLastPoint],
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
			aria-label={`Sparkline showing trend from ${data[0]} to ${data.at(-1)}`}
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
