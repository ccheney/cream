/**
 * Active Indicators Table
 *
 * Sortable table displaying production indicators with IC metrics.
 */

import Link from "next/link";
import { useState } from "react";
import type { IndicatorSummary } from "@/hooks/queries";

interface ActiveIndicatorsTableProps {
	indicators: IndicatorSummary[] | undefined;
	isLoading: boolean;
}

type SortField = "name" | "category" | "status";
type SortDirection = "asc" | "desc";

/**
 * Get status display info based on indicator status.
 */
function getStatusDisplay(status: IndicatorSummary["status"]) {
	switch (status) {
		case "production":
			return { icon: "●", label: "Production", className: "text-green-600 dark:text-green-400" };
		case "paper":
			return { icon: "○", label: "Paper", className: "text-blue-600 dark:text-blue-400" };
		case "staging":
			return { icon: "◐", label: "Staging", className: "text-amber-600 dark:text-amber-400" };
		case "retired":
			return { icon: "✗", label: "Retired", className: "text-stone-400 dark:text-night-400" };
		default:
			return { icon: "?", label: "Unknown", className: "text-stone-400 dark:text-night-400" };
	}
}

export function ActiveIndicatorsTable({ indicators, isLoading }: ActiveIndicatorsTableProps) {
	const [sortField, setSortField] = useState<SortField>("name");
	const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

	const handleSort = (field: SortField) => {
		if (sortField === field) {
			setSortDirection(sortDirection === "asc" ? "desc" : "asc");
		} else {
			setSortField(field);
			setSortDirection("asc");
		}
	};

	const sortedIndicators = [...(indicators ?? [])].sort((a, b) => {
		const multiplier = sortDirection === "asc" ? 1 : -1;
		return a[sortField].localeCompare(b[sortField]) * multiplier;
	});

	const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
		<th
			className="px-4 py-3 text-left text-xs font-medium text-stone-500 dark:text-night-300 uppercase tracking-wider cursor-pointer hover:text-stone-700 dark:hover:text-night-100"
			onClick={() => handleSort(field)}
		>
			<span className="flex items-center gap-1">
				{children}
				{sortField === field && (
					<span className="text-xs">{sortDirection === "asc" ? "↑" : "↓"}</span>
				)}
			</span>
		</th>
	);

	if (isLoading) {
		return (
			<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
				<div className="p-4 border-b border-cream-200 dark:border-night-700">
					<div className="h-6 w-40 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
				</div>
				<div className="p-4 space-y-3">
					{[1, 2, 3, 4, 5].map((i) => (
						<div key={i} className="h-12 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
					))}
				</div>
			</div>
		);
	}

	const productionIndicators = sortedIndicators.filter((i) => i.status === "production");

	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
			<div className="p-4 border-b border-cream-200 dark:border-night-700 flex items-center justify-between">
				<h3 className="text-lg font-medium text-stone-900 dark:text-night-50">Active Indicators</h3>
				<span className="text-sm text-stone-500 dark:text-night-300">
					{productionIndicators.length} in production
				</span>
			</div>

			{productionIndicators.length === 0 ? (
				<div className="p-8 text-center text-stone-400 dark:text-night-400">
					No production indicators
				</div>
			) : (
				<div className="overflow-x-auto">
					<table className="min-w-full divide-y divide-cream-200 dark:divide-night-700">
						<thead className="bg-cream-50 dark:bg-night-750">
							<tr>
								<SortHeader field="name">Name</SortHeader>
								<SortHeader field="category">Category</SortHeader>
								<th className="px-4 py-3 text-left text-xs font-medium text-stone-500 dark:text-night-300 uppercase tracking-wider">
									Hypothesis
								</th>
								<SortHeader field="status">Status</SortHeader>
								<th className="px-4 py-3 text-left text-xs font-medium text-stone-500 dark:text-night-300 uppercase tracking-wider">
									Promoted
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-cream-100 dark:divide-night-700">
							{productionIndicators.map((indicator) => {
								const statusDisplay = getStatusDisplay(indicator.status);
								return (
									<tr
										key={indicator.id}
										className="hover:bg-cream-50 dark:hover:bg-night-750 transition-colors"
									>
										<td className="px-4 py-3">
											<Link
												href={`/indicators/${indicator.id}`}
												className="text-stone-900 dark:text-night-50 font-medium hover:text-blue-600 dark:hover:text-blue-400"
											>
												{indicator.name}
											</Link>
										</td>
										<td className="px-4 py-3">
											<span className="px-2 py-1 text-xs font-medium bg-cream-100 dark:bg-night-700 text-stone-700 dark:text-night-100 rounded">
												{indicator.category}
											</span>
										</td>
										<td className="px-4 py-3 max-w-xs">
											<p className="text-sm text-stone-600 dark:text-night-200 dark:text-night-400 truncate">
												{indicator.hypothesis}
											</p>
										</td>
										<td className="px-4 py-3">
											<span className={`flex items-center gap-1 ${statusDisplay.className}`}>
												<span>{statusDisplay.icon}</span>
												<span className="text-sm">{statusDisplay.label}</span>
											</span>
										</td>
										<td className="px-4 py-3 text-sm text-stone-500 dark:text-night-300">
											{indicator.promotedAt
												? new Date(indicator.promotedAt).toLocaleDateString()
												: "-"}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}

			<div className="p-4 border-t border-cream-200 dark:border-night-700">
				<Link
					href="/indicators"
					className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
				>
					View All Indicators →
				</Link>
			</div>
		</div>
	);
}
