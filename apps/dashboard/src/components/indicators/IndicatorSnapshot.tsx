"use client";

/**
 * IndicatorSnapshot Display Component
 *
 * Main component showing all indicator categories in organized layout
 * with collapsible sections. Implements "Layered Revelation" pattern.
 *
 * @see docs/plans/ui/20-design-philosophy.md
 * @see docs/plans/ui/24-components.md
 */

import { formatDistanceToNow } from "date-fns";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/collapsible";
import { Card } from "@/components/ui/surface";

// ============================================
// Types
// ============================================

export interface PriceIndicators {
	rsi_14: number | null;
	atr_14: number | null;
	sma_20: number | null;
	sma_50: number | null;
	sma_200: number | null;
	ema_9: number | null;
	ema_12: number | null;
	ema_21: number | null;
	ema_26: number | null;
	macd_line: number | null;
	macd_signal: number | null;
	macd_histogram: number | null;
	bollinger_upper: number | null;
	bollinger_middle: number | null;
	bollinger_lower: number | null;
	bollinger_bandwidth: number | null;
	bollinger_percentb: number | null;
	stochastic_k: number | null;
	stochastic_d: number | null;
	momentum_1m: number | null;
	momentum_3m: number | null;
	momentum_6m: number | null;
	momentum_12m: number | null;
	realized_vol_20d: number | null;
	parkinson_vol_20d: number | null;
}

export interface LiquidityIndicators {
	bid_ask_spread: number | null;
	bid_ask_spread_pct: number | null;
	amihud_illiquidity: number | null;
	vwap: number | null;
	turnover_ratio: number | null;
	volume_ratio: number | null;
}

export interface OptionsIndicators {
	atm_iv: number | null;
	iv_skew_25d: number | null;
	iv_put_25d: number | null;
	iv_call_25d: number | null;
	put_call_ratio_volume: number | null;
	put_call_ratio_oi: number | null;
	term_structure_slope: number | null;
	front_month_iv: number | null;
	back_month_iv: number | null;
	vrp: number | null;
	realized_vol_20d: number | null;
	net_delta: number | null;
	net_gamma: number | null;
	net_theta: number | null;
	net_vega: number | null;
}

export interface ValueIndicators {
	pe_ratio_ttm: number | null;
	pe_ratio_forward: number | null;
	pb_ratio: number | null;
	ev_ebitda: number | null;
	earnings_yield: number | null;
	dividend_yield: number | null;
	cape_10yr: number | null;
}

export interface QualityIndicators {
	gross_profitability: number | null;
	roe: number | null;
	roa: number | null;
	asset_growth: number | null;
	accruals_ratio: number | null;
	cash_flow_quality: number | null;
	beneish_m_score: number | null;
	earnings_quality: "HIGH" | "MEDIUM" | "LOW" | null;
}

export interface ShortInterestIndicators {
	short_interest_ratio: number | null;
	days_to_cover: number | null;
	short_pct_float: number | null;
	short_interest_change: number | null;
	settlement_date: string | null;
}

export interface SentimentIndicators {
	overall_score: number | null;
	sentiment_strength: number | null;
	news_volume: number | null;
	sentiment_momentum: number | null;
	event_risk: boolean | null;
	classification: "STRONG_BULLISH" | "BULLISH" | "NEUTRAL" | "BEARISH" | "STRONG_BEARISH" | null;
}

export interface CorporateIndicators {
	trailing_dividend_yield: number | null;
	ex_dividend_days: number | null;
	upcoming_earnings_days: number | null;
	recent_split: boolean | null;
}

export interface MarketContext {
	sector: string | null;
	industry: string | null;
	market_cap: number | null;
	market_cap_category: "MEGA" | "LARGE" | "MID" | "SMALL" | "MICRO" | null;
}

export interface SnapshotMetadata {
	price_updated_at: number;
	fundamentals_date: string | null;
	short_interest_date: string | null;
	sentiment_date: string | null;
	data_quality: "COMPLETE" | "PARTIAL" | "STALE";
	missing_fields: string[];
}

export interface IndicatorSnapshotData {
	symbol: string;
	timestamp: number;
	price: PriceIndicators;
	liquidity: LiquidityIndicators;
	options: OptionsIndicators;
	value: ValueIndicators;
	quality: QualityIndicators;
	short_interest: ShortInterestIndicators;
	sentiment: SentimentIndicators;
	corporate: CorporateIndicators;
	market: MarketContext;
	metadata: SnapshotMetadata;
}

export interface IndicatorSnapshotProps {
	snapshot: IndicatorSnapshotData | null | undefined;
	isLoading?: boolean;
	defaultExpanded?: string[];
}

// ============================================
// Utility Functions
// ============================================

function formatNumber(value: number | null, decimals = 2): string {
	if (value === null || value === undefined) {
		return "—";
	}
	return value.toFixed(decimals);
}

function formatPercent(value: number | null): string {
	if (value === null || value === undefined) {
		return "—";
	}
	return `${(value * 100).toFixed(2)}%`;
}

function formatLargeNumber(value: number | null): string {
	if (value === null || value === undefined) {
		return "—";
	}
	if (value >= 1e12) {
		return `$${(value / 1e12).toFixed(1)}T`;
	}
	if (value >= 1e9) {
		return `$${(value / 1e9).toFixed(1)}B`;
	}
	if (value >= 1e6) {
		return `$${(value / 1e6).toFixed(1)}M`;
	}
	return `$${value.toFixed(0)}`;
}

function getDataQualityColor(quality: SnapshotMetadata["data_quality"]): string {
	switch (quality) {
		case "COMPLETE":
			return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
		case "PARTIAL":
			return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
		case "STALE":
			return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
		default:
			return "bg-stone-100 text-stone-700 dark:bg-stone-900/30 dark:text-stone-400";
	}
}

function getSentimentColor(classification: SentimentIndicators["classification"]): string {
	switch (classification) {
		case "STRONG_BULLISH":
			return "text-green-600 dark:text-green-400";
		case "BULLISH":
			return "text-green-500 dark:text-green-500";
		case "NEUTRAL":
			return "text-stone-500 dark:text-stone-400";
		case "BEARISH":
			return "text-red-500 dark:text-red-500";
		case "STRONG_BEARISH":
			return "text-red-600 dark:text-red-400";
		default:
			return "text-stone-400";
	}
}

// ============================================
// Sub-Components
// ============================================

interface IndicatorRowProps {
	label: string;
	value: string;
	subtext?: string;
	highlight?: boolean;
}

function IndicatorRow({ label, value, subtext, highlight = false }: IndicatorRowProps) {
	return (
		<div className="flex items-center justify-between py-1.5 border-b border-stone-100 dark:border-stone-800 last:border-0">
			<span className="text-sm text-stone-600 dark:text-stone-400">{label}</span>
			<div className="text-right">
				<span
					className={`font-mono text-sm ${
						highlight ? "text-primary font-medium" : "text-stone-900 dark:text-stone-100"
					}`}
				>
					{value}
				</span>
				{subtext && (
					<span className="block text-xs text-stone-400 dark:text-stone-500">{subtext}</span>
				)}
			</div>
		</div>
	);
}

interface SectionSummaryProps {
	populated: number;
	total: number;
	label?: string;
}

function SectionSummary({ populated, total, label = "fields" }: SectionSummaryProps) {
	const percentage = total > 0 ? Math.round((populated / total) * 100) : 0;
	return (
		<span className="text-xs text-stone-400 dark:text-stone-500 ml-2">
			{populated}/{total} {label} ({percentage}%)
		</span>
	);
}

// ============================================
// Section Components
// ============================================

function PriceSection({ data }: { data: PriceIndicators }) {
	const populated = Object.values(data).filter((v) => v !== null).length;
	const total = Object.keys(data).length;

	return (
		<AccordionItem value="price">
			<AccordionTrigger className="text-base font-medium">
				<div className="flex items-center">
					<span>Price Indicators</span>
					<SectionSummary populated={populated} total={total} />
				</div>
			</AccordionTrigger>
			<AccordionContent>
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8">
					<div>
						<h4 className="text-xs font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wide mb-2">
							Momentum
						</h4>
						<IndicatorRow label="RSI (14)" value={formatNumber(data.rsi_14)} highlight />
						<IndicatorRow label="Stochastic %K" value={formatNumber(data.stochastic_k)} />
						<IndicatorRow label="Stochastic %D" value={formatNumber(data.stochastic_d)} />
						<IndicatorRow label="1M Return" value={formatPercent(data.momentum_1m)} />
						<IndicatorRow label="3M Return" value={formatPercent(data.momentum_3m)} />
						<IndicatorRow label="12M Return" value={formatPercent(data.momentum_12m)} />
					</div>
					<div>
						<h4 className="text-xs font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wide mb-2">
							Trend (Moving Averages)
						</h4>
						<IndicatorRow label="SMA 20" value={formatNumber(data.sma_20)} />
						<IndicatorRow label="SMA 50" value={formatNumber(data.sma_50)} highlight />
						<IndicatorRow label="SMA 200" value={formatNumber(data.sma_200)} highlight />
						<IndicatorRow label="EMA 9" value={formatNumber(data.ema_9)} />
						<IndicatorRow label="EMA 21" value={formatNumber(data.ema_21)} />
					</div>
					<div>
						<h4 className="text-xs font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wide mb-2">
							MACD
						</h4>
						<IndicatorRow label="MACD Line" value={formatNumber(data.macd_line)} />
						<IndicatorRow label="Signal Line" value={formatNumber(data.macd_signal)} />
						<IndicatorRow label="Histogram" value={formatNumber(data.macd_histogram)} highlight />
					</div>
					<div>
						<h4 className="text-xs font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wide mb-2 mt-4 md:mt-0">
							Bollinger Bands
						</h4>
						<IndicatorRow label="Upper" value={formatNumber(data.bollinger_upper)} />
						<IndicatorRow label="Middle" value={formatNumber(data.bollinger_middle)} />
						<IndicatorRow label="Lower" value={formatNumber(data.bollinger_lower)} />
						<IndicatorRow
							label="Bandwidth"
							value={formatPercent(data.bollinger_bandwidth)}
							highlight
						/>
					</div>
					<div>
						<h4 className="text-xs font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wide mb-2 mt-4 md:mt-0">
							Volatility
						</h4>
						<IndicatorRow label="ATR (14)" value={formatNumber(data.atr_14)} highlight />
						<IndicatorRow label="Realized Vol 20d" value={formatPercent(data.realized_vol_20d)} />
						<IndicatorRow label="Parkinson Vol 20d" value={formatPercent(data.parkinson_vol_20d)} />
					</div>
				</div>
			</AccordionContent>
		</AccordionItem>
	);
}

function LiquiditySection({ data }: { data: LiquidityIndicators }) {
	const populated = Object.values(data).filter((v) => v !== null).length;
	const total = Object.keys(data).length;

	return (
		<AccordionItem value="liquidity">
			<AccordionTrigger className="text-base font-medium">
				<div className="flex items-center">
					<span>Liquidity</span>
					<SectionSummary populated={populated} total={total} />
				</div>
			</AccordionTrigger>
			<AccordionContent>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
					<div>
						<IndicatorRow
							label="Bid-Ask Spread"
							value={formatNumber(data.bid_ask_spread, 4)}
							subtext={
								data.bid_ask_spread_pct ? `${formatPercent(data.bid_ask_spread_pct)}` : undefined
							}
							highlight
						/>
						<IndicatorRow label="VWAP" value={formatNumber(data.vwap)} />
						<IndicatorRow label="Volume Ratio" value={formatNumber(data.volume_ratio)} />
					</div>
					<div>
						<IndicatorRow
							label="Amihud Illiquidity"
							value={formatNumber(data.amihud_illiquidity, 6)}
						/>
						<IndicatorRow label="Turnover Ratio" value={formatPercent(data.turnover_ratio)} />
					</div>
				</div>
			</AccordionContent>
		</AccordionItem>
	);
}

function OptionsSection({ data }: { data: OptionsIndicators }) {
	const populated = Object.values(data).filter((v) => v !== null).length;
	const total = Object.keys(data).length;

	return (
		<AccordionItem value="options">
			<AccordionTrigger className="text-base font-medium">
				<div className="flex items-center">
					<span>Options-Derived</span>
					<SectionSummary populated={populated} total={total} />
				</div>
			</AccordionTrigger>
			<AccordionContent>
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8">
					<div>
						<h4 className="text-xs font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wide mb-2">
							Implied Volatility
						</h4>
						<IndicatorRow label="ATM IV" value={formatPercent(data.atm_iv)} highlight />
						<IndicatorRow label="25-Delta Skew" value={formatPercent(data.iv_skew_25d)} />
						<IndicatorRow label="Put IV (25d)" value={formatPercent(data.iv_put_25d)} />
						<IndicatorRow label="Call IV (25d)" value={formatPercent(data.iv_call_25d)} />
					</div>
					<div>
						<h4 className="text-xs font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wide mb-2">
							Put/Call Ratios
						</h4>
						<IndicatorRow
							label="P/C Volume"
							value={formatNumber(data.put_call_ratio_volume)}
							highlight
						/>
						<IndicatorRow label="P/C Open Interest" value={formatNumber(data.put_call_ratio_oi)} />
						<h4 className="text-xs font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wide mb-2 mt-4">
							Term Structure
						</h4>
						<IndicatorRow label="Slope" value={formatNumber(data.term_structure_slope, 4)} />
						<IndicatorRow label="Front Month IV" value={formatPercent(data.front_month_iv)} />
						<IndicatorRow label="Back Month IV" value={formatPercent(data.back_month_iv)} />
					</div>
					<div>
						<h4 className="text-xs font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wide mb-2">
							Volatility Risk Premium
						</h4>
						<IndicatorRow label="VRP" value={formatPercent(data.vrp)} highlight />
						<IndicatorRow label="Realized Vol 20d" value={formatPercent(data.realized_vol_20d)} />
						<h4 className="text-xs font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wide mb-2 mt-4">
							Net Greeks
						</h4>
						<IndicatorRow label="Delta" value={formatNumber(data.net_delta)} />
						<IndicatorRow label="Gamma" value={formatNumber(data.net_gamma, 4)} />
						<IndicatorRow label="Theta" value={formatNumber(data.net_theta)} />
						<IndicatorRow label="Vega" value={formatNumber(data.net_vega)} />
					</div>
				</div>
			</AccordionContent>
		</AccordionItem>
	);
}

function ValueSection({ data }: { data: ValueIndicators }) {
	const populated = Object.values(data).filter((v) => v !== null).length;
	const total = Object.keys(data).length;

	return (
		<AccordionItem value="value">
			<AccordionTrigger className="text-base font-medium">
				<div className="flex items-center">
					<span>Value Factors</span>
					<SectionSummary populated={populated} total={total} />
				</div>
			</AccordionTrigger>
			<AccordionContent>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
					<div>
						<IndicatorRow label="P/E (TTM)" value={formatNumber(data.pe_ratio_ttm)} highlight />
						<IndicatorRow label="P/E (Forward)" value={formatNumber(data.pe_ratio_forward)} />
						<IndicatorRow label="P/B Ratio" value={formatNumber(data.pb_ratio)} />
						<IndicatorRow label="EV/EBITDA" value={formatNumber(data.ev_ebitda)} highlight />
					</div>
					<div>
						<IndicatorRow label="Earnings Yield" value={formatPercent(data.earnings_yield)} />
						<IndicatorRow label="Dividend Yield" value={formatPercent(data.dividend_yield)} />
						<IndicatorRow label="CAPE (10yr)" value={formatNumber(data.cape_10yr)} />
					</div>
				</div>
			</AccordionContent>
		</AccordionItem>
	);
}

function QualitySection({ data }: { data: QualityIndicators }) {
	const populated = Object.values(data).filter((v) => v !== null).length;
	const total = Object.keys(data).length;

	return (
		<AccordionItem value="quality">
			<AccordionTrigger className="text-base font-medium">
				<div className="flex items-center">
					<span>Quality Factors</span>
					<SectionSummary populated={populated} total={total} />
				</div>
			</AccordionTrigger>
			<AccordionContent>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
					<div>
						<IndicatorRow
							label="Gross Profitability"
							value={formatPercent(data.gross_profitability)}
							highlight
						/>
						<IndicatorRow label="ROE" value={formatPercent(data.roe)} highlight />
						<IndicatorRow label="ROA" value={formatPercent(data.roa)} />
						<IndicatorRow label="Asset Growth" value={formatPercent(data.asset_growth)} />
					</div>
					<div>
						<IndicatorRow label="Accruals Ratio" value={formatPercent(data.accruals_ratio)} />
						<IndicatorRow label="Cash Flow Quality" value={formatNumber(data.cash_flow_quality)} />
						<IndicatorRow label="Beneish M-Score" value={formatNumber(data.beneish_m_score)} />
						<IndicatorRow
							label="Earnings Quality"
							value={data.earnings_quality ?? "—"}
							highlight={data.earnings_quality === "HIGH"}
						/>
					</div>
				</div>
			</AccordionContent>
		</AccordionItem>
	);
}

function ShortInterestSection({ data }: { data: ShortInterestIndicators }) {
	const populated = Object.values(data).filter((v) => v !== null).length;
	const total = Object.keys(data).length;

	return (
		<AccordionItem value="short_interest">
			<AccordionTrigger className="text-base font-medium">
				<div className="flex items-center">
					<span>Short Interest</span>
					<SectionSummary populated={populated} total={total} />
				</div>
			</AccordionTrigger>
			<AccordionContent>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
					<div>
						<IndicatorRow
							label="Short Interest Ratio"
							value={formatNumber(data.short_interest_ratio)}
							highlight
						/>
						<IndicatorRow label="Days to Cover" value={formatNumber(data.days_to_cover, 1)} />
						<IndicatorRow
							label="Short % Float"
							value={formatPercent(data.short_pct_float)}
							highlight
						/>
					</div>
					<div>
						<IndicatorRow
							label="Short Interest Change"
							value={formatPercent(data.short_interest_change)}
						/>
						<IndicatorRow label="Settlement Date" value={data.settlement_date ?? "—"} />
					</div>
				</div>
			</AccordionContent>
		</AccordionItem>
	);
}

function SentimentSection({ data }: { data: SentimentIndicators }) {
	const populated = Object.values(data).filter((v) => v !== null).length;
	const total = Object.keys(data).length;

	return (
		<AccordionItem value="sentiment">
			<AccordionTrigger className="text-base font-medium">
				<div className="flex items-center">
					<span>Sentiment</span>
					<SectionSummary populated={populated} total={total} />
					{data.classification && (
						<Badge variant="neutral" className={`ml-2 ${getSentimentColor(data.classification)}`}>
							{data.classification.replace("_", " ")}
						</Badge>
					)}
				</div>
			</AccordionTrigger>
			<AccordionContent>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
					<div>
						<IndicatorRow
							label="Overall Score"
							value={formatNumber(data.overall_score)}
							highlight
						/>
						<IndicatorRow
							label="Sentiment Strength"
							value={formatNumber(data.sentiment_strength)}
						/>
						<IndicatorRow
							label="Sentiment Momentum"
							value={formatNumber(data.sentiment_momentum)}
						/>
					</div>
					<div>
						<IndicatorRow label="News Volume" value={formatNumber(data.news_volume, 0)} />
						<IndicatorRow
							label="Event Risk"
							value={data.event_risk === null ? "—" : data.event_risk ? "Yes" : "No"}
							highlight={data.event_risk === true}
						/>
					</div>
				</div>
			</AccordionContent>
		</AccordionItem>
	);
}

function CorporateSection({ data }: { data: CorporateIndicators }) {
	const populated = Object.values(data).filter((v) => v !== null).length;
	const total = Object.keys(data).length;

	return (
		<AccordionItem value="corporate">
			<AccordionTrigger className="text-base font-medium">
				<div className="flex items-center">
					<span>Corporate Actions</span>
					<SectionSummary populated={populated} total={total} />
				</div>
			</AccordionTrigger>
			<AccordionContent>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
					<div>
						<IndicatorRow
							label="Trailing Dividend Yield"
							value={formatPercent(data.trailing_dividend_yield)}
							highlight
						/>
						<IndicatorRow
							label="Ex-Dividend Days"
							value={data.ex_dividend_days !== null ? `${data.ex_dividend_days} days` : "—"}
						/>
					</div>
					<div>
						<IndicatorRow
							label="Earnings Days"
							value={
								data.upcoming_earnings_days !== null ? `${data.upcoming_earnings_days} days` : "—"
							}
							highlight={data.upcoming_earnings_days !== null && data.upcoming_earnings_days <= 7}
						/>
						<IndicatorRow
							label="Recent Split"
							value={data.recent_split === null ? "—" : data.recent_split ? "Yes" : "No"}
						/>
					</div>
				</div>
			</AccordionContent>
		</AccordionItem>
	);
}

// ============================================
// Loading State
// ============================================

function LoadingSkeleton() {
	return (
		<Card elevation={1} padding="none" className="overflow-hidden">
			<div className="p-4 border-b border-stone-200 dark:border-stone-700">
				<div className="h-6 w-48 bg-stone-100 dark:bg-stone-800 rounded animate-pulse" />
				<div className="mt-2 flex gap-2">
					<div className="h-5 w-20 bg-stone-100 dark:bg-stone-800 rounded animate-pulse" />
					<div className="h-5 w-24 bg-stone-100 dark:bg-stone-800 rounded animate-pulse" />
				</div>
			</div>
			<div className="divide-y divide-stone-200 dark:divide-stone-700">
				{[1, 2, 3, 4, 5].map((i) => (
					<div key={i} className="p-4">
						<div className="h-5 w-32 bg-stone-100 dark:bg-stone-800 rounded animate-pulse" />
					</div>
				))}
			</div>
		</Card>
	);
}

// ============================================
// Main Component
// ============================================

export function IndicatorSnapshot({
	snapshot,
	isLoading = false,
	defaultExpanded = ["price"],
}: IndicatorSnapshotProps) {
	const [expandedSections, setExpandedSections] = useState<string[]>(defaultExpanded);

	const handleValueChange = (value: string | string[]) => {
		if (Array.isArray(value)) {
			setExpandedSections(value);
		} else {
			setExpandedSections([value]);
		}
	};

	const lastUpdated = useMemo(() => {
		if (!snapshot?.metadata.price_updated_at) {
			return null;
		}
		try {
			return formatDistanceToNow(new Date(snapshot.metadata.price_updated_at), {
				addSuffix: true,
			});
		} catch {
			return null;
		}
	}, [snapshot?.metadata.price_updated_at]);

	if (isLoading) {
		return <LoadingSkeleton />;
	}

	if (!snapshot) {
		return (
			<Card elevation={1} padding="lg" className="text-center">
				<p className="text-stone-500 dark:text-stone-400">No indicator data available</p>
			</Card>
		);
	}

	return (
		<Card elevation={1} padding="none" className="overflow-hidden">
			{/* Header */}
			<div className="p-4 border-b border-stone-200 dark:border-stone-700">
				<div className="flex items-center justify-between">
					<div>
						<h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
							{snapshot.symbol}
							<span className="ml-2 text-sm font-normal text-stone-500 dark:text-stone-400">
								Indicator Snapshot
							</span>
						</h2>
						<div className="mt-1 flex items-center gap-2 flex-wrap">
							{snapshot.market.sector && (
								<Badge variant="neutral" className="text-xs">
									{snapshot.market.sector}
								</Badge>
							)}
							{snapshot.market.industry && (
								<Badge variant="neutral" className="text-xs">
									{snapshot.market.industry}
								</Badge>
							)}
							{snapshot.market.market_cap && (
								<span className="text-xs text-stone-500 dark:text-stone-400">
									Market Cap: {formatLargeNumber(snapshot.market.market_cap)}
								</span>
							)}
						</div>
					</div>
					<div className="text-right">
						<Badge className={getDataQualityColor(snapshot.metadata.data_quality)}>
							{snapshot.metadata.data_quality}
						</Badge>
						{lastUpdated && (
							<p className="mt-1 text-xs text-stone-400 dark:text-stone-500">
								Updated {lastUpdated}
							</p>
						)}
					</div>
				</div>
			</div>

			{/* Accordion Sections */}
			<Accordion
				type="multiple"
				value={expandedSections}
				onValueChange={handleValueChange}
				className="divide-y divide-stone-200 dark:divide-stone-700"
			>
				<div className="px-4">
					<PriceSection data={snapshot.price} />
					<LiquiditySection data={snapshot.liquidity} />
					<OptionsSection data={snapshot.options} />
					<ValueSection data={snapshot.value} />
					<QualitySection data={snapshot.quality} />
					<ShortInterestSection data={snapshot.short_interest} />
					<SentimentSection data={snapshot.sentiment} />
					<CorporateSection data={snapshot.corporate} />
				</div>
			</Accordion>

			{/* Footer */}
			{snapshot.metadata.missing_fields.length > 0 && (
				<div className="p-3 bg-stone-50 dark:bg-stone-800/50 border-t border-stone-200 dark:border-stone-700">
					<p className="text-xs text-stone-500 dark:text-stone-400">
						<span className="font-medium">Missing data:</span>{" "}
						{snapshot.metadata.missing_fields.join(", ")}
					</p>
				</div>
			)}
		</Card>
	);
}

export default IndicatorSnapshot;
