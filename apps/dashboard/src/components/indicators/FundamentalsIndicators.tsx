/**
 * FundamentalsIndicators Widget
 *
 * Display P/E, P/B, ROE, quality factors in clean tabular format.
 * Implements "Precision Warmth" design system with archival typography.
 *
 * @see docs/plans/ui/20-design-philosophy.md
 * @see docs/plans/ui/24-components.md
 * @see docs/plans/ui/22-typography.md
 */

"use client";

import { memo } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/surface";
import type { QualityIndicators, ValueIndicators } from "./IndicatorSnapshot";

// ============================================
// Types
// ============================================

export interface FundamentalsIndicatorsProps {
	/** Value indicator data */
	value: ValueIndicators | null;
	/** Quality indicator data */
	quality: QualityIndicators | null;
	/** Whether data is loading */
	isLoading?: boolean;
	/** Last update timestamp */
	lastUpdate?: number | null;
	/** Additional CSS classes */
	className?: string;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Format ratio with specified decimals
 */
function formatRatio(value: number | null, decimals = 2): string {
	if (value === null) {
		return "—";
	}
	return value.toFixed(decimals);
}

/**
 * Format percentage (input is decimal, e.g., 0.15 -> 15.0%)
 */
function formatPercent(value: number | null, decimals = 1): string {
	if (value === null) {
		return "—";
	}
	return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Get P/E variant based on value
 * Low P/E = value, High P/E = growth/expensive
 */
function getPEVariant(value: number | null): "success" | "info" | "warning" | "error" | "neutral" {
	if (value === null) {
		return "neutral";
	}
	if (value < 0) {
		return "error"; // Negative earnings
	}
	if (value < 15) {
		return "success"; // Value
	}
	if (value < 25) {
		return "info"; // Fair
	}
	if (value < 40) {
		return "warning"; // Growth premium
	}
	return "error"; // Expensive
}

/**
 * Get ROE variant based on value
 */
function getROEVariant(value: number | null): "success" | "info" | "warning" | "error" | "neutral" {
	if (value === null) {
		return "neutral";
	}
	if (value < 0) {
		return "error"; // Negative ROE
	}
	if (value < 0.08) {
		return "warning"; // Below average
	}
	if (value < 0.15) {
		return "info"; // Average
	}
	if (value < 0.25) {
		return "success"; // Good
	}
	return "success"; // Excellent
}

/**
 * Get quality score badge variant
 */
function getQualityVariant(
	quality: "HIGH" | "MEDIUM" | "LOW" | null
): "success" | "info" | "warning" | "error" | "neutral" {
	switch (quality) {
		case "HIGH":
			return "success";
		case "MEDIUM":
			return "info";
		case "LOW":
			return "error";
		default:
			return "neutral";
	}
}

/**
 * Get Beneish M-Score interpretation
 * M-Score > -1.78 suggests earnings manipulation
 */
function getMScoreVariant(
	value: number | null
): "success" | "info" | "warning" | "error" | "neutral" {
	if (value === null) {
		return "neutral";
	}
	if (value < -2.22) {
		return "success"; // Low manipulation risk
	}
	if (value < -1.78) {
		return "info"; // Moderate
	}
	return "error"; // High manipulation risk
}

/**
 * Get accruals ratio interpretation
 * High accruals = lower earnings quality
 */
function getAccrualsVariant(
	value: number | null
): "success" | "info" | "warning" | "error" | "neutral" {
	if (value === null) {
		return "neutral";
	}
	const absValue = Math.abs(value);
	if (absValue < 0.05) {
		return "success"; // Low accruals
	}
	if (absValue < 0.1) {
		return "info"; // Moderate
	}
	if (absValue < 0.15) {
		return "warning"; // Elevated
	}
	return "error"; // High accruals
}

// ============================================
// Sub-Components
// ============================================

/**
 * Indicator row with label, value, and optional badge
 */
const IndicatorRow = memo(function IndicatorRow({
	label,
	value,
	badge,
	badgeVariant = "neutral",
}: {
	label: string;
	value: string;
	badge?: string;
	badgeVariant?: "success" | "info" | "warning" | "error" | "neutral";
}) {
	return (
		<div className="flex items-center justify-between py-2 border-b border-stone-100 dark:border-stone-800 last:border-0">
			<span className="text-sm text-stone-600 dark:text-stone-400">{label}</span>
			<div className="flex items-center gap-2">
				<span className="font-mono text-sm font-medium text-stone-900 dark:text-stone-100">
					{value}
				</span>
				{badge && (
					<Badge variant={badgeVariant} size="sm">
						{badge}
					</Badge>
				)}
			</div>
		</div>
	);
});

/**
 * Valuation Section
 */
const ValuationSection = memo(function ValuationSection({ data }: { data: ValueIndicators }) {
	return (
		<div className="space-y-1">
			<h4 className="text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide mb-2">
				Valuation
			</h4>

			<div className="bg-stone-50 dark:bg-stone-800/50 rounded-lg p-3">
				<IndicatorRow
					label="P/E (TTM)"
					value={formatRatio(data.pe_ratio_ttm)}
					badge={
						data.pe_ratio_ttm !== null
							? data.pe_ratio_ttm < 0
								? "Loss"
								: data.pe_ratio_ttm < 15
									? "Value"
									: data.pe_ratio_ttm < 25
										? "Fair"
										: data.pe_ratio_ttm < 40
											? "Growth"
											: "Premium"
							: undefined
					}
					badgeVariant={getPEVariant(data.pe_ratio_ttm)}
				/>

				<IndicatorRow
					label="P/E (Forward)"
					value={formatRatio(data.pe_ratio_forward)}
					badge={
						data.pe_ratio_forward !== null && data.pe_ratio_ttm !== null
							? data.pe_ratio_forward < data.pe_ratio_ttm
								? "Improving"
								: "Declining"
							: undefined
					}
					badgeVariant={
						data.pe_ratio_forward !== null && data.pe_ratio_ttm !== null
							? data.pe_ratio_forward < data.pe_ratio_ttm
								? "success"
								: "warning"
							: "neutral"
					}
				/>

				<IndicatorRow label="P/B Ratio" value={formatRatio(data.pb_ratio)} />

				<IndicatorRow label="EV/EBITDA" value={formatRatio(data.ev_ebitda)} />

				<IndicatorRow
					label="CAPE (10yr)"
					value={formatRatio(data.cape_10yr)}
					badge={
						data.cape_10yr !== null
							? data.cape_10yr < 15
								? "Undervalued"
								: data.cape_10yr < 25
									? "Fair"
									: "Overvalued"
							: undefined
					}
					badgeVariant={
						data.cape_10yr !== null
							? data.cape_10yr < 15
								? "success"
								: data.cape_10yr < 25
									? "info"
									: "error"
							: "neutral"
					}
				/>
			</div>
		</div>
	);
});

/**
 * Yields Section
 */
const YieldsSection = memo(function YieldsSection({ data }: { data: ValueIndicators }) {
	return (
		<div className="space-y-1">
			<h4 className="text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide mb-2">
				Yields
			</h4>

			<div className="grid grid-cols-2 gap-3">
				{/* Earnings Yield */}
				<div className="bg-stone-50 dark:bg-stone-800/50 rounded-lg p-3 text-center">
					<div className="text-lg font-mono font-semibold text-stone-900 dark:text-stone-100">
						{formatPercent(data.earnings_yield)}
					</div>
					<div className="text-xs text-stone-500 dark:text-stone-400">Earnings Yield</div>
					{data.earnings_yield !== null && (
						<div className="mt-1 text-xs text-stone-400">(1/P/E)</div>
					)}
				</div>

				{/* Dividend Yield */}
				<div className="bg-stone-50 dark:bg-stone-800/50 rounded-lg p-3 text-center">
					<div className="text-lg font-mono font-semibold text-stone-900 dark:text-stone-100">
						{formatPercent(data.dividend_yield)}
					</div>
					<div className="text-xs text-stone-500 dark:text-stone-400">Dividend Yield</div>
					{data.dividend_yield !== null && data.dividend_yield > 0.04 && (
						<Badge variant="success" size="sm" className="mt-1">
							High Yield
						</Badge>
					)}
				</div>
			</div>
		</div>
	);
});

/**
 * Profitability Section
 */
const ProfitabilitySection = memo(function ProfitabilitySection({
	data,
}: {
	data: QualityIndicators;
}) {
	return (
		<div className="space-y-1">
			<h4 className="text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide mb-2">
				Profitability
			</h4>

			<div className="bg-stone-50 dark:bg-stone-800/50 rounded-lg p-3">
				<IndicatorRow
					label="Gross Profitability"
					value={formatPercent(data.gross_profitability)}
					badge={
						data.gross_profitability !== null
							? data.gross_profitability > 0.33
								? "Strong"
								: data.gross_profitability > 0.2
									? "Good"
									: "Weak"
							: undefined
					}
					badgeVariant={
						data.gross_profitability !== null
							? data.gross_profitability > 0.33
								? "success"
								: data.gross_profitability > 0.2
									? "info"
									: "warning"
							: "neutral"
					}
				/>

				<IndicatorRow
					label="Return on Equity (ROE)"
					value={formatPercent(data.roe)}
					badge={
						data.roe !== null
							? data.roe < 0
								? "Loss"
								: data.roe > 0.2
									? "Excellent"
									: data.roe > 0.15
										? "Good"
										: data.roe > 0.08
											? "Fair"
											: "Weak"
							: undefined
					}
					badgeVariant={getROEVariant(data.roe)}
				/>

				<IndicatorRow
					label="Return on Assets (ROA)"
					value={formatPercent(data.roa)}
					badge={
						data.roa !== null
							? data.roa < 0
								? "Loss"
								: data.roa > 0.1
									? "Excellent"
									: data.roa > 0.05
										? "Good"
										: "Weak"
							: undefined
					}
					badgeVariant={
						data.roa !== null
							? data.roa < 0
								? "error"
								: data.roa > 0.1
									? "success"
									: data.roa > 0.05
										? "info"
										: "warning"
							: "neutral"
					}
				/>
			</div>
		</div>
	);
});

/**
 * Quality Factors Section
 */
const QualitySection = memo(function QualitySection({ data }: { data: QualityIndicators }) {
	return (
		<div className="space-y-1">
			<div className="flex items-center justify-between mb-2">
				<h4 className="text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide">
					Quality Factors
				</h4>
				{data.earnings_quality && (
					<Badge variant={getQualityVariant(data.earnings_quality)} size="sm">
						{data.earnings_quality} Quality
					</Badge>
				)}
			</div>

			<div className="bg-stone-50 dark:bg-stone-800/50 rounded-lg p-3">
				<IndicatorRow
					label="Asset Growth"
					value={formatPercent(data.asset_growth)}
					badge={
						data.asset_growth !== null
							? data.asset_growth > 0.2
								? "High"
								: data.asset_growth > 0.05
									? "Moderate"
									: "Low"
							: undefined
					}
					badgeVariant={
						data.asset_growth !== null
							? data.asset_growth > 0.2
								? "warning" // High growth can dilute returns
								: data.asset_growth > 0.05
									? "info"
									: "success"
							: "neutral"
					}
				/>

				<IndicatorRow
					label="Accruals Ratio"
					value={formatPercent(data.accruals_ratio)}
					badge={
						data.accruals_ratio !== null
							? Math.abs(data.accruals_ratio) < 0.05
								? "Low"
								: Math.abs(data.accruals_ratio) < 0.1
									? "Moderate"
									: "High"
							: undefined
					}
					badgeVariant={getAccrualsVariant(data.accruals_ratio)}
				/>

				<IndicatorRow
					label="Cash Flow Quality"
					value={formatRatio(data.cash_flow_quality)}
					badge={
						data.cash_flow_quality !== null
							? data.cash_flow_quality > 1.1
								? "Strong"
								: data.cash_flow_quality > 0.8
									? "Good"
									: "Weak"
							: undefined
					}
					badgeVariant={
						data.cash_flow_quality !== null
							? data.cash_flow_quality > 1.1
								? "success"
								: data.cash_flow_quality > 0.8
									? "info"
									: "error"
							: "neutral"
					}
				/>

				<IndicatorRow
					label="Beneish M-Score"
					value={formatRatio(data.beneish_m_score)}
					badge={
						data.beneish_m_score !== null
							? data.beneish_m_score < -2.22
								? "Safe"
								: data.beneish_m_score < -1.78
									? "Gray Zone"
									: "Risk"
							: undefined
					}
					badgeVariant={getMScoreVariant(data.beneish_m_score)}
				/>
			</div>
		</div>
	);
});

// ============================================
// Loading Skeleton
// ============================================

function FundamentalsIndicatorsSkeleton() {
	return (
		<Card className="p-4 space-y-4 animate-pulse">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="h-5 w-40 bg-stone-200 dark:bg-stone-700 rounded" />
				<div className="h-4 w-24 bg-stone-200 dark:bg-stone-700 rounded" />
			</div>

			{/* Sections */}
			{[1, 2, 3, 4].map((i) => (
				<div key={i} className="space-y-2">
					<div className="h-3 w-24 bg-stone-200 dark:bg-stone-700 rounded" />
					<div className="bg-stone-100 dark:bg-stone-800 rounded-lg p-3 space-y-3">
						{[1, 2, 3].map((j) => (
							<div key={j} className="flex justify-between">
								<div className="h-4 w-24 bg-stone-200 dark:bg-stone-700 rounded" />
								<div className="h-4 w-16 bg-stone-200 dark:bg-stone-700 rounded" />
							</div>
						))}
					</div>
				</div>
			))}
		</Card>
	);
}

// ============================================
// Main Component
// ============================================

/**
 * FundamentalsIndicators widget displays fundamental analysis metrics.
 *
 * Features:
 * - Valuation ratios (P/E, P/B, EV/EBITDA, CAPE)
 * - Yields (earnings yield, dividend yield)
 * - Profitability metrics (ROE, ROA, Gross Profitability)
 * - Quality factors (accruals, cash flow quality, M-Score)
 * - Interpretive badges for each metric
 *
 * @example
 * ```tsx
 * <FundamentalsIndicators
 *   value={snapshot.value}
 *   quality={snapshot.quality}
 * />
 * ```
 */
export const FundamentalsIndicators = memo(function FundamentalsIndicators({
	value,
	quality,
	isLoading = false,
	lastUpdate,
	className = "",
}: FundamentalsIndicatorsProps) {
	if (isLoading) {
		return <FundamentalsIndicatorsSkeleton />;
	}

	if (!value && !quality) {
		return (
			<Card className={`p-4 ${className}`}>
				<div className="text-center text-stone-500 dark:text-stone-400 py-8">
					No fundamentals data available
				</div>
			</Card>
		);
	}

	return (
		<Card className={`p-4 ${className}`}>
			{/* Header */}
			<div className="flex items-center justify-between mb-4">
				<h3 className="text-base font-semibold text-stone-900 dark:text-stone-100">
					Fundamental Analysis
				</h3>
				{lastUpdate && (
					<span className="text-xs text-stone-500 dark:text-stone-400">
						{new Date(lastUpdate).toLocaleDateString()}
					</span>
				)}
			</div>

			{/* Indicator Sections */}
			<div className="space-y-4">
				{value && <ValuationSection data={value} />}

				{value && (
					<div className="border-t border-stone-200 dark:border-stone-700 pt-4">
						<YieldsSection data={value} />
					</div>
				)}

				{quality && (
					<div className="border-t border-stone-200 dark:border-stone-700 pt-4">
						<ProfitabilitySection data={quality} />
					</div>
				)}

				{quality && (
					<div className="border-t border-stone-200 dark:border-stone-700 pt-4">
						<QualitySection data={quality} />
					</div>
				)}
			</div>
		</Card>
	);
});

// ============================================
// Exports
// ============================================

export default FundamentalsIndicators;
