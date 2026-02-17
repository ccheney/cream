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

type IndicatorBadgeVariant = "success" | "info" | "warning" | "error" | "neutral";

interface IndicatorMetric {
	label: string;
	value: string;
	badge?: string;
	badgeVariant?: IndicatorBadgeVariant;
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
function getPEVariant(value: number | null): IndicatorBadgeVariant {
	if (value === null) {
		return "neutral";
	}
	if (value < 0) {
		return "error";
	}
	if (value < 15) {
		return "success";
	}
	if (value < 25) {
		return "info";
	}
	if (value < 40) {
		return "warning";
	}
	return "error";
}

/**
 * Get ROE variant based on value
 */
function getROEVariant(value: number | null): IndicatorBadgeVariant {
	if (value === null) {
		return "neutral";
	}
	if (value < 0) {
		return "error";
	}
	if (value < 0.08) {
		return "warning";
	}
	if (value < 0.15) {
		return "info";
	}
	return "success";
}

/**
 * Get quality score badge variant
 */
function getQualityVariant(quality: "HIGH" | "MEDIUM" | "LOW" | null): IndicatorBadgeVariant {
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
function getMScoreVariant(value: number | null): IndicatorBadgeVariant {
	if (value === null) {
		return "neutral";
	}
	if (value < -2.22) {
		return "success";
	}
	if (value < -1.78) {
		return "info";
	}
	return "error";
}

/**
 * Get accruals ratio interpretation
 * High accruals = lower earnings quality
 */
function getAccrualsVariant(value: number | null): IndicatorBadgeVariant {
	if (value === null) {
		return "neutral";
	}
	const absValue = Math.abs(value);
	if (absValue < 0.05) {
		return "success";
	}
	if (absValue < 0.1) {
		return "info";
	}
	if (absValue < 0.15) {
		return "warning";
	}
	return "error";
}

function getPEBadge(value: number | null): string | undefined {
	if (value === null) {
		return undefined;
	}
	if (value < 0) {
		return "Loss";
	}
	if (value < 15) {
		return "Value";
	}
	if (value < 25) {
		return "Fair";
	}
	if (value < 40) {
		return "Growth";
	}
	return "Premium";
}

function getForwardPETrend(
	value: ValueIndicators,
): Pick<IndicatorMetric, "badge" | "badgeVariant"> {
	if (value.pe_ratio_forward === null || value.pe_ratio_ttm === null) {
		return { badgeVariant: "neutral" };
	}
	const improving = value.pe_ratio_forward < value.pe_ratio_ttm;
	return {
		badge: improving ? "Improving" : "Declining",
		badgeVariant: improving ? "success" : "warning",
	};
}

function getCAPEMeta(cape: number | null): Pick<IndicatorMetric, "badge" | "badgeVariant"> {
	if (cape === null) {
		return { badgeVariant: "neutral" };
	}
	if (cape < 15) {
		return { badge: "Undervalued", badgeVariant: "success" };
	}
	if (cape < 25) {
		return { badge: "Fair", badgeVariant: "info" };
	}
	return { badge: "Overvalued", badgeVariant: "error" };
}

function getGrossProfitMeta(value: number | null): Pick<IndicatorMetric, "badge" | "badgeVariant"> {
	if (value === null) {
		return { badgeVariant: "neutral" };
	}
	if (value > 0.33) {
		return { badge: "Strong", badgeVariant: "success" };
	}
	if (value > 0.2) {
		return { badge: "Good", badgeVariant: "info" };
	}
	return { badge: "Weak", badgeVariant: "warning" };
}

function getROEMeta(value: number | null): Pick<IndicatorMetric, "badge" | "badgeVariant"> {
	if (value === null) {
		return { badgeVariant: "neutral" };
	}
	const badgeVariant = getROEVariant(value);
	if (value < 0) {
		return { badge: "Loss", badgeVariant };
	}
	if (value > 0.2) {
		return { badge: "Excellent", badgeVariant };
	}
	if (value > 0.15) {
		return { badge: "Good", badgeVariant };
	}
	if (value > 0.08) {
		return { badge: "Fair", badgeVariant };
	}
	return { badge: "Weak", badgeVariant };
}

function getROAMeta(value: number | null): Pick<IndicatorMetric, "badge" | "badgeVariant"> {
	if (value === null) {
		return { badgeVariant: "neutral" };
	}
	if (value < 0) {
		return { badge: "Loss", badgeVariant: "error" };
	}
	if (value > 0.1) {
		return { badge: "Excellent", badgeVariant: "success" };
	}
	if (value > 0.05) {
		return { badge: "Good", badgeVariant: "info" };
	}
	return { badge: "Weak", badgeVariant: "warning" };
}

function getAssetGrowthMeta(value: number | null): Pick<IndicatorMetric, "badge" | "badgeVariant"> {
	if (value === null) {
		return { badgeVariant: "neutral" };
	}
	if (value > 0.2) {
		return { badge: "High", badgeVariant: "warning" };
	}
	if (value > 0.05) {
		return { badge: "Moderate", badgeVariant: "info" };
	}
	return { badge: "Low", badgeVariant: "success" };
}

function getAccrualsMeta(value: number | null): Pick<IndicatorMetric, "badge" | "badgeVariant"> {
	if (value === null) {
		return { badgeVariant: "neutral" };
	}
	const absValue = Math.abs(value);
	if (absValue < 0.05) {
		return { badge: "Low", badgeVariant: "success" };
	}
	if (absValue < 0.1) {
		return { badge: "Moderate", badgeVariant: "info" };
	}
	return { badge: "High", badgeVariant: getAccrualsVariant(value) };
}

function getCashFlowMeta(value: number | null): Pick<IndicatorMetric, "badge" | "badgeVariant"> {
	if (value === null) {
		return { badgeVariant: "neutral" };
	}
	if (value > 1.1) {
		return { badge: "Strong", badgeVariant: "success" };
	}
	if (value > 0.8) {
		return { badge: "Good", badgeVariant: "info" };
	}
	return { badge: "Weak", badgeVariant: "error" };
}

function getMScoreMeta(value: number | null): Pick<IndicatorMetric, "badge" | "badgeVariant"> {
	if (value === null) {
		return { badgeVariant: "neutral" };
	}
	if (value < -2.22) {
		return { badge: "Safe", badgeVariant: getMScoreVariant(value) };
	}
	if (value < -1.78) {
		return { badge: "Gray Zone", badgeVariant: getMScoreVariant(value) };
	}
	return { badge: "Risk", badgeVariant: getMScoreVariant(value) };
}

function getValuationMetrics(data: ValueIndicators): IndicatorMetric[] {
	const forwardPE = getForwardPETrend(data);
	const cape = getCAPEMeta(data.cape_10yr);
	return [
		{
			label: "P/E (TTM)",
			value: formatRatio(data.pe_ratio_ttm),
			badge: getPEBadge(data.pe_ratio_ttm),
			badgeVariant: getPEVariant(data.pe_ratio_ttm),
		},
		{ label: "P/E (Forward)", value: formatRatio(data.pe_ratio_forward), ...forwardPE },
		{ label: "P/B Ratio", value: formatRatio(data.pb_ratio) },
		{ label: "EV/EBITDA", value: formatRatio(data.ev_ebitda) },
		{ label: "CAPE (10yr)", value: formatRatio(data.cape_10yr), ...cape },
	];
}

function getProfitabilityMetrics(data: QualityIndicators): IndicatorMetric[] {
	return [
		{
			label: "Gross Profitability",
			value: formatPercent(data.gross_profitability),
			...getGrossProfitMeta(data.gross_profitability),
		},
		{ label: "Return on Equity (ROE)", value: formatPercent(data.roe), ...getROEMeta(data.roe) },
		{ label: "Return on Assets (ROA)", value: formatPercent(data.roa), ...getROAMeta(data.roa) },
	];
}

function getQualityMetrics(data: QualityIndicators): IndicatorMetric[] {
	return [
		{
			label: "Asset Growth",
			value: formatPercent(data.asset_growth),
			...getAssetGrowthMeta(data.asset_growth),
		},
		{
			label: "Accruals Ratio",
			value: formatPercent(data.accruals_ratio),
			...getAccrualsMeta(data.accruals_ratio),
		},
		{
			label: "Cash Flow Quality",
			value: formatRatio(data.cash_flow_quality),
			...getCashFlowMeta(data.cash_flow_quality),
		},
		{
			label: "Beneish M-Score",
			value: formatRatio(data.beneish_m_score),
			...getMScoreMeta(data.beneish_m_score),
		},
	];
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
	badgeVariant?: IndicatorBadgeVariant;
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

function IndicatorList({ metrics }: { metrics: IndicatorMetric[] }) {
	return (
		<>
			{metrics.map((metric) => (
				<IndicatorRow
					key={metric.label}
					label={metric.label}
					value={metric.value}
					badge={metric.badge}
					badgeVariant={metric.badgeVariant}
				/>
			))}
		</>
	);
}

/**
 * Valuation Section
 */
const ValuationSection = memo(function ValuationSection({ data }: { data: ValueIndicators }) {
	const metrics = getValuationMetrics(data);
	return (
		<div className="space-y-1">
			<h4 className="text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide mb-2">
				Valuation
			</h4>
			<div className="bg-stone-50 dark:bg-stone-800/50 rounded-lg p-3">
				<IndicatorList metrics={metrics} />
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
	const metrics = getProfitabilityMetrics(data);
	return (
		<div className="space-y-1">
			<h4 className="text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide mb-2">
				Profitability
			</h4>
			<div className="bg-stone-50 dark:bg-stone-800/50 rounded-lg p-3">
				<IndicatorList metrics={metrics} />
			</div>
		</div>
	);
});

/**
 * Quality Factors Section
 */
const QualitySection = memo(function QualitySection({ data }: { data: QualityIndicators }) {
	const metrics = getQualityMetrics(data);
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
				<IndicatorList metrics={metrics} />
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
