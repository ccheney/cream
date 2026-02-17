"use client";

/**
 * Query Performance Page
 *
 * Dashboard view for monitoring PostgreSQL query performance
 * using pg_stat_statements data.
 *
 * @see docs/plans/46-postgres-drizzle-migration.md
 */

import { useState } from "react";
import { QueryErrorBoundary } from "@/components/QueryErrorBoundary";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableEmpty,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { type QueryStatsFilters, useQueryStats, useResetQueryStats } from "@/hooks/queries";

// ============================================
// Summary Cards
// ============================================

interface SummaryCardProps {
	label: string;
	value: string | number;
	subtext?: string;
	variant?: "default" | "warning" | "success";
}

function SummaryCard({ label, value, subtext, variant = "default" }: SummaryCardProps) {
	const variantClasses = {
		default: "text-stone-900 dark:text-stone-100",
		warning: "text-amber-600 dark:text-amber-400",
		success: "text-emerald-600 dark:text-emerald-400",
	};

	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
			<p className="text-xs font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wide">
				{label}
			</p>
			<p className={`mt-1 text-2xl font-semibold tabular-nums ${variantClasses[variant]}`}>
				{value}
			</p>
			{subtext && <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">{subtext}</p>}
		</div>
	);
}

// ============================================
// Query Table
// ============================================

interface QueryTableProps {
	isLoading: boolean;
	stats: QueryStat[];
}

interface QueryStat {
	query: string;
	calls: number;
	totalSeconds: number;
	avgMs: number;
	rows: number;
	hitRatio: number;
}

function formatQueryText(query: string): string {
	return query.length > 100 ? `${query.slice(0, 100)}...` : query;
}

function getAvgMsClass(avgMs: number): string {
	if (avgMs > 100) {
		return "text-amber-600 dark:text-amber-400";
	}
	if (avgMs > 50) {
		return "text-stone-600 dark:text-stone-400";
	}
	return "";
}

function getHitRatioClass(hitRatio: number): string {
	if (hitRatio < 0.9) {
		return "text-amber-600 dark:text-amber-400";
	}
	if (hitRatio >= 0.99) {
		return "text-emerald-600 dark:text-emerald-400";
	}
	return "";
}

function getHitRatioVariant(hitRatio: number): SummaryCardProps["variant"] {
	if (hitRatio >= 0.99) {
		return "success";
	}
	if (hitRatio < 0.9) {
		return "warning";
	}
	return "default";
}

function QueryRow({ stat }: { stat: QueryStat }) {
	return (
		<TableRow>
			<TableCell truncate className="max-w-md">
				<code className="text-xs bg-stone-100 dark:bg-night-700 px-1.5 py-0.5 rounded">
					{formatQueryText(stat.query)}
				</code>
			</TableCell>
			<TableCell numeric>{stat.calls.toLocaleString()}</TableCell>
			<TableCell numeric>{stat.totalSeconds.toFixed(2)}</TableCell>
			<TableCell numeric className={getAvgMsClass(stat.avgMs)}>
				{stat.avgMs.toFixed(2)}
			</TableCell>
			<TableCell numeric>{stat.rows.toLocaleString()}</TableCell>
			<TableCell numeric className={getHitRatioClass(stat.hitRatio)}>
				{(stat.hitRatio * 100).toFixed(1)}%
			</TableCell>
		</TableRow>
	);
}

function QueryTableLoading() {
	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-8 animate-pulse">
			<div className="h-64 bg-stone-100 dark:bg-night-700 rounded" />
		</div>
	);
}

function QueryTable({ isLoading, stats }: QueryTableProps) {
	if (isLoading) {
		return <QueryTableLoading />;
	}

	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 overflow-hidden">
			<Table variant="compact">
				<TableHeader>
					<TableRow>
						<TableHead>Query</TableHead>
						<TableHead numeric>Calls</TableHead>
						<TableHead numeric>Total (s)</TableHead>
						<TableHead numeric>Avg (ms)</TableHead>
						<TableHead numeric>Rows</TableHead>
						<TableHead numeric>Hit Ratio</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{stats.length === 0 ? (
						<TableEmpty colSpan={6}>No query statistics available</TableEmpty>
					) : (
						stats.map((stat) => <QueryRow key={stat.query} stat={stat} />)
					)}
				</TableBody>
			</Table>
		</div>
	);
}

interface QuerySummary {
	totalQueries: number;
	avgResponseMs: number;
	overallHitRatio: number;
	slowQueryCount: number;
}

interface QuerySummarySectionProps {
	isLoading: boolean;
	error: unknown;
	summary?: QuerySummary;
}

function QuerySummarySection({ isLoading, error, summary }: QuerySummarySectionProps) {
	if (isLoading) {
		return (
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
				{[1, 2, 3, 4].map((i) => (
					<div
						key={i}
						className="h-24 bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 animate-pulse"
					/>
				))}
			</div>
		);
	}

	if (error) {
		return (
			<div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
				<p className="text-sm text-red-800 dark:text-red-200">
					{error instanceof Error ? error.message : "Failed to load statistics"}
				</p>
			</div>
		);
	}

	if (!summary) {
		return null;
	}

	return (
		<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
			<SummaryCard
				label="Total Queries"
				value={summary.totalQueries.toLocaleString()}
				subtext="Unique query patterns"
			/>
			<SummaryCard
				label="Avg Response"
				value={`${summary.avgResponseMs.toFixed(1)}ms`}
				variant={summary.avgResponseMs > 50 ? "warning" : "default"}
				subtext="Mean execution time"
			/>
			<SummaryCard
				label="Buffer Hit Ratio"
				value={`${(summary.overallHitRatio * 100).toFixed(1)}%`}
				variant={getHitRatioVariant(summary.overallHitRatio)}
				subtext="Shared buffer cache hits"
			/>
			<SummaryCard
				label="Slow Queries"
				value={summary.slowQueryCount}
				variant={summary.slowQueryCount > 0 ? "warning" : "success"}
				subtext="> 100ms average"
			/>
		</div>
	);
}

interface QueryPageHeaderProps {
	isResetting: boolean;
	onReset: () => void;
}

function QueryPageHeader({ isResetting, onReset }: QueryPageHeaderProps) {
	return (
		<div className="flex items-center justify-between">
			<div>
				<h1 className="text-2xl font-semibold text-stone-900 dark:text-night-50">
					Query Performance
				</h1>
				<p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
					PostgreSQL query statistics from pg_stat_statements
				</p>
			</div>
			<div className="flex items-center gap-2">
				<Button variant="ghost" size="sm" onClick={onReset} disabled={isResetting}>
					{isResetting ? "Resetting..." : "Reset Stats"}
				</Button>
			</div>
		</div>
	);
}

interface SortControlsProps {
	sortBy: QueryStatsFilters["sortBy"];
	onSortChange: (sortBy: QueryStatsFilters["sortBy"]) => void;
}

const SORT_OPTIONS: { key: QueryStatsFilters["sortBy"]; label: string }[] = [
	{ key: "total_time", label: "Total Time" },
	{ key: "avg_time", label: "Avg Time" },
	{ key: "calls", label: "Calls" },
];

function SortControls({ sortBy, onSortChange }: SortControlsProps) {
	return (
		<div className="flex items-center gap-2">
			<span className="text-sm text-stone-500 dark:text-stone-400">Sort by:</span>
			<div className="flex gap-1">
				{SORT_OPTIONS.map((option) => (
					<Button
						key={option.key}
						variant={sortBy === option.key ? "primary" : "ghost"}
						size="sm"
						onClick={() => onSortChange(option.key)}
					>
						{option.label}
					</Button>
				))}
			</div>
		</div>
	);
}

function LastUpdatedTimestamp({ timestamp }: { timestamp?: string }) {
	if (!timestamp) {
		return null;
	}

	return (
		<p className="text-xs text-stone-400 dark:text-stone-500 text-right">
			Last updated: {new Date(timestamp).toLocaleString()}
		</p>
	);
}

// ============================================
// Main Component
// ============================================

export default function QueryPerformancePage() {
	const [filters, setFilters] = useState<QueryStatsFilters>({
		limit: 50,
		sortBy: "total_time",
	});

	const { data, isLoading, error } = useQueryStats(filters);
	const resetMutation = useResetQueryStats();

	const handleSortChange = (sortBy: QueryStatsFilters["sortBy"]) => {
		setFilters((prev) => ({ ...prev, sortBy }));
	};

	const handleReset = () => {
		if (confirm("Reset all query statistics? This cannot be undone.")) {
			resetMutation.mutate();
		}
	};

	return (
		<div className="space-y-6">
			<QueryPageHeader isResetting={resetMutation.isPending} onReset={handleReset} />

			<QueryErrorBoundary title="Failed to load query statistics">
				<QuerySummarySection isLoading={isLoading} error={error} summary={data?.summary} />
			</QueryErrorBoundary>

			<SortControls sortBy={filters.sortBy} onSortChange={handleSortChange} />

			<QueryErrorBoundary title="Failed to load query table">
				<QueryTable isLoading={isLoading} stats={data?.stats ?? []} />
			</QueryErrorBoundary>

			<LastUpdatedTimestamp timestamp={data?.timestamp} />
		</div>
	);
}
