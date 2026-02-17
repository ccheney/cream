/**
 * ClosedTradesTable Component
 *
 * Displays closed trades with realized P&L calculated using FIFO matching.
 * Shows entry/exit prices, hold time, and P&L stats.
 */

"use client";

import { memo, useCallback, useMemo, useState } from "react";
import type { ClosedTrade } from "@/lib/api/types";

// ============================================
// Types
// ============================================

export interface ClosedTradesTableProps {
	trades: ClosedTrade[];
	totalRealizedPnl: number;
	winCount: number;
	lossCount: number;
	winRate: number;
	isLoading?: boolean;
}

type SortField =
	| "symbol"
	| "quantity"
	| "entryPrice"
	| "exitPrice"
	| "realizedPnl"
	| "realizedPnlPct"
	| "holdDays"
	| "exitDate";
type SortDirection = "asc" | "desc";

interface SortState {
	field: SortField;
	direction: SortDirection;
}

interface HeaderDef {
	label: string;
	field: SortField;
	align?: "left" | "right";
}

// ============================================
// Constants
// ============================================

const GRID_TEMPLATE =
	"minmax(80px, 1fr) minmax(60px, 0.8fr) minmax(80px, 1fr) minmax(80px, 1fr) minmax(90px, 1.2fr) minmax(70px, 1fr) minmax(60px, 0.8fr) minmax(90px, 1.2fr)";

const HEADER_DEFS: HeaderDef[] = [
	{ label: "Symbol", field: "symbol", align: "left" },
	{ label: "Qty", field: "quantity" },
	{ label: "Entry", field: "entryPrice" },
	{ label: "Exit", field: "exitPrice" },
	{ label: "P&L", field: "realizedPnl" },
	{ label: "Return", field: "realizedPnlPct" },
	{ label: "Hold", field: "holdDays" },
	{ label: "Closed", field: "exitDate" },
];

const NUMERIC_SORT_GETTERS: Record<
	Exclude<SortField, "symbol" | "exitDate">,
	(trade: ClosedTrade) => number
> = {
	quantity: (trade) => trade.quantity,
	entryPrice: (trade) => trade.entryPrice,
	exitPrice: (trade) => trade.exitPrice,
	realizedPnl: (trade) => trade.realizedPnl,
	realizedPnlPct: (trade) => trade.realizedPnlPct,
	holdDays: (trade) => trade.holdDays,
};

// ============================================
// Helpers
// ============================================

const formatCurrency = (value: number, decimals = 2) =>
	new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals,
	}).format(value);

const formatPct = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

const formatDate = (dateStr: string) => {
	const date = new Date(dateStr);
	return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const formatHoldTime = (days: number) => {
	if (days === 0) {
		return "<1 day";
	}
	if (days === 1) {
		return "1 day";
	}
	return `${days} days`;
};

function sortTrades(trades: ClosedTrade[], sortState: SortState): ClosedTrade[] {
	const sorted = [...trades];
	const { field, direction } = sortState;
	const multiplier = direction === "asc" ? 1 : -1;

	sorted.sort((a, b) => {
		if (field === "symbol") {
			return a.symbol.localeCompare(b.symbol) * multiplier;
		}
		if (field === "exitDate") {
			return (new Date(a.exitDate).getTime() - new Date(b.exitDate).getTime()) * multiplier;
		}
		return (NUMERIC_SORT_GETTERS[field](a) - NUMERIC_SORT_GETTERS[field](b)) * multiplier;
	});

	return sorted;
}

// ============================================
// Subcomponents
// ============================================

interface SortableHeaderProps {
	label: string;
	field: SortField;
	currentSort: SortState;
	onSort: (field: SortField) => void;
	align?: "left" | "right";
}

const SortableHeader = memo(function SortableHeader({
	label,
	field,
	currentSort,
	onSort,
	align = "right",
}: SortableHeaderProps) {
	const isActive = currentSort.field === field;
	const icon = isActive ? (currentSort.direction === "asc" ? "↑" : "↓") : "";

	return (
		<button
			type="button"
			className={`px-3 py-3 font-medium cursor-pointer hover:bg-cream-100 dark:hover:bg-night-700 transition-colors select-none text-xs ${
				align === "right" ? "text-right justify-end" : "text-left justify-start"
			} flex items-center gap-1`}
			onClick={() => onSort(field)}
			aria-label={`Sort by ${label}`}
		>
			{align === "right" && <span className="w-3 text-xs">{icon}</span>}
			<span>{label}</span>
			{align === "left" && <span className="w-3 text-xs">{icon}</span>}
		</button>
	);
});

interface TradeRowProps {
	trade: ClosedTrade;
}

const TradeRow = memo(function TradeRow({ trade }: TradeRowProps) {
	const pnlColor = trade.realizedPnl >= 0 ? "text-green-600" : "text-red-600";

	return (
		<div
			className="grid hover:bg-cream-50 dark:hover:bg-night-600 transition-colors border-b border-cream-100 dark:border-night-700"
			style={{ gridTemplateColumns: GRID_TEMPLATE }}
		>
			<div className="px-3 py-3 font-medium text-stone-900 dark:text-night-50 flex items-center text-sm">
				{trade.symbol}
			</div>
			<div className="px-3 py-3 text-right font-mono text-stone-900 dark:text-night-50 flex items-center justify-end text-sm">
				{trade.quantity}
			</div>
			<div className="px-3 py-3 text-right font-mono text-stone-500 dark:text-night-400 flex items-center justify-end text-sm">
				{formatCurrency(trade.entryPrice)}
			</div>
			<div className="px-3 py-3 text-right font-mono text-stone-900 dark:text-night-50 flex items-center justify-end text-sm">
				{formatCurrency(trade.exitPrice)}
			</div>
			<div
				className={`px-3 py-3 text-right font-mono flex items-center justify-end text-sm ${pnlColor}`}
			>
				{trade.realizedPnl >= 0 ? "+" : ""}
				{formatCurrency(trade.realizedPnl, 2)}
			</div>
			<div
				className={`px-3 py-3 text-right font-mono flex items-center justify-end text-sm ${pnlColor}`}
			>
				{formatPct(trade.realizedPnlPct)}
			</div>
			<div className="px-3 py-3 text-right text-stone-500 dark:text-night-400 flex items-center justify-end text-sm">
				{formatHoldTime(trade.holdDays)}
			</div>
			<div className="px-3 py-3 text-right text-stone-500 dark:text-night-400 flex items-center justify-end text-sm">
				{formatDate(trade.exitDate)}
			</div>
		</div>
	);
});

function SummaryStats({
	totalRealizedPnl,
	winRate,
	winCount,
	lossCount,
	tradeCount,
}: {
	totalRealizedPnl: number;
	winRate: number;
	winCount: number;
	lossCount: number;
	tradeCount: number;
}) {
	const totalPnlColor = totalRealizedPnl >= 0 ? "text-green-600" : "text-red-600";

	return (
		<div className="px-4 py-3 border-b border-cream-200 dark:border-night-700 flex items-center justify-between flex-wrap gap-4">
			<div className="flex items-center gap-6">
				<div>
					<span className="text-xs text-stone-500 dark:text-night-400">Total P&L</span>
					<p className={`text-lg font-semibold font-mono ${totalPnlColor}`}>
						{totalRealizedPnl >= 0 ? "+" : ""}
						{formatCurrency(totalRealizedPnl, 2)}
					</p>
				</div>
				<div>
					<span className="text-xs text-stone-500 dark:text-night-400">Win Rate</span>
					<p className="text-lg font-semibold text-stone-900 dark:text-night-50">
						{winRate.toFixed(1)}%
					</p>
				</div>
				<div>
					<span className="text-xs text-stone-500 dark:text-night-400">W / L</span>
					<p className="text-lg font-semibold">
						<span className="text-green-600">{winCount}</span>
						<span className="text-stone-400 mx-1">/</span>
						<span className="text-red-600">{lossCount}</span>
					</p>
				</div>
			</div>
			<span className="text-sm text-stone-500 dark:text-night-300">{tradeCount} trades</span>
		</div>
	);
}

function LoadingRows() {
	return (
		<div className="p-4 space-y-2">
			{["row-1", "row-2", "row-3"].map((rowKey) => (
				<div key={rowKey} className="h-12 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
			))}
		</div>
	);
}

function TradesGrid({
	sortState,
	onSort,
	sortedTrades,
}: {
	sortState: SortState;
	onSort: (field: SortField) => void;
	sortedTrades: ClosedTrade[];
}) {
	return (
		<div>
			<div
				className="grid bg-cream-50 dark:bg-night-700 text-stone-500 dark:text-night-300 border-b border-cream-200 dark:border-night-700"
				style={{ gridTemplateColumns: GRID_TEMPLATE }}
			>
				{HEADER_DEFS.map((header) => (
					<SortableHeader
						key={header.field}
						label={header.label}
						field={header.field}
						currentSort={sortState}
						onSort={onSort}
						align={header.align}
					/>
				))}
			</div>
			<div className="max-h-[400px] overflow-auto">
				{sortedTrades.map((trade) => (
					<TradeRow key={trade.id} trade={trade} />
				))}
			</div>
		</div>
	);
}

// ============================================
// Main Component
// ============================================

export const ClosedTradesTable = memo(function ClosedTradesTable({
	trades,
	totalRealizedPnl,
	winCount,
	lossCount,
	winRate,
	isLoading = false,
}: ClosedTradesTableProps) {
	const [sortState, setSortState] = useState<SortState>({ field: "exitDate", direction: "desc" });
	const sortedTrades = useMemo(() => sortTrades(trades, sortState), [trades, sortState]);

	const handleSort = useCallback((field: SortField) => {
		setSortState((prev) => ({
			field,
			direction: prev.field === field && prev.direction === "desc" ? "asc" : "desc",
		}));
	}, []);

	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
			<SummaryStats
				totalRealizedPnl={totalRealizedPnl}
				winRate={winRate}
				winCount={winCount}
				lossCount={lossCount}
				tradeCount={trades.length}
			/>
			{isLoading && <LoadingRows />}
			{!isLoading && trades.length > 0 && (
				<TradesGrid sortState={sortState} onSort={handleSort} sortedTrades={sortedTrades} />
			)}
			{!isLoading && trades.length === 0 && (
				<div className="p-8 text-center text-stone-400 dark:text-night-400">No closed trades</div>
			)}
		</div>
	);
});

export default ClosedTradesTable;
