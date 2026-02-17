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

function withStableOccurrenceKeys<T>(
	items: T[],
	getBaseKey: (item: T) => string,
): Array<{ item: T; key: string }> {
	const counts = new Map<string, number>();
	return items.map((item) => {
		const base = getBaseKey(item);
		const nextCount = (counts.get(base) ?? 0) + 1;
		counts.set(base, nextCount);
		return {
			item,
			key: `${base}-${nextCount}`,
		};
	});
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

const SKELETON_ROW_KEYS = [
	"skeleton-row-1",
	"skeleton-row-2",
	"skeleton-row-3",
	"skeleton-row-4",
	"skeleton-row-5",
	"skeleton-row-6",
] as const;

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
					{SKELETON_ROW_KEYS.map((rowKey) => (
						<div key={rowKey} className="space-y-1">
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
	const skeletonSections = withStableOccurrenceKeys(
		sections.slice(0, 3),
		(section) => `${section}-skeleton`,
	);

	return (
		<div className={cn("space-y-4", className)} aria-busy="true">
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
				{skeletonSections.map(({ key }, index) => (
					<div key={key} className={layout === "full" && index === 0 ? "lg:col-span-2" : ""}>
						<IndicatorSectionSkeleton />
					</div>
				))}
			</div>
		</div>
	);
}

function useIsMarketClosed(): boolean {
	const [isMarketClosed, setIsMarketClosed] = useState(!isOptionsMarketOpen());

	useEffect(() => {
		setIsMarketClosed(!isOptionsMarketOpen());
		const interval = setInterval(() => {
			setIsMarketClosed(!isOptionsMarketOpen());
		}, 60_000);
		return () => clearInterval(interval);
	}, []);

	return isMarketClosed;
}

function IndicatorPanelsGrid({
	sections,
	layout,
	data,
	isMarketClosed,
}: {
	sections: IndicatorCategory[];
	layout: "full" | "compact";
	data: NonNullable<ReturnType<typeof useIndicatorSnapshot>["data"]>;
	isMarketClosed: boolean;
}) {
	const priceFreshness = getDataFreshness(data.metadata.price_updated_at);
	const fundamentalsFreshness = getBatchDataFreshness(data.metadata.fundamentals_date);
	const shortInterestFreshness = getBatchDataFreshness(data.metadata.short_interest_date);
	const sentimentFreshness = getBatchDataFreshness(data.metadata.sentiment_date);

	return (
		<div
			className={cn("grid gap-4", layout === "full" ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1")}
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
	);
}

function MissingFieldsNotice({ fields }: { fields: string[] }) {
	const optionsFields = new Set(["implied_volatility", "iv_skew", "put_call_ratio"]);
	const otherMissing = fields.filter((field) => !optionsFields.has(field));

	if (otherMissing.length === 0) {
		return null;
	}

	return (
		<p className="text-xs text-stone-400 dark:text-night-500">
			Some data unavailable: {otherMissing.join(", ")}
		</p>
	);
}

export function IndicatorSnapshotPanel({
	symbol,
	sections = ALL_SECTIONS,
	layout = "full",
	className,
}: IndicatorSnapshotPanelProps) {
	const { data, isLoading, isError, error } = useIndicatorSnapshot(symbol);
	const isMarketClosed = useIsMarketClosed();

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

	return (
		<div className={cn("space-y-4", className)}>
			{/* Header with data quality */}
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-medium text-stone-600 dark:text-night-300">
					Indicator Snapshot
				</h3>
				<DataQualityBadge quality={data.metadata.data_quality} />
			</div>
			<IndicatorPanelsGrid
				sections={sections}
				layout={layout}
				data={data}
				isMarketClosed={isMarketClosed}
			/>
			<MissingFieldsNotice fields={data.metadata.missing_fields} />
		</div>
	);
}

export default IndicatorSnapshotPanel;
