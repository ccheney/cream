"use client";

/**
 * AccountSummaryCard Component
 *
 * Displays 8 key account metrics in a responsive 2x4 grid.
 * Metrics: Cash, Buying Power, Long Value, Short Value, Margin Used, PDT Status, Day Trades, Shorting
 *
 * @see docs/plans/ui/03-views.md Section 5: Portfolio Dashboard
 */

import { memo, useMemo } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Account, PerformanceMetrics } from "@/lib/api/types";
import { PerformanceGrid } from "./PerformanceGrid";

// ============================================
// Types
// ============================================

export interface TradeStats {
	totalRealizedPnl: number;
	winCount: number;
	lossCount: number;
	winRate: number;
}

export interface AccountSummaryCardProps {
	account?: Account;
	isLoading?: boolean;
	isStreaming?: boolean;
	performanceMetrics?: PerformanceMetrics;
	isPerformanceLoading?: boolean;
	/** Live streaming day P&L - overrides API data when available */
	liveDayPnl?: number;
	/** Live streaming day P&L percentage - overrides API data when available */
	liveDayPnlPct?: number;
	/** Trade statistics from closed trades */
	tradeStats?: TradeStats;
}

interface MetricItemProps {
	label: string;
	tooltip: string;
	value: string;
	variant?: "default" | "positive" | "negative" | "warning";
	isLoading?: boolean;
	subText?: string;
}

interface AccountSummaryData {
	maintMarginPct: number;
	unsettledCash: number;
	mergedMetrics: PerformanceMetrics | undefined;
	marginVariant: MetricItemProps["variant"];
	pdtVariant: "positive" | "negative" | "default";
	pdtValue: string;
	pdtTooltip: string;
	dayTradeVariant: "positive" | "negative" | "default";
	dayTradeValue: string;
	dayTradeTooltip: string;
}

function calculateMaintenanceMargin(account?: Account): number {
	if (!account || account.equity <= 0) {
		return 0;
	}
	return (account.maintenanceMargin / account.equity) * 100;
}

function calculateUnsettledCash(account?: Account): number {
	if (!account || account.cashWithdrawable === undefined) {
		return 0;
	}
	return account.cash - account.cashWithdrawable;
}

function mergePerformanceMetrics(
	performanceMetrics: PerformanceMetrics | undefined,
	isStreaming: boolean,
	liveDayPnl?: number,
	liveDayPnlPct?: number,
): PerformanceMetrics | undefined {
	if (
		!performanceMetrics ||
		!isStreaming ||
		(liveDayPnl === undefined && liveDayPnlPct === undefined)
	) {
		return performanceMetrics;
	}

	return {
		...performanceMetrics,
		periods: {
			...performanceMetrics.periods,
			today: {
				return: liveDayPnl ?? performanceMetrics.periods?.today?.return ?? 0,
				returnPct: liveDayPnlPct ?? performanceMetrics.periods?.today?.returnPct ?? 0,
				trades: performanceMetrics.periods?.today?.trades ?? 0,
				winRate: performanceMetrics.periods?.today?.winRate ?? 0,
			},
		},
	};
}

function resolvePdtState(account?: Account): {
	value: string;
	tooltip: string;
	variant: "positive" | "negative" | "default";
} {
	const hasPdtEquity = account?.equity ?? 0;
	const isPdtRestricted = hasPdtEquity < 25000;
	const isPatternDayTrader = account?.patternDayTrader === true;

	if (!isPdtRestricted) {
		return {
			value: "Unrestricted",
			tooltip: "Equity above $25k - no day trade restrictions apply",
			variant: "positive",
		};
	}

	return {
		value: isPatternDayTrader ? "Flagged" : "No",
		tooltip: "Pattern Day Trader status (requires $25k equity for unlimited day trades)",
		variant: isPatternDayTrader ? "negative" : "default",
	};
}

function resolveDayTradeState(account?: Account): {
	value: string;
	tooltip: string;
	variant: "positive" | "negative" | "default";
} {
	const dayTradeCount = account?.daytradeCount ?? 0;
	const hasPdtEquity = account?.equity ?? 0;
	const isPdtRestricted = hasPdtEquity < 25000;

	return {
		value: `${dayTradeCount}${isPdtRestricted ? "/3" : ""}`,
		tooltip: isPdtRestricted
			? "Day trades used in rolling 5-day period (limit: 3 for accounts under $25k)"
			: "Day trades in rolling 5-day period (no limit - equity above $25k)",
		variant: isPdtRestricted && dayTradeCount >= 3 ? "negative" : "default",
	};
}

function useAccountSummaryData(
	account?: Account,
	isStreaming = false,
	performanceMetrics?: PerformanceMetrics,
	liveDayPnl?: number,
	liveDayPnlPct?: number,
) {
	const maintMarginPct = calculateMaintenanceMargin(account);
	const unsettledCash = calculateUnsettledCash(account);
	const pdtState = resolvePdtState(account);
	const dayTradeState = resolveDayTradeState(account);

	const mergedMetrics = useMemo(
		() => mergePerformanceMetrics(performanceMetrics, isStreaming, liveDayPnl, liveDayPnlPct),
		[isStreaming, liveDayPnl, liveDayPnlPct, performanceMetrics],
	);

	const marginVariant: MetricItemProps["variant"] =
		maintMarginPct >= 80 ? "negative" : maintMarginPct >= 50 ? "warning" : "default";

	return {
		maintMarginPct,
		unsettledCash,
		mergedMetrics,
		marginVariant,
		pdtVariant: pdtState.variant,
		pdtValue: pdtState.value,
		pdtTooltip: pdtState.tooltip,
		dayTradeVariant: dayTradeState.variant,
		dayTradeValue: dayTradeState.value,
		dayTradeTooltip: dayTradeState.tooltip,
	};
}

// ============================================
// Metric Item Component
// ============================================

const MetricItem = memo(function MetricItem({
	label,
	tooltip,
	value,
	variant = "default",
	isLoading = false,
	subText,
}: MetricItemProps) {
	const variantClasses = {
		default: "text-stone-900 dark:text-night-50",
		positive: "text-green-600 dark:text-green-400",
		negative: "text-red-600 dark:text-red-400",
		warning: "text-amber-600 dark:text-amber-400",
	};

	if (isLoading) {
		return (
			<div className="space-y-1">
				<div className="h-3 w-16 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
				<div className="h-6 w-20 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
			</div>
		);
	}

	return (
		<div className="space-y-1">
			<Tooltip>
				<TooltipTrigger asChild>
					<span className="text-xs text-stone-400 dark:text-night-500 cursor-help">{label}</span>
				</TooltipTrigger>
				<TooltipContent position="top">{tooltip}</TooltipContent>
			</Tooltip>
			<div className={`text-lg font-semibold font-mono ${variantClasses[variant]}`}>{value}</div>
			{subText && (
				<div className="text-xs text-stone-400 dark:text-night-500 font-mono">{subText}</div>
			)}
		</div>
	);
});

// ============================================
// Formatters
// ============================================

function formatCurrency(value: number, compact = false): string {
	if (compact && Math.abs(value) >= 1000) {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: "USD",
			notation: "compact",
			maximumFractionDigits: 1,
		}).format(value);
	}
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(value);
}

function formatPercent(value: number): string {
	return `${value.toFixed(1)}%`;
}

function AccountSummaryHeader({ isStreaming }: { isStreaming: boolean }) {
	if (!isStreaming) {
		return (
			<h2 className="text-sm font-medium text-stone-500 dark:text-night-400 uppercase tracking-wide">
				Account Summary
			</h2>
		);
	}

	return (
		<div className="flex items-center justify-between">
			<h2 className="text-sm font-medium text-stone-500 dark:text-night-400 uppercase tracking-wide">
				Account Summary
			</h2>
			<output
				className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400"
				aria-label="Live streaming"
			>
				<span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
				Live
			</output>
		</div>
	);
}

function AccountMetricGrid({
	account,
	isLoading,
	data,
}: {
	account?: Account;
	isLoading: boolean;
	data: AccountSummaryData;
}) {
	return (
		<div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4">
			<MetricItem
				label="Cash"
				tooltip="Available cash balance. Unsettled funds from recent sales become withdrawable T+1."
				value={formatCurrency(account?.cash ?? 0)}
				isLoading={isLoading}
				subText={
					data.unsettledCash > 0 ? `(${formatCurrency(data.unsettledCash)} settling)` : undefined
				}
			/>
			<MetricItem
				label="Buying Power"
				tooltip="Total buying power including margin (2x for margin accounts)"
				value={formatCurrency(account?.buyingPower ?? 0, true)}
				isLoading={isLoading}
			/>
			<MetricItem
				label="Long Value"
				tooltip="Total market value of long positions"
				value={formatCurrency(account?.longMarketValue ?? 0)}
				isLoading={isLoading}
			/>
			<MetricItem
				label="Short Value"
				tooltip="Total market value of short positions"
				value={formatCurrency(account?.shortMarketValue ?? 0)}
				variant={account && account.shortMarketValue > 0 ? "negative" : "default"}
				isLoading={isLoading}
			/>
			<MetricItem
				label="Maint. Margin"
				tooltip="Maintenance margin requirement - collateral required to hold current positions (not borrowed funds)"
				value={formatPercent(data.maintMarginPct)}
				variant={data.marginVariant}
				isLoading={isLoading}
			/>
			<MetricItem
				label="PDT Status"
				tooltip={data.pdtTooltip}
				value={data.pdtValue}
				variant={data.pdtVariant}
				isLoading={isLoading}
			/>
			<MetricItem
				label="Day Trades"
				tooltip={data.dayTradeTooltip}
				value={data.dayTradeValue}
				variant={data.dayTradeVariant}
				isLoading={isLoading}
			/>
			<MetricItem
				label="Shorting"
				tooltip="Whether short selling is enabled on this account"
				value={account?.shortingEnabled ? "Enabled" : "Disabled"}
				variant={account?.shortingEnabled ? "positive" : "default"}
				isLoading={isLoading}
			/>
		</div>
	);
}

function PerformanceAndTrades({
	mergedMetrics,
	isPerformanceLoading,
	tradeStats,
}: {
	mergedMetrics: PerformanceMetrics | undefined;
	isPerformanceLoading: boolean;
	tradeStats?: TradeStats;
}) {
	return (
		<div className="mt-auto pt-4 border-t border-cream-200 dark:border-night-700">
			<div className="flex items-end justify-between gap-4 flex-wrap">
				<div className="flex items-center gap-6">
					<div>
						<span className="text-xs text-stone-400 dark:text-night-500">Total P&L</span>
						<p
							className={`text-lg font-semibold font-mono ${
								(tradeStats?.totalRealizedPnl ?? 0) >= 0
									? "text-green-600 dark:text-green-400"
									: "text-red-600 dark:text-red-400"
							}`}
						>
							{(tradeStats?.totalRealizedPnl ?? 0) >= 0 ? "+" : ""}
							{formatCurrency(tradeStats?.totalRealizedPnl ?? 0)}
						</p>
					</div>
					<div>
						<span className="text-xs text-stone-400 dark:text-night-500">Win Rate</span>
						<p className="text-lg font-semibold text-stone-900 dark:text-night-50">
							{(tradeStats?.winRate ?? 0).toFixed(1)}%
						</p>
					</div>
					<div>
						<span className="text-xs text-stone-400 dark:text-night-500">W / L</span>
						<p className="text-lg font-semibold">
							<span className="text-green-600 dark:text-green-400">
								{tradeStats?.winCount ?? 0}
							</span>
							<span className="text-stone-400 mx-1">/</span>
							<span className="text-red-600 dark:text-red-400">{tradeStats?.lossCount ?? 0}</span>
						</p>
					</div>
				</div>
				<div className="flex flex-col items-end gap-1 ml-auto">
					<span className="text-xs text-stone-400 dark:text-night-500 uppercase tracking-wide">
						Returns
					</span>
					<PerformanceGrid metrics={mergedMetrics} isLoading={isPerformanceLoading} />
				</div>
			</div>
		</div>
	);
}

// ============================================
// Main Component
// ============================================

export const AccountSummaryCard = memo(function AccountSummaryCard({
	account,
	isLoading = false,
	isStreaming = false,
	performanceMetrics,
	isPerformanceLoading = false,
	liveDayPnl,
	liveDayPnlPct,
	tradeStats,
}: AccountSummaryCardProps) {
	const summaryData = useAccountSummaryData(
		account,
		isStreaming,
		performanceMetrics,
		liveDayPnl,
		liveDayPnlPct,
	);

	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-5 flex flex-col">
			<div className="flex items-center justify-between mb-4">
				<AccountSummaryHeader isStreaming={isStreaming} />
			</div>

			<AccountMetricGrid account={account} isLoading={isLoading} data={summaryData} />
			<PerformanceAndTrades
				mergedMetrics={summaryData.mergedMetrics}
				isPerformanceLoading={isPerformanceLoading}
				tradeStats={tradeStats}
			/>
		</div>
	);
});

export default AccountSummaryCard;
