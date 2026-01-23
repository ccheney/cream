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

// ============================================
// Constants
// ============================================

const GRID_TEMPLATE =
	"minmax(80px, 1fr) minmax(60px, 0.8fr) minmax(80px, 1fr) minmax(80px, 1fr) minmax(90px, 1.2fr) minmax(70px, 1fr) minmax(60px, 0.8fr) minmax(90px, 1.2fr)";

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
			role="row"
			tabIndex={0}
		>
			{/* Symbol */}
			<div
				className="px-3 py-3 font-medium text-stone-900 dark:text-night-50 flex items-center text-sm"
				role="cell"
			>
				{trade.symbol}
			</div>

			{/* Quantity */}
			<div
				className="px-3 py-3 text-right font-mono text-stone-900 dark:text-night-50 flex items-center justify-end text-sm"
				role="cell"
			>
				{trade.quantity}
			</div>

			{/* Entry Price */}
			<div
				className="px-3 py-3 text-right font-mono text-stone-500 dark:text-night-400 flex items-center justify-end text-sm"
				role="cell"
			>
				{formatCurrency(trade.entryPrice)}
			</div>

			{/* Exit Price */}
			<div
				className="px-3 py-3 text-right font-mono text-stone-900 dark:text-night-50 flex items-center justify-end text-sm"
				role="cell"
			>
				{formatCurrency(trade.exitPrice)}
			</div>

			{/* Realized P&L */}
			<div
				className={`px-3 py-3 text-right font-mono flex items-center justify-end text-sm ${pnlColor}`}
				role="cell"
			>
				{trade.realizedPnl >= 0 ? "+" : ""}
				{formatCurrency(trade.realizedPnl, 2)}
			</div>

			{/* % Return */}
			<div
				className={`px-3 py-3 text-right font-mono flex items-center justify-end text-sm ${pnlColor}`}
				role="cell"
			>
				{formatPct(trade.realizedPnlPct)}
			</div>

			{/* Hold Time */}
			<div
				className="px-3 py-3 text-right text-stone-500 dark:text-night-400 flex items-center justify-end text-sm"
				role="cell"
			>
				{formatHoldTime(trade.holdDays)}
			</div>

			{/* Exit Date */}
			<div
				className="px-3 py-3 text-right text-stone-500 dark:text-night-400 flex items-center justify-end text-sm"
				role="cell"
			>
				{formatDate(trade.exitDate)}
			</div>
		</div>
	);
});

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
	const [sortState, setSortState] = useState<SortState>({
		field: "exitDate",
		direction: "desc",
	});

	const handleSort = useCallback((field: SortField) => {
		setSortState((prev) => ({
			field,
			direction: prev.field === field && prev.direction === "desc" ? "asc" : "desc",
		}));
	}, []);

	const sortedTrades = useMemo(() => {
		const sorted = [...trades];
		const { field, direction } = sortState;
		const multiplier = direction === "asc" ? 1 : -1;

		sorted.sort((a, b) => {
			let aVal: number | string;
			let bVal: number | string;

			switch (field) {
				case "symbol":
					return a.symbol.localeCompare(b.symbol) * multiplier;
				case "quantity":
					aVal = a.quantity;
					bVal = b.quantity;
					break;
				case "entryPrice":
					aVal = a.entryPrice;
					bVal = b.entryPrice;
					break;
				case "exitPrice":
					aVal = a.exitPrice;
					bVal = b.exitPrice;
					break;
				case "realizedPnl":
					aVal = a.realizedPnl;
					bVal = b.realizedPnl;
					break;
				case "realizedPnlPct":
					aVal = a.realizedPnlPct;
					bVal = b.realizedPnlPct;
					break;
				case "holdDays":
					aVal = a.holdDays;
					bVal = b.holdDays;
					break;
				case "exitDate":
					aVal = new Date(a.exitDate).getTime();
					bVal = new Date(b.exitDate).getTime();
					break;
				default:
					return 0;
			}

			return ((aVal as number) - (bVal as number)) * multiplier;
		});

		return sorted;
	}, [trades, sortState]);

	const totalPnlColor = totalRealizedPnl >= 0 ? "text-green-600" : "text-red-600";

	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
			{/* Summary Stats */}
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
				<span className="text-sm text-stone-500 dark:text-night-300">{trades.length} trades</span>
			</div>

			{isLoading ? (
				<div className="p-4 space-y-2">
					{[1, 2, 3].map((i) => (
						<div key={i} className="h-12 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
					))}
				</div>
			) : trades.length > 0 ? (
				<div role="table" aria-label="Closed trades">
					{/* Column headers */}
					<div
						className="grid bg-cream-50 dark:bg-night-700 text-stone-500 dark:text-night-300 border-b border-cream-200 dark:border-night-700"
						style={{ gridTemplateColumns: GRID_TEMPLATE }}
						role="row"
						tabIndex={0}
					>
						<SortableHeader
							label="Symbol"
							field="symbol"
							currentSort={sortState}
							onSort={handleSort}
							align="left"
						/>
						<SortableHeader
							label="Qty"
							field="quantity"
							currentSort={sortState}
							onSort={handleSort}
						/>
						<SortableHeader
							label="Entry"
							field="entryPrice"
							currentSort={sortState}
							onSort={handleSort}
						/>
						<SortableHeader
							label="Exit"
							field="exitPrice"
							currentSort={sortState}
							onSort={handleSort}
						/>
						<SortableHeader
							label="P&L"
							field="realizedPnl"
							currentSort={sortState}
							onSort={handleSort}
						/>
						<SortableHeader
							label="Return"
							field="realizedPnlPct"
							currentSort={sortState}
							onSort={handleSort}
						/>
						<SortableHeader
							label="Hold"
							field="holdDays"
							currentSort={sortState}
							onSort={handleSort}
						/>
						<SortableHeader
							label="Closed"
							field="exitDate"
							currentSort={sortState}
							onSort={handleSort}
						/>
					</div>

					{/* Rows */}
					<div className="max-h-[400px] overflow-auto" role="rowgroup">
						{sortedTrades.map((trade) => (
							<TradeRow key={trade.id} trade={trade} />
						))}
					</div>
				</div>
			) : (
				<div className="p-8 text-center text-stone-400 dark:text-night-400">No closed trades</div>
			)}
		</div>
	);
});

export default ClosedTradesTable;
