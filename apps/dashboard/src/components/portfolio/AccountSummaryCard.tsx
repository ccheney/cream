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
	// Calculate maintenance margin percentage
	const maintMarginPct =
		account && account.equity > 0 ? (account.maintenanceMargin / account.equity) * 100 : 0;

	// Calculate unsettled cash (cash that hasn't settled yet from recent sales)
	const unsettledCash =
		account && account.cashWithdrawable !== undefined ? account.cash - account.cashWithdrawable : 0;

	// Merge live streaming data with API performance metrics
	const mergedMetrics = useMemo((): PerformanceMetrics | undefined => {
		if (!performanceMetrics) {
			return undefined;
		}

		// If we have live day P&L from active streaming, override the "today" period
		// Only override if streaming is active (isStreaming prop) to avoid using stale/zero values
		if (isStreaming && (liveDayPnl !== undefined || liveDayPnlPct !== undefined)) {
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

		return performanceMetrics;
	}, [performanceMetrics, liveDayPnl, liveDayPnlPct, isStreaming]);

	// Determine margin status variant
	const marginVariant: MetricItemProps["variant"] =
		maintMarginPct >= 80 ? "negative" : maintMarginPct >= 50 ? "warning" : "default";

	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-5 flex flex-col">
			<div className="flex items-center justify-between mb-4">
				<h2 className="text-sm font-medium text-stone-500 dark:text-night-400 uppercase tracking-wide">
					Account Summary
				</h2>
				{isStreaming && (
					<output
						className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400"
						aria-label="Live streaming"
					>
						<span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
						Live
					</output>
				)}
			</div>

			<div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4">
				{/* Row 1: Cash, Buying Power, Long Value, Short Value */}
				<MetricItem
					label="Cash"
					tooltip="Available cash balance. Unsettled funds from recent sales become withdrawable T+1."
					value={formatCurrency(account?.cash ?? 0)}
					isLoading={isLoading}
					subText={unsettledCash > 0 ? `(${formatCurrency(unsettledCash)} settling)` : undefined}
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

				{/* Row 2: Maint. Margin, PDT Status, Day Trades, Shorting */}
				<MetricItem
					label="Maint. Margin"
					tooltip="Maintenance margin requirement - collateral required to hold current positions (not borrowed funds)"
					value={formatPercent(maintMarginPct)}
					variant={marginVariant}
					isLoading={isLoading}
				/>
				<MetricItem
					label="PDT Status"
					tooltip={
						account && account.equity >= 25000
							? "Equity above $25k - no day trade restrictions apply"
							: "Pattern Day Trader status (requires $25k equity for unlimited day trades)"
					}
					value={
						account && account.equity >= 25000
							? "Unrestricted"
							: account?.patternDayTrader
								? "Flagged"
								: "No"
					}
					variant={
						account && account.equity >= 25000
							? "positive"
							: account?.patternDayTrader
								? "negative"
								: "default"
					}
					isLoading={isLoading}
				/>
				<MetricItem
					label="Day Trades"
					tooltip={
						account && account.equity >= 25000
							? "Day trades in rolling 5-day period (no limit - equity above $25k)"
							: "Day trades used in rolling 5-day period (limit: 3 for accounts under $25k)"
					}
					value={
						account && account.equity >= 25000
							? `${account.daytradeCount}`
							: `${account?.daytradeCount ?? 0}/3`
					}
					variant={
						account && account.equity >= 25000
							? "default"
							: account && account.daytradeCount >= 3
								? "negative"
								: "default"
					}
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

			{/* Trade Stats + Performance Returns */}
			<div className="mt-auto pt-4 border-t border-cream-200 dark:border-night-700">
				<div className="flex items-end justify-between gap-4 flex-wrap">
					{/* Trade Stats - left side (always show, with fallback to zeros) */}
					<div className="flex items-center gap-6">
						<div>
							<span className="text-xs text-stone-400 dark:text-night-500">Total P&L</span>
							<p
								className={`text-lg font-semibold font-mono ${(tradeStats?.totalRealizedPnl ?? 0) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
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

					{/* Returns - right side */}
					<div className="flex flex-col items-end gap-1 ml-auto">
						<span className="text-xs text-stone-400 dark:text-night-500 uppercase tracking-wide">
							Returns
						</span>
						<PerformanceGrid metrics={mergedMetrics} isLoading={isPerformanceLoading} />
					</div>
				</div>
			</div>
		</div>
	);
});

export default AccountSummaryCard;
