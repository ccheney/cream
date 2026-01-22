"use client";

/**
 * Theses Page - Investment thesis tracker
 */

import { formatDistanceToNow, isThisWeek, isToday } from "date-fns";
import { TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useTheses } from "@/hooks/queries";

type ThesisData = {
	id: string;
	symbol: string;
	direction: "BULLISH" | "BEARISH" | "NEUTRAL";
	status: "ACTIVE" | "INVALIDATED" | "REALIZED";
	thesis: string;
	timeHorizon: string;
	confidence: number | null;
	targetPrice: number | null;
	stopPrice: number | null;
	pnlPct: number | null;
	agentSource: string;
	createdAt: string;
	updatedAt: string;
};

interface GroupedTheses {
	today: ThesisData[];
	thisWeek: ThesisData[];
	earlier: ThesisData[];
}

function groupThesesByTime(theses: ThesisData[]): GroupedTheses {
	const today: ThesisData[] = [];
	const thisWeek: ThesisData[] = [];
	const earlier: ThesisData[] = [];

	for (const thesis of theses) {
		const date = new Date(thesis.createdAt);
		if (isToday(date)) {
			today.push(thesis);
		} else if (isThisWeek(date, { weekStartsOn: 1 })) {
			thisWeek.push(thesis);
		} else {
			earlier.push(thesis);
		}
	}

	return { today, thisWeek, earlier };
}

export default function ThesesPage() {
	const [statusFilter, setStatusFilter] = useState<"ACTIVE" | "INVALIDATED" | "REALIZED" | "all">(
		"ACTIVE",
	);

	const { data: theses, isLoading } = useTheses({
		state: statusFilter === "all" ? undefined : statusFilter,
	});

	const grouped = useMemo(() => {
		if (!theses) return null;
		return groupThesesByTime(theses as ThesisData[]);
	}, [theses]);

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold text-stone-900 dark:text-night-50">
						Investment Theses
					</h1>
					{theses && (
						<p className="text-sm text-stone-500 dark:text-night-400 mt-1">
							{theses.length} {statusFilter === "all" ? "total" : statusFilter.toLowerCase()}
						</p>
					)}
				</div>
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

			{/* Content */}
			{isLoading ? (
				<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
					{[1, 2, 3, 4, 5, 6].map((i) => (
						<div
							key={i}
							className="h-48 bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 animate-pulse"
						/>
					))}
				</div>
			) : grouped && theses && theses.length > 0 ? (
				<div className="space-y-8">
					{/* Today */}
					{grouped.today.length > 0 && (
						<ThesisSection title="Today" count={grouped.today.length} theses={grouped.today} />
					)}

					{/* This Week */}
					{grouped.thisWeek.length > 0 && (
						<ThesisSection
							title="This Week"
							count={grouped.thisWeek.length}
							theses={grouped.thisWeek}
						/>
					)}

					{/* Earlier */}
					{grouped.earlier.length > 0 && (
						<ThesisSection
							title="Earlier"
							count={grouped.earlier.length}
							theses={grouped.earlier}
						/>
					)}
				</div>
			) : (
				<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-12 text-center">
					<p className="text-stone-400 dark:text-night-400">No theses found</p>
				</div>
			)}
		</div>
	);
}

function ThesisSection({
	title,
	count,
	theses,
}: {
	title: string;
	count: number;
	theses: ThesisData[];
}) {
	return (
		<section>
			<div className="flex items-center gap-3 mb-3">
				<h2 className="text-sm font-medium text-stone-500 dark:text-night-400 uppercase tracking-wide">
					{title}
				</h2>
				<span className="text-xs text-stone-400 dark:text-night-500 bg-cream-100 dark:bg-night-700 px-2 py-0.5 rounded-full">
					{count}
				</span>
			</div>
			<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
				{theses.map((thesis) => (
					<ThesisCard key={thesis.id} thesis={thesis} />
				))}
			</div>
		</section>
	);
}

interface ThesisCardProps {
	thesis: {
		id: string;
		symbol: string;
		direction: "BULLISH" | "BEARISH" | "NEUTRAL";
		status: "ACTIVE" | "INVALIDATED" | "REALIZED";
		thesis: string;
		timeHorizon: string;
		confidence: number | null;
		targetPrice: number | null;
		stopPrice: number | null;
		pnlPct: number | null;
		agentSource: string;
		updatedAt: string;
	};
}

function ThesisCard({ thesis }: ThesisCardProps) {
	const statusColors = {
		ACTIVE: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
		REALIZED: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
		INVALIDATED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
	};

	return (
		<Link
			href={`/theses/${thesis.id}`}
			className="group bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4 hover:border-cream-300 dark:hover:border-night-600 hover:shadow-sm transition-all"
		>
			{/* Header */}
			<div className="flex items-center justify-between mb-3">
				<div className="flex items-center gap-2">
					{thesis.direction === "BULLISH" ? (
						<TrendingUp className="w-4 h-4 text-green-500" />
					) : thesis.direction === "BEARISH" ? (
						<TrendingDown className="w-4 h-4 text-red-500" />
					) : null}
					<span className="font-mono font-semibold text-stone-900 dark:text-night-50">
						{thesis.symbol}
					</span>
				</div>
				<span className={`px-2 py-0.5 text-xs font-medium rounded ${statusColors[thesis.status]}`}>
					{thesis.status}
				</span>
			</div>

			{/* Thesis text */}
			<p className="text-sm text-stone-600 dark:text-night-200 line-clamp-2 mb-3">
				{thesis.thesis}
			</p>

			{/* Metrics row */}
			<div className="flex items-center gap-4 text-xs mb-3">
				<div>
					<span className="text-stone-400 dark:text-night-500">Horizon</span>
					<div className="font-medium text-stone-700 dark:text-night-200">{thesis.timeHorizon}</div>
				</div>
				<div>
					<span className="text-stone-400 dark:text-night-500">Confidence</span>
					<div className="font-medium text-stone-700 dark:text-night-200">
						{thesis.confidence != null ? `${(thesis.confidence * 100).toFixed(0)}%` : "--"}
					</div>
				</div>
				{thesis.targetPrice && (
					<div>
						<span className="text-stone-400 dark:text-night-500">Target</span>
						<div className="font-medium text-green-600">${thesis.targetPrice.toFixed(0)}</div>
					</div>
				)}
				{thesis.stopPrice && (
					<div>
						<span className="text-stone-400 dark:text-night-500">Stop</span>
						<div className="font-medium text-red-600">${thesis.stopPrice.toFixed(0)}</div>
					</div>
				)}
			</div>

			{/* Footer */}
			<div className="flex items-center justify-between pt-3 border-t border-cream-100 dark:border-night-700">
				{thesis.pnlPct !== null ? (
					<span
						className={`text-sm font-semibold ${thesis.pnlPct >= 0 ? "text-green-600" : "text-red-600"}`}
					>
						{thesis.pnlPct >= 0 ? "+" : ""}
						{thesis.pnlPct.toFixed(1)}%
					</span>
				) : (
					<span className="text-xs text-stone-400 dark:text-night-500">{thesis.agentSource}</span>
				)}
				<span className="text-xs text-stone-400 dark:text-night-500">
					{formatDistanceToNow(new Date(thesis.updatedAt), { addSuffix: true })}
				</span>
			</div>
		</Link>
	);
}
