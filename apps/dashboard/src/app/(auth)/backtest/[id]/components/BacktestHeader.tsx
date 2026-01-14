"use client";

import { ArrowLeft, Download, Trash2 } from "lucide-react";
import Link from "next/link";
import { BacktestProgressBar } from "@/components/backtest";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "./hooks";
import type {
	BacktestHeaderProps,
	BacktestParametersProps,
	BacktestProgressSectionProps,
	BacktestStatus,
} from "./types";

function getStatusClasses(status: BacktestStatus): string {
	switch (status) {
		case "completed":
			return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
		case "running":
			return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
		case "failed":
			return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
		default:
			return "bg-cream-100 text-stone-700 dark:bg-night-700 dark:text-night-400";
	}
}

export function BacktestHeader({
	name,
	startDate,
	endDate,
	status,
	onExportCSV,
	onDelete,
	deleteConfirm,
	deleteDisabled,
	exportDisabled,
}: BacktestHeaderProps): React.ReactElement {
	return (
		<div className="flex items-center justify-between">
			<div className="flex items-center gap-4">
				<Link
					href="/backtest"
					className="p-2 rounded-md text-stone-500 dark:text-night-300 hover:bg-cream-100 dark:hover:bg-night-700 transition-colors"
				>
					<ArrowLeft className="w-5 h-5" />
				</Link>
				<div>
					<h1 className="text-2xl font-semibold text-stone-900 dark:text-night-50">{name}</h1>
					<p className="text-sm text-stone-500 dark:text-night-300">
						{startDate} to {endDate}
					</p>
				</div>
				<span className={`px-2 py-0.5 text-xs font-medium rounded ${getStatusClasses(status)}`}>
					{status}
				</span>
			</div>
			<div className="flex items-center gap-2">
				<Button variant="secondary" size="sm" onClick={onExportCSV} disabled={exportDisabled}>
					<Download className="w-4 h-4 mr-1" />
					Export CSV
				</Button>
				<Button
					variant={deleteConfirm ? "destructive" : "secondary"}
					size="sm"
					onClick={onDelete}
					disabled={deleteDisabled}
				>
					<Trash2 className="w-4 h-4 mr-1" />
					{deleteConfirm ? "Confirm Delete" : "Delete"}
				</Button>
			</div>
		</div>
	);
}

export function BacktestProgressSection({
	progressPct,
	barsProcessed,
	totalBars,
}: BacktestProgressSectionProps): React.ReactElement {
	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
			<h2 className="text-lg font-medium text-stone-900 dark:text-night-50 mb-3">
				Backtest Progress
			</h2>
			<BacktestProgressBar
				progressPct={progressPct}
				status="running"
				showPhase
				showValue
				size="lg"
			/>
			{barsProcessed !== undefined && totalBars !== undefined && (
				<p className="mt-2 text-sm text-stone-500 dark:text-night-300">
					Processing bar {barsProcessed} of {totalBars}
				</p>
			)}
		</div>
	);
}

export function BacktestParameters({
	initialCapital,
	startDate,
	endDate,
	finalNav,
	totalTrades,
}: BacktestParametersProps): React.ReactElement {
	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
			<h2 className="text-lg font-medium text-stone-900 dark:text-night-50 mb-3">Parameters</h2>
			<div className="grid grid-cols-4 gap-4">
				<div>
					<div className="text-sm text-stone-500 dark:text-night-300">Initial Capital</div>
					<div className="text-lg font-semibold text-stone-900 dark:text-night-50">
						{formatCurrency(initialCapital)}
					</div>
				</div>
				<div>
					<div className="text-sm text-stone-500 dark:text-night-300">Period</div>
					<div className="text-lg font-semibold text-stone-900 dark:text-night-50">
						{startDate} - {endDate}
					</div>
				</div>
				<div>
					<div className="text-sm text-stone-500 dark:text-night-300">Final NAV</div>
					<div className="text-lg font-semibold text-stone-900 dark:text-night-50">
						{finalNav !== null ? formatCurrency(finalNav) : "--"}
					</div>
				</div>
				<div>
					<div className="text-sm text-stone-500 dark:text-night-300">Total Trades</div>
					<div className="text-lg font-semibold text-stone-900 dark:text-night-50">
						{totalTrades ?? "--"}
					</div>
				</div>
			</div>
		</div>
	);
}
