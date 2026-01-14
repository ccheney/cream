"use client";

/**
 * Theses Page - Investment thesis tracker
 */

import { formatDistanceToNow } from "date-fns";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useTheses } from "@/hooks/queries";

export default function ThesesPage() {
	const [statusFilter, setStatusFilter] = useState<"ACTIVE" | "INVALIDATED" | "REALIZED" | "all">(
		"ACTIVE"
	);

	const { data: theses, isLoading } = useTheses({
		state: statusFilter === "all" ? undefined : statusFilter,
	});

	const formatPct = (value: number | null) =>
		value !== null ? `${value >= 0 ? "+" : ""}${value.toFixed(1)}%` : "--";

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-semibold text-stone-900 dark:text-night-50">
					Investment Theses
				</h1>
				<div className="flex items-center gap-2">
					<select
						value={statusFilter}
						onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
						className="text-sm border border-cream-200 dark:border-night-700 rounded-md px-3 py-1.5 bg-white dark:bg-night-800 text-stone-900 dark:text-night-50"
					>
						<option value="ACTIVE">Active</option>
						<option value="REALIZED">Realized</option>
						<option value="INVALIDATED">Invalidated</option>
						<option value="all">All</option>
					</select>
				</div>
			</div>

			{/* Theses List */}
			<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
				<div className="p-4 border-b border-cream-200 dark:border-night-700">
					<h2 className="text-lg font-medium text-stone-900 dark:text-night-50">
						{statusFilter === "all" ? "All" : statusFilter} Theses
						{theses && ` (${theses.length})`}
					</h2>
				</div>
				{isLoading ? (
					<div className="p-4 space-y-4">
						{[1, 2, 3].map((i) => (
							<div key={i} className="h-32 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
						))}
					</div>
				) : theses && theses.length > 0 ? (
					<div className="divide-y divide-cream-100 dark:divide-night-700">
						{theses.map((thesis) => (
							<div key={thesis.id} className="p-4 flex items-start gap-4">
								<div className="flex-1">
									<div className="flex items-start justify-between">
										<div className="flex items-center gap-3">
											<span className="text-lg font-mono font-semibold text-stone-900 dark:text-night-50">
												{thesis.symbol}
											</span>
											<span
												className={`px-2 py-0.5 text-xs font-medium rounded ${
													thesis.direction === "BULLISH"
														? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
														: thesis.direction === "BEARISH"
															? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
															: "bg-cream-100 text-stone-700 dark:bg-night-700 dark:text-night-400"
												}`}
											>
												{thesis.direction}
											</span>
											<span
												className={`px-2 py-0.5 text-xs font-medium rounded ${
													thesis.status === "ACTIVE"
														? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
														: thesis.status === "REALIZED"
															? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
															: thesis.status === "INVALIDATED"
																? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
																: "bg-cream-100 text-stone-700 dark:bg-night-700 dark:text-night-400"
												}`}
											>
												{thesis.status}
											</span>
										</div>
										<div className="text-right">
											{thesis.pnlPct !== null && (
												<span
													className={`text-lg font-semibold ${
														thesis.pnlPct >= 0 ? "text-green-600" : "text-red-600"
													}`}
												>
													{formatPct(thesis.pnlPct)}
												</span>
											)}
										</div>
									</div>

									<p className="mt-2 text-sm text-stone-700 dark:text-night-100">{thesis.thesis}</p>

									<div className="mt-3 grid grid-cols-4 gap-4 text-sm">
										<div>
											<span className="text-stone-500 dark:text-night-300">Time Horizon</span>
											<div className="font-medium text-stone-900 dark:text-night-50">
												{thesis.timeHorizon}
											</div>
										</div>
										<div>
											<span className="text-stone-500 dark:text-night-300">Confidence</span>
											<div className="font-medium text-stone-900 dark:text-night-50">
												{(thesis.confidence * 100).toFixed(0)}%
											</div>
										</div>
										<div>
											<span className="text-stone-500 dark:text-night-300">Target</span>
											<div className="font-medium text-green-600">
												{thesis.targetPrice ? `$${thesis.targetPrice.toFixed(2)}` : "--"}
											</div>
										</div>
										<div>
											<span className="text-stone-500 dark:text-night-300">Stop</span>
											<div className="font-medium text-red-600">
												{thesis.stopPrice ? `$${thesis.stopPrice.toFixed(2)}` : "--"}
											</div>
										</div>
									</div>

									{thesis.catalysts && thesis.catalysts.length > 0 && (
										<div className="mt-3">
											<span className="text-xs text-stone-500 dark:text-night-300">Catalysts:</span>
											<div className="mt-1 flex flex-wrap gap-1">
												{thesis.catalysts.map((catalyst, idx) => (
													<span
														key={`${thesis.id}-catalyst-${idx}`}
														className="px-2 py-0.5 text-xs bg-cream-100 dark:bg-night-700 text-stone-700 dark:text-night-100 rounded"
													>
														{catalyst}
													</span>
												))}
											</div>
										</div>
									)}

									<div className="mt-3 flex items-center justify-between text-xs text-stone-400 dark:text-night-400">
										<span>Source: {thesis.agentSource}</span>
										<span>
											Updated {formatDistanceToNow(new Date(thesis.updatedAt), { addSuffix: true })}
										</span>
									</div>
								</div>
								<Link
									href={`/theses/${thesis.id}`}
									className="p-2 rounded-md text-stone-400 dark:text-night-400 hover:text-stone-600 dark:text-night-200 hover:bg-cream-100 dark:hover:bg-night-700 transition-colors self-center"
									title="View details"
								>
									<ChevronRight className="w-5 h-5" />
								</Link>
							</div>
						))}
					</div>
				) : (
					<div className="p-8 text-center text-stone-400 dark:text-night-400">No theses found</div>
				)}
			</div>

			{/* Thesis Structure Guide */}
			<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
				<h2 className="text-lg font-medium text-stone-900 dark:text-night-50 mb-4">
					Thesis Structure
				</h2>
				<div className="text-sm text-stone-600 dark:text-night-200 dark:text-night-400 space-y-2">
					<p>
						<strong>Core Thesis:</strong> What is the investment thesis?
					</p>
					<p>
						<strong>Catalysts:</strong> What events will drive the price movement?
					</p>
					<p>
						<strong>Time Horizon:</strong> When do we expect the thesis to play out?
					</p>
					<p>
						<strong>Invalidation:</strong> What conditions would invalidate the thesis?
					</p>
					<p>
						<strong>Conviction:</strong> How confident are we in the thesis?
					</p>
				</div>
			</div>
		</div>
	);
}
