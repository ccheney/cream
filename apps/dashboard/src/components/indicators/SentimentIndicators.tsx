"use client";

/**
 * Sentiment Widget
 *
 * Displays sentiment metrics with gradient gauge, news volume, and event risk flags.
 * Implements "Calm Confidence" principle - extremes shown composedly.
 *
 * @see docs/plans/ui/20-design-philosophy.md
 * @see docs/plans/ui/26-data-viz.md
 */

import { memo } from "react";

import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Card } from "@/components/ui/surface";

import type { SentimentIndicators as SentimentData } from "./IndicatorSnapshot";

// ============================================
// Types
// ============================================

export interface SentimentIndicatorsProps {
	data: SentimentData | null;
	isLoading?: boolean;
	lastUpdate?: number | null;
	className?: string;
}

type SentimentClassification = SentimentData["classification"];

// ============================================
// Utility Functions
// ============================================

function formatScore(value: number | null): string {
	if (value === null) {
		return "—";
	}
	const sign = value > 0 ? "+" : "";
	return `${sign}${value.toFixed(2)}`;
}

function formatStrength(value: number | null): string {
	if (value === null) {
		return "—";
	}
	return `${(value * 100).toFixed(0)}%`;
}

function formatNewsVolume(value: number | null): string {
	if (value === null) {
		return "—";
	}
	if (value >= 1000) {
		return `${(value / 1000).toFixed(1)}K`;
	}
	return value.toFixed(0);
}

function formatMomentum(value: number | null): string {
	if (value === null) {
		return "—";
	}
	const sign = value > 0 ? "+" : "";
	return `${sign}${value.toFixed(2)}`;
}

// ============================================
// Variant Functions
// ============================================

function getClassificationVariant(classification: SentimentClassification): BadgeVariant {
	switch (classification) {
		case "STRONG_BULLISH":
			return "success";
		case "BULLISH":
			return "info";
		case "NEUTRAL":
			return "neutral";
		case "BEARISH":
			return "warning";
		case "STRONG_BEARISH":
			return "error";
		default:
			return "neutral";
	}
}

function getMomentumVariant(value: number | null): BadgeVariant {
	if (value === null) {
		return "neutral";
	}
	if (value <= -0.3) {
		return "error";
	}
	if (value <= -0.1) {
		return "warning";
	}
	if (value < 0.1) {
		return "neutral";
	}
	if (value < 0.3) {
		return "info";
	}
	return "success";
}

function getStrengthLevel(value: number | null): string {
	if (value === null) {
		return "Unknown";
	}
	if (value < 0.3) {
		return "Weak";
	}
	if (value < 0.5) {
		return "Moderate";
	}
	if (value < 0.7) {
		return "Strong";
	}
	return "Very Strong";
}

function getNewsVolumeLevel(value: number | null): string {
	if (value === null) {
		return "Unknown";
	}
	if (value < 10) {
		return "Low";
	}
	if (value < 50) {
		return "Normal";
	}
	if (value < 100) {
		return "Elevated";
	}
	return "High";
}

function formatClassification(classification: SentimentClassification): string {
	if (!classification) {
		return "Unknown";
	}
	return classification
		.toLowerCase()
		.split("_")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

// ============================================
// Sentiment Gauge Component
// ============================================

interface SentimentGaugeProps {
	score: number | null;
	classification: SentimentClassification;
}

function SentimentGauge({ score, classification }: SentimentGaugeProps) {
	const normalizedScore = score !== null ? Math.max(-1, Math.min(1, score)) : 0;
	const percent = ((normalizedScore + 1) / 2) * 100;

	return (
		<div className="space-y-2">
			{/* Gauge Bar */}
			<div className="relative h-3 bg-gradient-to-r from-red-500 via-stone-300 to-emerald-500 rounded-full overflow-hidden">
				{/* Indicator */}
				<div
					className="absolute top-0 w-1 h-full bg-stone-900 dark:bg-white shadow-md transition-all duration-300"
					style={{ left: `calc(${percent}% - 2px)` }}
				/>
			</div>

			{/* Labels */}
			<div className="flex justify-between text-xs text-stone-400">
				<span>Bearish</span>
				<span>Neutral</span>
				<span>Bullish</span>
			</div>

			{/* Score and Classification */}
			<div className="flex items-center justify-between pt-1">
				<span className="font-mono text-2xl font-semibold text-stone-900 dark:text-stone-100">
					{formatScore(score)}
				</span>
				{classification && (
					<Badge variant={getClassificationVariant(classification)}>
						{formatClassification(classification)}
					</Badge>
				)}
			</div>
		</div>
	);
}

// ============================================
// Event Risk Flag Component
// ============================================

interface EventRiskFlagProps {
	hasRisk: boolean | null;
}

function EventRiskFlag({ hasRisk }: EventRiskFlagProps) {
	if (hasRisk === null) {
		return null;
	}

	if (!hasRisk) {
		return (
			<div className="flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400">
				<svg
					className="w-4 h-4 text-emerald-500"
					viewBox="0 0 16 16"
					fill="none"
					aria-hidden="true"
				>
					<path
						d="M13.5 4.5l-7 7L3 8"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
				<span>No Event Risk</span>
			</div>
		);
	}

	return (
		<div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
			<svg
				className="w-5 h-5 text-amber-500 animate-pulse"
				viewBox="0 0 16 16"
				fill="none"
				role="img"
				aria-labelledby="event-risk-title"
			>
				<title id="event-risk-title">Event Risk Warning</title>
				<path
					d="M8 1.5l6.928 12H1.072L8 1.5z"
					stroke="currentColor"
					strokeWidth="1.5"
					fill="none"
				/>
				<path d="M8 6v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
				<circle cx="8" cy="11" r="0.75" fill="currentColor" />
			</svg>
			<div>
				<span className="font-medium text-amber-700 dark:text-amber-400">Event Risk Active</span>
				<p className="text-xs text-amber-600 dark:text-amber-500">
					Earnings, FDA decision, or other catalyst expected
				</p>
			</div>
		</div>
	);
}

// ============================================
// Metric Row Component
// ============================================

interface MetricRowProps {
	label: string;
	value: string;
	subtext?: string;
	variant?: BadgeVariant;
}

function MetricRow({ label, value, subtext, variant }: MetricRowProps) {
	return (
		<div className="flex items-center justify-between py-2 border-b border-stone-100 dark:border-stone-800 last:border-0">
			<span className="text-sm text-stone-500 dark:text-stone-400">{label}</span>
			<div className="flex items-center gap-2">
				<span className="font-mono text-sm text-stone-900 dark:text-stone-100">{value}</span>
				{subtext && variant && (
					<Badge variant={variant} className="text-xs">
						{subtext}
					</Badge>
				)}
			</div>
		</div>
	);
}

// ============================================
// Loading State
// ============================================

function LoadingSkeleton() {
	return (
		<Card elevation={1} padding="md" className="animate-pulse">
			<div className="h-4 w-20 bg-stone-100 dark:bg-stone-800 rounded mb-4" />
			<div className="h-3 w-full bg-stone-100 dark:bg-stone-800 rounded-full mb-4" />
			<div className="flex justify-between mb-4">
				<div className="h-8 w-16 bg-stone-100 dark:bg-stone-800 rounded" />
				<div className="h-6 w-24 bg-stone-100 dark:bg-stone-800 rounded" />
			</div>
			<div className="space-y-2">
				<div className="h-6 w-full bg-stone-100 dark:bg-stone-800 rounded" />
				<div className="h-6 w-full bg-stone-100 dark:bg-stone-800 rounded" />
			</div>
		</Card>
	);
}

// ============================================
// Main Component
// ============================================

export const SentimentIndicators = memo(function SentimentIndicators({
	data,
	isLoading = false,
	lastUpdate,
	className = "",
}: SentimentIndicatorsProps) {
	if (isLoading) {
		return <LoadingSkeleton />;
	}

	if (!data) {
		return (
			<Card elevation={1} padding="md" className={className}>
				<p className="text-sm text-stone-500 dark:text-stone-400 text-center">
					No sentiment data available
				</p>
			</Card>
		);
	}

	const hasEventRisk = data.event_risk === true;
	const strengthLevel = getStrengthLevel(data.sentiment_strength);
	const newsLevel = getNewsVolumeLevel(data.news_volume);

	return (
		<Card
			elevation={1}
			padding="md"
			className={`${className} ${hasEventRisk ? "ring-2 ring-amber-500/30" : ""}`}
		>
			{/* Header */}
			<div className="flex items-center justify-between mb-4">
				<h3 className="text-sm font-medium text-stone-700 dark:text-stone-300">Sentiment</h3>
				{data.classification && (
					<Badge
						variant={getClassificationVariant(data.classification)}
						className="text-xs uppercase tracking-wide"
					>
						{data.classification.replace("_", " ")}
					</Badge>
				)}
			</div>

			{/* Sentiment Gauge */}
			<div className="mb-4">
				<SentimentGauge score={data.overall_score} classification={data.classification} />
			</div>

			{/* Event Risk Flag */}
			{data.event_risk !== null && (
				<div className="mb-4">
					<EventRiskFlag hasRisk={data.event_risk} />
				</div>
			)}

			{/* Metrics */}
			<div className="space-y-0">
				<MetricRow
					label="Strength"
					value={formatStrength(data.sentiment_strength)}
					subtext={strengthLevel}
					variant={
						data.sentiment_strength !== null && data.sentiment_strength >= 0.5 ? "info" : "neutral"
					}
				/>
				<MetricRow
					label="News Volume"
					value={formatNewsVolume(data.news_volume)}
					subtext={newsLevel}
					variant={data.news_volume !== null && data.news_volume >= 100 ? "warning" : "neutral"}
				/>
				<MetricRow
					label="Momentum"
					value={formatMomentum(data.sentiment_momentum)}
					subtext={
						data.sentiment_momentum !== null
							? data.sentiment_momentum > 0
								? "Rising"
								: data.sentiment_momentum < 0
									? "Falling"
									: "Stable"
							: undefined
					}
					variant={getMomentumVariant(data.sentiment_momentum)}
				/>
			</div>

			{/* Last Update */}
			{lastUpdate && (
				<div className="mt-3 pt-3 border-t border-stone-100 dark:border-stone-800 text-xs text-stone-400 dark:text-stone-500 text-right">
					Updated {new Date(lastUpdate).toLocaleTimeString()}
				</div>
			)}
		</Card>
	);
});

export default SentimentIndicators;
