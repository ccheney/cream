"use client";

/**
 * Risk Page - Risk exposure monitoring
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 4.3
 */

import { PortfolioGreeks } from "@/components/risk";
import { useExposure, useLimits, useVaR } from "@/hooks/queries";

const formatCurrency = (value: number) =>
	new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(value);

const formatPct = (value: number) => `${(value * 100).toFixed(1)}%`;

export default function RiskPage() {
	const { data: exposure, isLoading: exposureLoading } = useExposure();
	const { data: var_, isLoading: varLoading } = useVaR();
	const { data: limits, isLoading: limitsLoading } = useLimits();

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-semibold text-stone-900 dark:text-night-50">Risk Exposure</h1>
			</div>
			<RiskSummaryGrid
				exposure={exposure}
				exposureLoading={exposureLoading}
				varValue={var_?.oneDay95}
				varLoading={varLoading}
			/>
			<SectorExposureCard exposure={exposure} loading={exposureLoading} />
			<PortfolioGreeks
				deltaLimit={500000}
				gammaLimit={10000}
				thetaLimit={100}
				vegaLimit={50000}
				showGauge
				showLimits
			/>
			<LimitUtilizationCard limits={limits} loading={limitsLoading} />
		</div>
	);
}

function RiskSummaryGrid({
	exposure,
	exposureLoading,
	varValue,
	varLoading,
}: {
	exposure: Awaited<ReturnType<typeof useExposure>>["data"];
	exposureLoading: boolean;
	varValue: number | undefined;
	varLoading: boolean;
}) {
	const concentrationText = getConcentrationText(
		exposureLoading,
		exposure?.concentrationMax?.symbol,
		exposure?.concentrationMax?.pct ?? 0,
	);

	return (
		<div className="grid grid-cols-4 gap-4">
			<RiskMetricCard
				label="Gross Exposure"
				value={exposureLoading ? "--" : formatPct(exposure?.gross.pct ?? 0)}
				limit={exposureLoading ? undefined : formatCurrency(exposure?.gross.limit ?? 0)}
				status={getStatus(exposure?.gross.pct ?? 0, 0.8, 0.95)}
				isLoading={exposureLoading}
			/>
			<RiskMetricCard
				label="Net Exposure"
				value={exposureLoading ? "--" : formatPct(exposure?.net.pct ?? 0)}
				limit={exposureLoading ? undefined : formatCurrency(exposure?.net.limit ?? 0)}
				status={getStatus(exposure?.net.pct ?? 0, 0.7, 0.9)}
				isLoading={exposureLoading}
			/>
			<RiskMetricCard
				label="VaR (95%)"
				value={varLoading ? "--" : formatCurrency(varValue ?? 0)}
				status="normal"
				isLoading={varLoading}
			/>
			<RiskMetricCard
				label="Max Concentration"
				value={concentrationText}
				status={getStatus(exposure?.concentrationMax?.pct ?? 0, 0.15, 0.2)}
				isLoading={exposureLoading}
			/>
		</div>
	);
}

function SectorExposureCard({
	exposure,
	loading,
}: {
	exposure: Awaited<ReturnType<typeof useExposure>>["data"];
	loading: boolean;
}) {
	if (loading) {
		return (
			<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
				<h2 className="text-lg font-medium text-stone-900 dark:text-night-50 mb-4">
					Sector Exposure
				</h2>
				<div className="h-48 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
			</div>
		);
	}

	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
			<h2 className="text-lg font-medium text-stone-900 dark:text-night-50 mb-4">
				Sector Exposure
			</h2>
			{exposure?.sectorExposure ? (
				<div className="space-y-3">
					{Object.entries(exposure.sectorExposure).map(([sector, pct]) => (
						<SectorExposureRow key={sector} sector={sector} pct={pct} />
					))}
				</div>
			) : (
				<div className="h-48 flex items-center justify-center text-stone-400 dark:text-night-400">
					No sector data available
				</div>
			)}
		</div>
	);
}

function SectorExposureRow({ sector, pct }: { sector: string; pct: number }) {
	return (
		<div>
			<div className="flex items-center justify-between text-sm mb-1">
				<span className="text-stone-700 dark:text-night-100">{sector}</span>
				<span className="text-stone-500 dark:text-night-300">{formatPct(pct)}</span>
			</div>
			<div className="h-2 bg-cream-100 dark:bg-night-700 rounded-full overflow-hidden">
				<div
					className="h-full bg-blue-500 rounded-full transition-all"
					style={{ width: `${pct * 100}%` }}
				/>
			</div>
		</div>
	);
}

function LimitUtilizationCard({
	limits,
	loading,
}: {
	limits: Awaited<ReturnType<typeof useLimits>>["data"];
	loading: boolean;
}) {
	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
			<div className="p-4 border-b border-cream-200 dark:border-night-700">
				<h2 className="text-lg font-medium text-stone-900 dark:text-night-50">Limit Utilization</h2>
			</div>
			{loading ? <LimitLoadingRows /> : <LimitRows limits={limits ?? []} />}
		</div>
	);
}

function LimitLoadingRows() {
	return (
		<div className="p-4 space-y-2">
			{[1, 2, 3].map((i) => (
				<div key={i} className="h-12 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
			))}
		</div>
	);
}

function LimitRows({
	limits,
}: {
	limits: NonNullable<Awaited<ReturnType<typeof useLimits>>["data"]>;
}) {
	if (limits.length === 0) {
		return <div className="p-4 text-stone-400 dark:text-night-400">No limit data</div>;
	}
	return (
		<div className="divide-y divide-cream-100 dark:divide-night-700">
			{limits.map((limit) => (
				<LimitRow key={limit.name} limit={limit} />
			))}
		</div>
	);
}

function LimitRow({
	limit,
}: {
	limit: NonNullable<Awaited<ReturnType<typeof useLimits>>["data"]>[number];
}) {
	return (
		<div className="p-4 flex items-center justify-between">
			<div>
				<span className="font-medium text-stone-900 dark:text-night-50">{limit.name}</span>
				<span className="ml-2 text-xs text-stone-500 dark:text-night-300 uppercase">
					{limit.category.replace("_", " ")}
				</span>
			</div>
			<div className="flex items-center gap-4">
				<div className="w-32">
					<div className="h-2 bg-cream-100 dark:bg-night-700 rounded-full overflow-hidden">
						<div
							className={`h-full rounded-full transition-all ${getLimitBarClass(limit.status)}`}
							style={{ width: `${limit.utilization * 100}%` }}
						/>
					</div>
				</div>
				<span className={`text-sm font-mono ${getLimitTextClass(limit.status)}`}>
					{(limit.utilization * 100).toFixed(0)}%
				</span>
			</div>
		</div>
	);
}

function getConcentrationText(loading: boolean, symbol: string | undefined, pct: number): string {
	if (loading) {
		return "--";
	}
	if (!symbol) {
		return "0.0%";
	}
	return `${symbol} ${formatPct(pct)}`;
}

function getLimitBarClass(status: "normal" | "warning" | "critical") {
	if (status === "critical") {
		return "bg-red-500";
	}
	if (status === "warning") {
		return "bg-amber-500";
	}
	return "bg-green-500";
}

function getLimitTextClass(status: "normal" | "warning" | "critical") {
	if (status === "critical") {
		return "text-red-500";
	}
	if (status === "warning") {
		return "text-amber-500";
	}
	return "text-green-500";
}

function getStatus(
	value: number,
	warningThreshold: number,
	criticalThreshold: number,
): "normal" | "warning" | "critical" {
	if (value >= criticalThreshold) {
		return "critical";
	}
	if (value >= warningThreshold) {
		return "warning";
	}
	return "normal";
}

function RiskMetricCard({
	label,
	value,
	limit,
	status,
	isLoading,
}: {
	label: string;
	value: string;
	limit?: string;
	status: "normal" | "warning" | "critical";
	isLoading: boolean;
}) {
	if (isLoading) {
		return (
			<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
				<div className="h-4 w-20 bg-cream-100 dark:bg-night-700 rounded animate-pulse mb-2" />
				<div className="h-8 w-16 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
			</div>
		);
	}

	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
			<div className="text-sm text-stone-500 dark:text-night-300">{label}</div>
			<div className={`mt-1 text-2xl font-semibold ${getLimitTextClass(status)}`}>{value}</div>
			{limit && (
				<div className="mt-1 text-xs text-stone-400 dark:text-night-400">Limit: {limit}</div>
			)}
		</div>
	);
}
