/**
 * Sparkline Component
 *
 * A compact SVG-based mini chart showing recent price history.
 * Used in PriceTicker and other components for quick trend visualization.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 5.1
 */

"use client";

import { memo, useMemo } from "react";

// ============================================
// Types
// ============================================

export interface SparklineProps {
	/** Array of price values (most recent last) */
	data: number[];
	/** Width of the sparkline in pixels */
	width?: number;
	/** Height of the sparkline in pixels */
	height?: number;
	/** Whether to show gradient fill under the line */
	showFill?: boolean;
	/** Line stroke width */
	strokeWidth?: number;
	/** Custom CSS class */
	className?: string;
	/** Test ID for testing */
	"data-testid"?: string;
}

// ============================================
// Constants
// ============================================

const DEFAULT_WIDTH = 60;
const DEFAULT_HEIGHT = 20;
const DEFAULT_STROKE_WIDTH = 1.5;
const PADDING = 2; // Padding inside SVG

// ============================================
// Utility Functions
// ============================================

/**
 * Generate SVG path data from price values
 */
function generatePathData(
	data: number[],
	width: number,
	height: number,
	padding: number,
): { linePath: string; fillPath: string } {
	if (data.length < 2) {
		return { linePath: "", fillPath: "" };
	}

	const innerWidth = width - padding * 2;
	const innerHeight = height - padding * 2;
	const min = Math.min(...data);
	const max = Math.max(...data);
	const range = max - min || 1;
	const points = data.map((value, index) => {
		const x = padding + (index / (data.length - 1)) * innerWidth;
		const y = padding + innerHeight - ((value - min) / range) * innerHeight;
		return { x, y };
	});

	const linePath = points
		.map((point, i) => `${i === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
		.join(" ");

	const fillPath = `${linePath} L ${points.at(-1)?.x.toFixed(2)} ${height - padding} L ${padding} ${
		height - padding
	} Z`;
	return { linePath, fillPath };
}

function getTrendState(data: number[]) {
	const isPositive = data.length >= 2 ? (data.at(-1) ?? 0) >= (data[0] ?? 0) : true;
	return {
		isPositive,
		strokeColor: isPositive ? "#22c55e" : "#ef4444",
		gradientId: `sparkline-gradient-${isPositive ? "positive" : "negative"}`,
	};
}

function createAriaLabel(data: number[], isPositive: boolean): string {
	if (data.length < 2) {
		return "No price data available";
	}
	const lastVal = data.at(-1) ?? 0;
	const firstVal = data[0] ?? 1;
	const percentChange = ((lastVal - firstVal) / firstVal) * 100;
	return `Price trend: ${isPositive ? "up" : "down"} ${Math.abs(percentChange).toFixed(1)}% over ${
		data.length
	} points`;
}

// ============================================
// Component
// ============================================

/**
 * Sparkline displays a compact SVG line chart.
 *
 * Features:
 * - Auto-scales to fit data
 * - Gradient fill based on trend direction
 * - Smooth SVG rendering
 * - Accessible with ARIA labels
 *
 * @example
 * ```tsx
 * <Sparkline
 *   data={[100, 102, 101, 103, 105, 104, 106]}
 *   width={60}
 *   height={20}
 * />
 * ```
 */
export const Sparkline = memo(function Sparkline({
	data,
	width = DEFAULT_WIDTH,
	height = DEFAULT_HEIGHT,
	showFill = true,
	strokeWidth = DEFAULT_STROKE_WIDTH,
	className = "",
	"data-testid": testId,
}: SparklineProps) {
	const { isPositive, strokeColor, gradientId } = useMemo(() => getTrendState(data), [data]);
	const { linePath, fillPath } = useMemo(
		() => generatePathData(data, width, height, PADDING),
		[data, width, height],
	);
	const ariaLabel = useMemo(() => createAriaLabel(data, isPositive), [data, isPositive]);

	if (data.length < 2) {
		return (
			<svg
				width={width}
				height={height}
				className={`sparkline ${className}`}
				data-testid={testId}
				role="img"
				aria-label="No price data available"
			>
				<line
					x1={PADDING}
					y1={height / 2}
					x2={width - PADDING}
					y2={height / 2}
					stroke="#9ca3af"
					strokeWidth={strokeWidth}
					strokeDasharray="2,2"
				/>
			</svg>
		);
	}

	return (
		<svg
			width={width}
			height={height}
			className={`sparkline ${className}`}
			data-testid={testId}
			role="img"
			aria-label={ariaLabel}
		>
			<defs>
				<linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
					<stop offset="0%" stopColor={strokeColor} stopOpacity={0.3} />
					<stop offset="100%" stopColor={strokeColor} stopOpacity={0.05} />
				</linearGradient>
			</defs>

			{showFill && fillPath && <path d={fillPath} fill={`url(#${gradientId})`} />}

			{linePath && (
				<path
					d={linePath}
					fill="none"
					stroke={strokeColor}
					strokeWidth={strokeWidth}
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			)}
		</svg>
	);
});

// ============================================
// Exports
// ============================================

export default Sparkline;
