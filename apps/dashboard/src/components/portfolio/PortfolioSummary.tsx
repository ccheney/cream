"use client";

import { memo } from "react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import type { PortfolioStreamingState } from "@/hooks/usePortfolioStreaming";

export interface PortfolioSummaryProps {
	state: PortfolioStreamingState;
	cash: number;
	isLoading?: boolean;
}

interface MetricCardProps {
	label: string;
	value: number;
	format?: "currency" | "percent";
	isPositive?: boolean;
	secondaryValue?: number;
	isLoading?: boolean;
	isStreaming?: boolean;
}

const MetricCard = memo(function MetricCard({
	label,
	value,
	format = "currency",
	isPositive,
	secondaryValue,
	isLoading = false,
	isStreaming = false,
}: MetricCardProps) {
	if (isLoading) {
		return (
			<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
				<div className="h-4 w-16 bg-cream-100 dark:bg-night-700 rounded animate-pulse mb-2" />
				<div className="h-8 w-24 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
			</div>
		);
	}

	const valueColor =
		isPositive === undefined
			? "text-stone-900 dark:text-night-50"
			: isPositive
				? "text-green-600 dark:text-green-400"
				: "text-red-600 dark:text-red-400";

	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
			<div className="flex items-center gap-2 mb-1">
				<span className="text-sm text-stone-500 dark:text-night-300">{label}</span>
				{isStreaming && (
					// biome-ignore lint/a11y/useSemanticElements: role="status" for live region accessibility
					<span
						className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"
						title="Live"
						role="status"
						aria-label="Live streaming"
					/>
				)}
			</div>
			<div className="flex items-baseline gap-2">
				<span className={`text-2xl font-semibold ${valueColor}`}>
					{isPositive !== undefined && value >= 0 ? "+" : ""}
					<AnimatedNumber
						value={value}
						format={format}
						decimals={format === "percent" ? 2 : 0}
						className="inline"
						animationThreshold={format === "percent" ? 0.01 : 1}
					/>
				</span>
				{secondaryValue !== undefined && (
					<span className={`text-sm ${valueColor}`}>
						{secondaryValue >= 0 ? "+" : ""}
						{secondaryValue.toFixed(2)}%
					</span>
				)}
			</div>
		</div>
	);
});

export const PortfolioSummary = memo(function PortfolioSummary({
	state,
	cash,
	isLoading = false,
}: PortfolioSummaryProps) {
	return (
		<div className="grid grid-cols-4 gap-4">
			<MetricCard
				label="Total NAV"
				value={state.liveNav}
				format="currency"
				isLoading={isLoading}
				isStreaming={state.isStreaming}
			/>
			<MetricCard label="Cash" value={cash} format="currency" isLoading={isLoading} />
			<MetricCard
				label="Unrealized P&L"
				value={state.liveTotalPnl}
				format="currency"
				isPositive={state.liveTotalPnl >= 0}
				secondaryValue={state.liveTotalPnlPct}
				isLoading={isLoading}
				isStreaming={state.isStreaming}
			/>
			<MetricCard
				label="Day P&L"
				value={state.liveDayPnl}
				format="currency"
				isPositive={state.liveDayPnl >= 0}
				secondaryValue={state.liveDayPnlPct}
				isLoading={isLoading}
				isStreaming={state.isStreaming}
			/>
		</div>
	);
});

export default PortfolioSummary;
