/**
 * DeltaGauge Component
 *
 * Horizontal bar visualization for portfolio delta exposure.
 * Centered at zero with positive/negative fills.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 4.3
 */

"use client";

import { memo, useMemo } from "react";
import { AnimatedNumber } from "@/components/ui/animated-number";

export interface DeltaGaugeProps {
	/** Current delta notional value */
	deltaNotional: number;
	/** SPY share equivalent */
	deltaSPYEquivalent: number;
	/** Maximum absolute value for scale (default: 500000) */
	maxValue?: number;
	/** Warning threshold as percentage of max (default: 0.8) */
	warningThreshold?: number;
	/** Critical threshold as percentage of max (default: 0.95) */
	criticalThreshold?: number;
	/** Show limit markers */
	showLimits?: boolean;
	/** Size variant */
	size?: "sm" | "md" | "lg";
	/** Additional class names */
	className?: string;
}

const DEFAULT_MAX_VALUE = 500000;
const DEFAULT_WARNING = 0.8;
const DEFAULT_CRITICAL = 0.95;

const SIZE_STYLES = {
	sm: { height: "h-3", text: "text-xs", label: "text-[10px]" },
	md: { height: "h-4", text: "text-sm", label: "text-xs" },
	lg: { height: "h-6", text: "text-base", label: "text-sm" },
} as const;

type DeltaDirection = "positive" | "negative";
type DeltaStatus = "normal" | "warning" | "critical";

interface DeltaFillState {
	fillPct: number;
	direction: DeltaDirection;
	status: DeltaStatus;
}

function getDeltaFillState(
	deltaNotional: number,
	maxValue: number,
	warningThreshold: number,
	criticalThreshold: number,
): DeltaFillState {
	const absValue = Math.abs(deltaNotional);
	const pct = Math.min((absValue / maxValue) * 100, 100);
	const direction: DeltaDirection = deltaNotional >= 0 ? "positive" : "negative";
	const threshold = absValue / maxValue;

	const status: DeltaStatus =
		threshold >= criticalThreshold
			? "critical"
			: threshold >= warningThreshold
				? "warning"
				: "normal";

	return { fillPct: pct, direction, status };
}

function getFillColor(direction: DeltaDirection, status: DeltaStatus): string {
	if (status === "critical" || status === "warning") {
		return direction === "positive" ? "bg-red-500" : "bg-red-500";
	}
	return direction === "positive" ? "bg-green-500 dark:bg-green-400" : "bg-red-500 dark:bg-red-400";
}

function formatValue(value: number, formatSign = true): string {
	const sign = formatSign && value >= 0 ? "+" : "";
	return `${sign}${Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function formatScaleValue(maxValue: number) {
	return `${formatValue(maxValue / 1000)}K`;
}

function DeltaLimitLines({
	warningThreshold,
	criticalThreshold,
}: {
	warningThreshold: number;
	criticalThreshold: number;
}) {
	const warningLeft = `${50 - (warningThreshold * 100) / 2}%`;
	const warningRight = `${50 + (warningThreshold * 100) / 2}%`;
	const criticalLeft = `${50 - (criticalThreshold * 100) / 2}%`;
	const criticalRight = `${50 + (criticalThreshold * 100) / 2}%`;

	return (
		<>
			<div
				className="absolute top-0 bottom-0 w-px bg-amber-400 dark:bg-amber-500"
				style={{ left: warningLeft }}
			/>
			<div
				className="absolute top-0 bottom-0 w-px bg-amber-400 dark:bg-amber-500"
				style={{ left: warningRight }}
			/>
			<div className="absolute top-0 bottom-0 w-px bg-red-500" style={{ left: criticalLeft }} />
			<div className="absolute top-0 bottom-0 w-px bg-red-500" style={{ left: criticalRight }} />
		</>
	);
}

export const DeltaGauge = memo(function DeltaGauge({
	deltaNotional,
	deltaSPYEquivalent,
	maxValue = DEFAULT_MAX_VALUE,
	warningThreshold = DEFAULT_WARNING,
	criticalThreshold = DEFAULT_CRITICAL,
	showLimits = false,
	size = "md",
	className = "",
}: DeltaGaugeProps) {
	const { fillPct, direction, status } = useMemo(
		() => getDeltaFillState(deltaNotional, maxValue, warningThreshold, criticalThreshold),
		[deltaNotional, maxValue, warningThreshold, criticalThreshold],
	);

	const sizes = SIZE_STYLES[size];
	const fillColor = useMemo(() => getFillColor(direction, status), [direction, status]);

	return (
		<div className={`space-y-2 ${className}`}>
			<div className="flex items-center justify-between">
				<span
					className={`${sizes.label} font-medium text-stone-600 dark:text-night-200 dark:text-night-400 uppercase tracking-wide`}
				>
					Delta Exposure
				</span>
				<div className="flex items-center gap-3">
					<span
						className={`${sizes.text} font-mono font-semibold ${
							direction === "positive"
								? "text-green-600 dark:text-green-400"
								: "text-red-600 dark:text-red-400"
						}`}
					>
						<AnimatedNumber
							value={deltaNotional}
							format="currency"
							decimals={0}
							className="inline"
						/>
					</span>
				</div>
			</div>

			<div className="relative">
				<div
					className={`w-full ${sizes.height} bg-cream-100 dark:bg-night-700 rounded-full overflow-hidden`}
				>
					<div className="relative w-full h-full">
						<div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-cream-300 dark:bg-night-500 z-10" />

						{direction === "positive" && (
							<div
								className={`absolute left-1/2 top-0 bottom-0 ${fillColor} transition-all duration-300 ease-out`}
								style={{ width: `${fillPct / 2}%` }}
							/>
						)}

						{direction === "negative" && (
							<div
								className={`absolute right-1/2 top-0 bottom-0 ${fillColor} transition-all duration-300 ease-out`}
								style={{ width: `${fillPct / 2}%` }}
							/>
						)}
					</div>
				</div>

				{showLimits && (
					<DeltaLimitLines
						warningThreshold={warningThreshold}
						criticalThreshold={criticalThreshold}
					/>
				)}
			</div>

			<div className="flex items-center justify-between">
				<span className={`${sizes.label} text-stone-400 dark:text-night-400 font-mono`}>
					-{formatScaleValue(maxValue)}
				</span>
				<span className={`${sizes.label} text-stone-400 dark:text-night-400 font-mono`}>0</span>
				<span className={`${sizes.label} text-stone-400 dark:text-night-400 font-mono`}>
					+{formatScaleValue(maxValue)}
				</span>
			</div>

			<div className="text-center">
				<span className={`${sizes.label} text-stone-500 dark:text-night-300`}>
					≈ {formatValue(deltaSPYEquivalent)} SPY shares
				</span>
			</div>
		</div>
	);
});

export default DeltaGauge;
