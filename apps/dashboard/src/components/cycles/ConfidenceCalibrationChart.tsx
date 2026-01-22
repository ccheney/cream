"use client";

/**
 * ConfidenceCalibrationChart Component
 *
 * Bar chart showing confidence bins vs execution rates to assess
 * whether high confidence decisions actually perform better.
 */

import { memo } from "react";
import type { ConfidenceCalibrationBin } from "@/lib/api/types";

// ============================================
// Types
// ============================================

export interface ConfidenceCalibrationChartProps {
	data?: ConfidenceCalibrationBin[];
	isLoading?: boolean;
}

// ============================================
// Constants
// ============================================

const BIN_ORDER = ["0-20", "20-40", "40-60", "60-80", "80-100"];

// ============================================
// Skeleton Component
// ============================================

function ConfidenceCalibrationChartSkeleton() {
	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-5">
			<div className="h-4 w-48 bg-cream-100 dark:bg-night-700 rounded animate-pulse mb-4" />
			<div className="flex items-end justify-between h-40 gap-2">
				{BIN_ORDER.map((bin) => (
					<div key={bin} className="flex-1 flex flex-col items-center gap-2">
						<div
							className="w-full bg-cream-100 dark:bg-night-700 rounded-t animate-pulse"
							style={{ height: `${Math.random() * 60 + 20}%` }}
						/>
						<div className="h-3 w-8 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
					</div>
				))}
			</div>
		</div>
	);
}

// ============================================
// Bar Component
// ============================================

interface CalibrationBarProps {
	bin: string;
	executionRate: number;
	total: number;
	executed: number;
	maxRate: number;
}

const CalibrationBar = memo(function CalibrationBar({
	bin,
	executionRate,
	total,
	executed,
	maxRate,
}: CalibrationBarProps) {
	const normalizedHeight = maxRate > 0 ? (executionRate / maxRate) * 100 : 0;

	const getBarColor = (rate: number) => {
		if (rate >= 70) {
			return "bg-green-500";
		}
		if (rate >= 40) {
			return "bg-amber-500";
		}
		return "bg-red-500";
	};

	return (
		<div
			className="flex-1 flex flex-col items-center gap-1"
			title={`${bin}%: ${executed}/${total} executed`}
		>
			<div className="relative w-full h-32 flex items-end justify-center">
				<div
					className={`w-full max-w-8 ${getBarColor(executionRate)} rounded-t transition-all duration-300`}
					style={{ height: `${Math.max(normalizedHeight, 4)}%` }}
				/>
				{total > 0 && (
					<div className="absolute top-0 left-1/2 -translate-x-1/2 text-xs text-stone-500 dark:text-night-400 font-mono">
						{executionRate.toFixed(0)}%
					</div>
				)}
			</div>
			<span className="text-xs text-stone-500 dark:text-night-400">{bin}%</span>
			<span className="text-xs text-stone-400 dark:text-night-500 font-mono">n={total}</span>
		</div>
	);
});

// ============================================
// Main Component
// ============================================

export const ConfidenceCalibrationChart = memo(function ConfidenceCalibrationChart({
	data,
	isLoading = false,
}: ConfidenceCalibrationChartProps) {
	if (isLoading) {
		return <ConfidenceCalibrationChartSkeleton />;
	}

	const dataMap = new Map(data?.map((d) => [d.bin, d]) ?? []);
	const orderedData = BIN_ORDER.map(
		(bin) => dataMap.get(bin) ?? { bin, total: 0, executed: 0, executionRate: 0 },
	);
	const maxRate = Math.max(...orderedData.map((d) => d.executionRate), 100);
	const hasData = orderedData.some((d) => d.total > 0);

	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-5">
			<h3 className="text-sm font-medium text-stone-500 dark:text-night-400 uppercase tracking-wide mb-2">
				Confidence Calibration
			</h3>
			<p className="text-xs text-stone-400 dark:text-night-500 mb-4">
				Does higher confidence = better execution rate?
			</p>

			{hasData ? (
				<div className="flex items-end justify-between gap-2">
					{orderedData.map((d) => (
						<CalibrationBar
							key={d.bin}
							bin={d.bin}
							executionRate={d.executionRate}
							total={d.total}
							executed={d.executed}
							maxRate={maxRate}
						/>
					))}
				</div>
			) : (
				<div className="h-40 flex items-center justify-center text-sm text-stone-400 dark:text-night-500">
					No calibration data available
				</div>
			)}

			<div className="mt-4 pt-4 border-t border-cream-200 dark:border-night-700 text-xs text-stone-400 dark:text-night-500">
				Bars show execution rate (approved + executed) for each confidence bin. Ideally, higher
				confidence should correlate with higher execution rates.
			</div>
		</div>
	);
});

export default ConfidenceCalibrationChart;
