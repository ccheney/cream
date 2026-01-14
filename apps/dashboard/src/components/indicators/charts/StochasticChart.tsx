"use client";

/**
 * Stochastic Chart Component
 *
 * Displays Stochastic %K and %D with overbought/oversold bands.
 * Default bands at 80 (overbought) and 20 (oversold).
 *
 * @see docs/plans/ui/26-data-viz.md
 */

import { memo } from "react";

import { IndicatorChart, type IndicatorDataPoint, type ReferenceLine } from "./IndicatorChart";

// ============================================
// Types
// ============================================

export interface StochasticChartProps {
	/** %K data points */
	kData: IndicatorDataPoint[];

	/** %D data points */
	dData: IndicatorDataPoint[];

	/** Overbought level (default: 80) */
	overboughtLevel?: number;

	/** Oversold level (default: 20) */
	oversoldLevel?: number;

	/** Chart height in pixels */
	height?: number;

	/** Additional CSS class */
	className?: string;
}

// ============================================
// Constants
// ============================================

const K_COLOR = "#3B82F6"; // Blue
const D_COLOR = "#EF4444"; // Red
const OVERBOUGHT_COLOR = "rgba(239, 68, 68, 0.3)";
const OVERSOLD_COLOR = "rgba(34, 197, 94, 0.3)";

// ============================================
// Component
// ============================================

function StochasticChartComponent({
	kData,
	dData,
	overboughtLevel = 80,
	oversoldLevel = 20,
	height = 150,
	className = "",
}: StochasticChartProps) {
	const referenceLines: ReferenceLine[] = [
		{
			value: overboughtLevel,
			color: OVERBOUGHT_COLOR,
			lineWidth: 1,
			title: `${overboughtLevel}`,
		},
		{
			value: oversoldLevel,
			color: OVERSOLD_COLOR,
			lineWidth: 1,
			title: `${oversoldLevel}`,
		},
	];

	return (
		<IndicatorChart
			data={kData}
			type="line"
			color={K_COLOR}
			secondaryData={dData}
			secondaryColor={D_COLOR}
			title="Stochastic (14, 3, 3)"
			referenceLines={referenceLines}
			height={height}
			minValue={0}
			maxValue={100}
			className={className}
		/>
	);
}

export const StochasticChart = memo(StochasticChartComponent);

export default StochasticChart;
