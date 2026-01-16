/**
 * Run Detail Panel
 *
 * Shows detailed data ingested during a worker run.
 * Renders service-specific views for different data types.
 *
 * @see docs/plans/ui/36-expandable-worker-runs.md
 */

import { format } from "date-fns";
import {
	type IndicatorEntry,
	type MacroWatchEntry,
	type NewspaperData,
	type RunDetailsData,
	useWorkerRunDetails,
	type WorkerService,
} from "@/hooks/queries";

// ============================================
// Props Interface
// ============================================

export interface RunDetailPanelProps {
	runId: string;
	service: WorkerService;
}

// ============================================
// Category Badge
// ============================================

const categoryColors: Record<string, string> = {
	NEWS: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
	PREDICTION: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300",
	ECONOMIC: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
	MOVER: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300",
	EARNINGS: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300",
};

function CategoryBadge({ category }: { category: string }) {
	const colors =
		categoryColors[category] ?? "bg-stone-100 dark:bg-night-700 text-stone-600 dark:text-night-300";
	return (
		<span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${colors}`}>
			{category}
		</span>
	);
}

// ============================================
// Macro Watch Details
// ============================================

function MacroWatchDetails({ entries }: { entries: MacroWatchEntry[] }) {
	if (entries.length === 0) {
		return (
			<div className="text-sm text-stone-500 dark:text-night-400 italic">
				No entries captured during this run
			</div>
		);
	}

	return (
		<div className="space-y-2">
			<div className="text-xs text-stone-500 dark:text-night-400 mb-2">
				{entries.length} {entries.length === 1 ? "entry" : "entries"} captured
			</div>
			<div className="space-y-1.5 max-h-64 overflow-y-auto">
				{entries.map((entry) => (
					<div
						key={entry.id}
						className="flex items-start gap-2 text-sm p-2 rounded bg-cream-50 dark:bg-night-750"
					>
						<CategoryBadge category={entry.category} />
						<div className="flex-1 min-w-0">
							<div className="text-stone-700 dark:text-night-200 truncate">{entry.headline}</div>
							<div className="flex items-center gap-2 mt-0.5 text-xs text-stone-400 dark:text-night-500">
								<span>{entry.source}</span>
								{entry.symbols.length > 0 && (
									<span className="font-mono">{entry.symbols.join(", ")}</span>
								)}
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

// ============================================
// Newspaper Details
// ============================================

function NewspaperDetails({ newspaper }: { newspaper: NewspaperData | null }) {
	if (!newspaper) {
		return (
			<div className="text-sm text-stone-500 dark:text-night-400 italic">
				No newspaper compiled during this run
			</div>
		);
	}

	const sections = newspaper.sections as Record<string, unknown>;
	const sectionNames = Object.keys(sections).filter((k) => sections[k]);

	return (
		<div className="space-y-2">
			<div className="flex items-center gap-4 text-sm">
				<span className="text-stone-600 dark:text-night-300">
					Date:{" "}
					<span className="font-medium text-stone-900 dark:text-night-50">{newspaper.date}</span>
				</span>
				<span className="text-stone-600 dark:text-night-300">
					Compiled:{" "}
					<span className="font-medium text-stone-900 dark:text-night-50">
						{format(new Date(newspaper.compiledAt), "h:mm a")}
					</span>
				</span>
				<span className="text-stone-600 dark:text-night-300">
					Entries:{" "}
					<span className="font-medium text-stone-900 dark:text-night-50">
						{newspaper.entryCount}
					</span>
				</span>
			</div>
			{sectionNames.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					{sectionNames.map((section) => (
						<span
							key={section}
							className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-cream-100 dark:bg-night-700 text-stone-600 dark:text-night-300"
						>
							{section}
						</span>
					))}
				</div>
			)}
		</div>
	);
}

// ============================================
// Indicator Details
// ============================================

function IndicatorDetails({
	entries,
	service,
}: {
	entries: IndicatorEntry[];
	service: WorkerService;
}) {
	if (entries.length === 0) {
		return (
			<div className="text-sm text-stone-500 dark:text-night-400 italic">
				No data fetched during this run
			</div>
		);
	}

	const formatValue = (value: string | number | null): string => {
		if (value === null) {
			return "--";
		}
		if (typeof value === "number") {
			if (Math.abs(value) >= 1000000) {
				return `${(value / 1000000).toFixed(2)}M`;
			}
			if (Math.abs(value) >= 1000) {
				return `${(value / 1000).toFixed(1)}K`;
			}
			if (Number.isInteger(value)) {
				return String(value);
			}
			return value.toFixed(2);
		}
		return String(value);
	};

	const getColumns = (): { key: string; label: string }[] => {
		switch (service) {
			case "short_interest":
				return [
					{ key: "shortInterest", label: "Short Int" },
					{ key: "daysToCover", label: "Days to Cover" },
					{ key: "shortPctFloat", label: "% Float" },
				];
			case "sentiment":
				return [
					{ key: "sentimentScore", label: "Score" },
					{ key: "sentimentStrength", label: "Strength" },
					{ key: "newsVolume", label: "News Vol" },
				];
			case "corporate_actions":
				return [
					{ key: "dividendYield", label: "Div Yield" },
					{ key: "exDividendDays", label: "Ex-Div Days" },
					{ key: "earningsDays", label: "Earnings Days" },
				];
			case "filings_sync":
				return [
					{ key: "formType", label: "Form" },
					{ key: "accessionNumber", label: "Accession #" },
				];
			default:
				return [];
		}
	};

	const columns = getColumns();

	return (
		<div className="space-y-2">
			<div className="text-xs text-stone-500 dark:text-night-400 mb-2">
				{entries.length} {entries.length === 1 ? "record" : "records"} fetched
			</div>
			<div className="overflow-x-auto max-h-64">
				<table className="min-w-full text-sm">
					<thead>
						<tr className="text-xs text-stone-500 dark:text-night-400 uppercase">
							<th className="text-left py-1 pr-4">Symbol</th>
							<th className="text-left py-1 pr-4">Date</th>
							{columns.map((col) => (
								<th key={col.key} className="text-right py-1 pr-4">
									{col.label}
								</th>
							))}
						</tr>
					</thead>
					<tbody className="divide-y divide-cream-100 dark:divide-night-700">
						{entries.map((entry, idx) => (
							<tr key={`${entry.symbol}-${idx}`}>
								<td className="py-1.5 pr-4 font-mono font-medium text-stone-900 dark:text-night-50">
									{entry.symbol}
								</td>
								<td className="py-1.5 pr-4 text-stone-500 dark:text-night-400">
									{entry.date ? format(new Date(entry.date), "MM/dd") : "--"}
								</td>
								{columns.map((col) => (
									<td
										key={col.key}
										className="py-1.5 pr-4 text-right font-mono text-stone-600 dark:text-night-300"
									>
										{formatValue(entry.values[col.key] ?? null)}
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}

// ============================================
// Loading State
// ============================================

function LoadingState() {
	return (
		<div className="flex items-center gap-2 text-sm text-stone-500 dark:text-night-400">
			<div className="w-4 h-4 border-2 border-stone-300 dark:border-night-600 border-t-amber-500 rounded-full animate-spin" />
			Loading details...
		</div>
	);
}

// ============================================
// Error State
// ============================================

function ErrorState({ message }: { message: string }) {
	return (
		<div className="text-sm text-red-600 dark:text-red-400">Failed to load details: {message}</div>
	);
}

// ============================================
// Main Component
// ============================================

export function RunDetailPanel({ runId, service }: RunDetailPanelProps) {
	const { data, isLoading, error } = useWorkerRunDetails(runId, true);

	return (
		<div className="px-6 py-4 bg-cream-25 dark:bg-night-850 border-t border-cream-200 dark:border-night-700">
			{isLoading && <LoadingState />}
			{error && <ErrorState message={error instanceof Error ? error.message : "Unknown error"} />}
			{data && <RunDetailsContent data={data.data} service={service} />}
		</div>
	);
}

function RunDetailsContent({ data, service }: { data: RunDetailsData; service: WorkerService }) {
	switch (data.type) {
		case "macro_watch":
			return <MacroWatchDetails entries={data.entries} />;
		case "newspaper":
			return <NewspaperDetails newspaper={data.newspaper} />;
		case "indicators":
			return <IndicatorDetails entries={data.entries} service={service} />;
		case "empty":
			return (
				<div className="text-sm text-stone-500 dark:text-night-400 italic">{data.message}</div>
			);
		default:
			return null;
	}
}
