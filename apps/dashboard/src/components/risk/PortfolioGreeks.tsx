/**
 * PortfolioGreeks Component
 *
 * Aggregated real-time portfolio Greeks dashboard with delta gauge and cards.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 4.3
 */

"use client";

import { RefreshCw } from "lucide-react";
import { memo } from "react";
import { Spinner } from "@/components/ui/spinner";
import { type AggregateGreeksData, useAggregateGreeks } from "@/hooks/useAggregateGreeks";
import { DeltaGauge } from "./DeltaGauge";
import { GreekCard } from "./GreekCard";

export interface PortfolioGreeksProps {
	/** Delta limit for gauge */
	deltaLimit?: number;
	/** Gamma limit */
	gammaLimit?: number;
	/** Theta limit */
	thetaLimit?: number;
	/** Vega limit */
	vegaLimit?: number;
	/** Show delta gauge */
	showGauge?: boolean;
	/** Show limit markers on gauge */
	showLimits?: boolean;
	/** Display variant */
	variant?: "full" | "compact";
	/** Additional class names */
	className?: string;
}

interface CompactCardConfig {
	label: string;
	value: string;
	color: string;
}

function formatTimestamp(date: Date): string {
	return date.toLocaleTimeString("en-US", {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

function formatAge(date: Date): string {
	const ms = Date.now() - date.getTime();
	return ms < 1000 ? `${ms}ms ago` : `${(ms / 1000).toFixed(1)}s ago`;
}

function formatGreekValue(value: number, type: "currency" | "number") {
	const sign = value >= 0 ? "+" : "";
	if (type === "currency") {
		return `${sign}$${Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
	}
	return `${sign}${value.toFixed(0)}`;
}

function PortfolioGreeksLoading({ className = "" }: { className?: string }) {
	return (
		<div
			className={`bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6 ${className}`}
		>
			<div className="flex items-center justify-center h-48">
				<Spinner size="lg" />
			</div>
		</div>
	);
}

function PortfolioGreeksEmpty({ className = "" }: { className?: string }) {
	return (
		<div
			className={`bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6 ${className}`}
		>
			<div className="text-center text-stone-500 dark:text-night-300 py-8">
				No options positions to calculate Greeks
			</div>
		</div>
	);
}

const CompactGreeksItem = memo(function CompactGreeksItem({
	label,
	value,
	color,
}: CompactCardConfig) {
	return (
		<div className="flex items-center gap-1.5">
			<span className="text-xs text-stone-500 dark:text-night-300 font-medium">{label}</span>
			<span className={`text-sm font-mono ${color}`}>{value}</span>
		</div>
	);
});

function PortfolioGreeksFull({
	data,
	isStreaming,
	deltaLimit,
	gammaLimit,
	thetaLimit,
	vegaLimit,
	showGauge,
	showLimits,
	refresh,
}: {
	data: AggregateGreeksData;
	isStreaming: boolean;
	deltaLimit: number;
	gammaLimit?: number;
	thetaLimit?: number;
	vegaLimit?: number;
	showGauge: boolean;
	showLimits: boolean;
	refresh: () => void;
}) {
	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
			<div className="flex items-center justify-between px-4 py-3 border-b border-cream-200 dark:border-night-700">
				<div className="flex items-center gap-3">
					<h2 className="text-lg font-medium text-stone-900 dark:text-night-50">
						Portfolio Greeks
					</h2>
					{isStreaming && (
						<div className="flex items-center gap-1.5">
							<span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
							<span className="text-xs text-stone-500 dark:text-night-300">Streaming</span>
						</div>
					)}
				</div>

				<div className="flex items-center gap-3">
					<span className="text-xs text-stone-400 dark:text-night-400">
						{formatTimestamp(data.lastUpdated)} ({formatAge(data.lastUpdated)})
					</span>
					<button
						type="button"
						onClick={refresh}
						className="p-1.5 rounded-md text-stone-500 dark:text-night-300 hover:bg-cream-100 dark:hover:bg-night-700 transition-colors"
						aria-label="Refresh Greeks"
					>
						<RefreshCw className="w-4 h-4" />
					</button>
				</div>
			</div>

			<div className="p-4 space-y-6">
				{showGauge && (
					<DeltaGauge
						deltaNotional={data.deltaNotional}
						deltaSPYEquivalent={data.deltaSPYEquivalent}
						maxValue={deltaLimit}
						showLimits={showLimits}
						size="md"
					/>
				)}

				<div className="grid grid-cols-4 gap-4">
					<GreekCard
						type="gamma"
						value={data.gammaTotal}
						limit={gammaLimit}
						isStreaming={isStreaming}
					/>
					<GreekCard
						type="theta"
						value={data.thetaDaily}
						limit={thetaLimit}
						isStreaming={isStreaming}
					/>
					<GreekCard
						type="vega"
						value={data.vegaTotal}
						limit={vegaLimit}
						isStreaming={isStreaming}
					/>
					<GreekCard type="rho" value={data.rhoTotal} isStreaming={isStreaming} />
				</div>

				<div className="text-center text-xs text-stone-400 dark:text-night-400">
					{data.positionCount} option position{data.positionCount !== 1 ? "s" : ""}
				</div>
			</div>
		</div>
	);
}

const PortfolioGreeksCompact = memo(function PortfolioGreeksCompact({
	data,
	isStreaming,
	className = "",
}: {
	data: AggregateGreeksData;
	isStreaming: boolean;
	className?: string;
}) {
	return (
		<div
			className={`flex items-center gap-6 px-4 py-3 bg-cream-50 dark:bg-night-700 rounded-lg ${className}`}
		>
			{isStreaming && (
				<div className="flex items-center gap-1">
					<span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
					<span className="text-[10px] text-stone-500 dark:text-night-300">Live</span>
				</div>
			)}

			<CompactGreeksItem
				label="Δ"
				value={formatGreekValue(data.deltaNotional, "currency")}
				color={
					data.deltaNotional >= 0
						? "text-green-600 dark:text-green-400"
						: "text-red-600 dark:text-red-400"
				}
			/>
			<CompactGreeksItem
				label="Γ"
				value={formatGreekValue(data.gammaTotal, "number")}
				color="text-stone-700 dark:text-night-100"
			/>
			<CompactGreeksItem
				label="Θ"
				value={`$${Math.abs(data.thetaDaily).toFixed(0)}/day`}
				color={data.thetaDaily <= 0 ? "text-red-500" : "text-green-500"}
			/>
			<CompactGreeksItem
				label="V"
				value={formatGreekValue(data.vegaTotal, "currency")}
				color="text-stone-700 dark:text-night-100"
			/>
		</div>
	);
});

function PortfolioGreeksContent({
	variant,
	data,
	isStreaming,
	deltaLimit,
	gammaLimit,
	thetaLimit,
	vegaLimit,
	showGauge,
	showLimits,
	className,
	refresh,
}: {
	variant: "full" | "compact";
	data: AggregateGreeksData;
	isStreaming: boolean;
	deltaLimit: number;
	gammaLimit?: number;
	thetaLimit?: number;
	vegaLimit?: number;
	showGauge: boolean;
	showLimits: boolean;
	className?: string;
	refresh: () => void;
}) {
	if (variant === "compact") {
		return <PortfolioGreeksCompact data={data} isStreaming={isStreaming} className={className} />;
	}

	return (
		<PortfolioGreeksFull
			data={data}
			isStreaming={isStreaming}
			deltaLimit={deltaLimit}
			gammaLimit={gammaLimit}
			thetaLimit={thetaLimit}
			vegaLimit={vegaLimit}
			showGauge={showGauge}
			showLimits={showLimits}
			refresh={refresh}
		/>
	);
}

export const PortfolioGreeks = memo(function PortfolioGreeks({
	deltaLimit = 500000,
	gammaLimit,
	thetaLimit,
	vegaLimit,
	showGauge = true,
	showLimits = false,
	variant = "full",
	className = "",
}: PortfolioGreeksProps) {
	const { data, isLoading, isStreaming, refresh } = useAggregateGreeks({
		throttleMs: 100,
		enabled: true,
	});

	if (isLoading) {
		return <PortfolioGreeksLoading className={className} />;
	}

	if (!data) {
		return <PortfolioGreeksEmpty className={className} />;
	}

	return (
		<PortfolioGreeksContent
			variant={variant}
			data={data}
			isStreaming={isStreaming}
			deltaLimit={deltaLimit}
			gammaLimit={gammaLimit}
			thetaLimit={thetaLimit}
			vegaLimit={vegaLimit}
			showGauge={showGauge}
			showLimits={showLimits}
			className={className}
			refresh={refresh}
		/>
	);
});

export default PortfolioGreeks;
