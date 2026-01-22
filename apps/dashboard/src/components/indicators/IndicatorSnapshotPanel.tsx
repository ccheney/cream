/**
 * IndicatorSnapshotPanel Component
 *
 * Main component that orchestrates all indicator category panels.
 * Fetches data via useIndicatorSnapshot and renders appropriate panels.
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

"use client";

import { AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useIndicatorSnapshot } from "@/hooks/queries/useMarket";
import type { DataQuality } from "@/lib/api/types";
import { isOptionsMarketOpen } from "@/lib/market-hours";
import { cn } from "@/lib/utils";
import {
	CorporatePanel,
	LiquidityIndicatorsPanel,
	OptionsIndicatorsPanel,
	PriceIndicatorsPanel,
	QualityIndicatorsPanel,
	SentimentPanel,
	ShortInterestPanel,
	ValueIndicatorsPanel,
} from "./CategoryPanels";
import type { Freshness } from "./IndicatorSection";

export type IndicatorCategory =
	| "price"
	| "liquidity"
	| "options"
	| "value"
	| "quality"
	| "short_interest"
	| "sentiment"
	| "corporate";

export interface IndicatorSnapshotPanelProps {
	symbol: string;
	sections?: IndicatorCategory[];
	layout?: "full" | "compact";
	className?: string;
}

function getDataFreshness(updatedAt: number): Freshness {
	const now = Date.now();
	const ageMs = now - updatedAt;
	const ONE_MINUTE = 60 * 1000;
	const ONE_HOUR = 60 * ONE_MINUTE;

	if (ageMs < ONE_MINUTE) {
		return "live";
	}
	if (ageMs < ONE_HOUR) {
		return "recent";
	}
	return "stale";
}

function getBatchDataFreshness(date: string | null): Freshness {
	if (!date) {
		return "unavailable";
	}

	const dateMs = new Date(date).getTime();
	const now = Date.now();
	const ageMs = now - dateMs;
	const ONE_DAY = 24 * 60 * 60 * 1000;

	if (ageMs < ONE_DAY) {
		return "recent";
	}
	return "stale";
}

function DataQualityBadge({ quality }: { quality: DataQuality }) {
	const config: Record<DataQuality, { label: string; className: string }> = {
		COMPLETE: {
			label: "Complete",
			className: "bg-profit/10 text-profit border-profit/20",
		},
		PARTIAL: {
			label: "Partial",
			className: "bg-neutral/10 text-neutral border-neutral/20",
		},
		STALE: {
			label: "Stale",
			className:
				"bg-stone-100 text-stone-500 border-stone-200 dark:bg-night-700 dark:text-night-400 dark:border-night-600",
		},
	};

	const configEntry = config[quality] ?? config.PARTIAL;
	const { label, className } = configEntry;

	return (
		<span
			className={cn(
				"inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
				className,
			)}
		>
			{label}
		</span>
	);
}

const ALL_SECTIONS: IndicatorCategory[] = [
	"price",
	"liquidity",
	"options",
	"value",
	"quality",
	"short_interest",
	"sentiment",
	"corporate",
];

function IndicatorSectionSkeleton() {
	return (
		<div className="rounded-lg border border-cream-200 dark:border-night-700 bg-cream-50/50 dark:bg-night-800/50">
			{/* Header */}
			<div className="flex items-center justify-between px-4 py-3">
				<div className="flex items-center gap-2">
					<Skeleton width={20} height={20} />
					<Skeleton width={100} height={16} />
				</div>
				<Skeleton width={16} height={16} />
			</div>
			{/* Content */}
			<div className="border-t border-cream-200 dark:border-night-700 px-4 py-3">
				<div className="grid grid-cols-2 gap-3">
					{Array.from({ length: 6 }, (_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: Static skeleton count, index is stable
						<div key={i} className="space-y-1">
							<Skeleton width={60} height={12} />
							<Skeleton width={80} height={20} />
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

function IndicatorSnapshotSkeleton({
	sections,
	layout,
	className,
}: {
	sections: IndicatorCategory[];
	layout: "full" | "compact";
	className?: string;
}) {
	const sectionCount = Math.min(sections.length, 3);

	return (
		// biome-ignore lint/a11y/useSemanticElements: div with role="status" is appropriate for loading skeletons
		<div className={cn("space-y-4", className)} role="status" aria-label="Loading indicators">
			{/* Header skeleton */}
			<div className="flex items-center justify-between">
				<Skeleton width={120} height={14} />
				<Skeleton width={70} height={24} radius={9999} />
			</div>

			{/* Panels skeleton */}
			<div
				className={cn(
					"grid gap-4",
					layout === "full" ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1",
				)}
			>
				{Array.from({ length: sectionCount }, (_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: Static skeleton count, index is stable
					<div key={i} className={layout === "full" && i === 0 ? "lg:col-span-2" : ""}>
						<IndicatorSectionSkeleton />
					</div>
				))}
			</div>
		</div>
	);
}

export function IndicatorSnapshotPanel({
	symbol,
	sections = ALL_SECTIONS,
	layout = "full",
	className,
}: IndicatorSnapshotPanelProps) {
	const { data, isLoading, isError, error } = useIndicatorSnapshot(symbol);

	// Track market open status for options (updates every minute)
	const [isMarketClosed, setIsMarketClosed] = useState(!isOptionsMarketOpen());

	useEffect(() => {
		// Update immediately
		setIsMarketClosed(!isOptionsMarketOpen());

		// Check every minute
		const interval = setInterval(() => {
			setIsMarketClosed(!isOptionsMarketOpen());
		}, 60_000);

		return () => clearInterval(interval);
	}, []);

	if (isLoading) {
		return <IndicatorSnapshotSkeleton sections={sections} layout={layout} className={className} />;
	}

	if (isError || !data) {
		return (
			<div className={cn("flex items-center justify-center py-12 gap-2", "text-loss", className)}>
				<AlertCircle className="h-5 w-5" />
				<span>{error?.message ?? "Failed to load indicators"}</span>
			</div>
		);
	}

	const priceFreshness = getDataFreshness(data.metadata.price_updated_at);
	const fundamentalsFreshness = getBatchDataFreshness(data.metadata.fundamentals_date);
	const shortInterestFreshness = getBatchDataFreshness(data.metadata.short_interest_date);
	const sentimentFreshness = getBatchDataFreshness(data.metadata.sentiment_date);

	return (
		<div className={cn("space-y-4", className)}>
			{/* Header with data quality */}
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-medium text-stone-600 dark:text-night-300">
					Indicator Snapshot
				</h3>
				<DataQualityBadge quality={data.metadata.data_quality} />
			</div>

			{/* Panels Grid */}
			<div
				className={cn(
					"grid gap-4",
					layout === "full" ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1",
				)}
			>
				{sections.includes("price") && (
					<div className={layout === "full" ? "lg:col-span-2" : ""}>
						<PriceIndicatorsPanel data={data.price} freshness={priceFreshness} />
					</div>
				)}

				{sections.includes("liquidity") && (
					<LiquidityIndicatorsPanel data={data.liquidity} freshness={priceFreshness} />
				)}

				{sections.includes("options") && (
					<OptionsIndicatorsPanel
						data={data.options}
						freshness={priceFreshness}
						isMarketClosed={isMarketClosed}
					/>
				)}

				{sections.includes("value") && (
					<ValueIndicatorsPanel data={data.value} freshness={fundamentalsFreshness} />
				)}

				{sections.includes("quality") && (
					<QualityIndicatorsPanel data={data.quality} freshness={fundamentalsFreshness} />
				)}

				{sections.includes("short_interest") && (
					<ShortInterestPanel data={data.short_interest} freshness={shortInterestFreshness} />
				)}

				{sections.includes("sentiment") && (
					<SentimentPanel data={data.sentiment} freshness={sentimentFreshness} />
				)}

				{sections.includes("corporate") && (
					<CorporatePanel data={data.corporate} freshness={fundamentalsFreshness} />
				)}
			</div>

			{/* Missing fields warning - exclude options fields since the Options panel explains market hours */}
			{(() => {
				const optionsFields = ["implied_volatility", "iv_skew", "put_call_ratio"];
				const otherMissing = data.metadata.missing_fields.filter((f) => !optionsFields.includes(f));
				return (
					otherMissing.length > 0 && (
						<p className="text-xs text-stone-400 dark:text-night-500">
							Some data unavailable: {otherMissing.join(", ")}
						</p>
					)
				);
			})()}
		</div>
	);
}

export default IndicatorSnapshotPanel;
