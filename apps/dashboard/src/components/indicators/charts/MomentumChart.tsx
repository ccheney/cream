"use client";

/**
 * Momentum Chart Component
 *
 * Displays price momentum as a line chart.
 * Shows 1M, 3M, 6M, and 12M momentum values.
 *
 * @see docs/plans/ui/26-data-viz.md
 */

import { memo } from "react";

import { IndicatorChart, type IndicatorDataPoint, type ReferenceLine } from "./IndicatorChart";

// ============================================
// Types
// ============================================

export interface MomentumChartProps {
	/** Momentum data points */
	data: IndicatorDataPoint[];

	/** Period label (e.g., "1M", "3M") */
	period?: string;

	/** Chart height in pixels */
	height?: number;

	/** Additional CSS class */
	className?: string;
}

// ============================================
// Constants
// ============================================

const MOMENTUM_COLOR = "#10B981"; // Emerald
const ZERO_LINE_COLOR = "rgba(120, 113, 108, 0.3)";

// ============================================
// Component
// ============================================

function MomentumChartComponent({
	data,
	period = "12M",
	height = 120,
	className = "",
}: MomentumChartProps) {
	const referenceLines: ReferenceLine[] = [
		{
			value: 0,
			color: ZERO_LINE_COLOR,
			lineWidth: 1,
		},
	];

	return (
		<IndicatorChart
			data={data}
			type="line"
			color={MOMENTUM_COLOR}
			title={`Momentum (${period})`}
			referenceLines={referenceLines}
			height={height}
			className={className}
		/>
	);
}

export const MomentumChart = memo(MomentumChartComponent);

export default MomentumChart;
