/**
 * PositionsPanel Component
 *
 * Tabbed panel showing Open Positions and Closed Trades.
 * Uses StreamingPositionsTable for open positions and ClosedTradesTable for closed trades.
 */

"use client";

import { memo, useState } from "react";
import { useClosedTrades } from "@/hooks/queries/usePortfolio";
import type { StreamingPosition } from "@/hooks/usePortfolioStreaming";
import { PositionsTable } from "./PositionsTable";

// ============================================
// Types
// ============================================

export interface PositionsPanelProps {
	positions: StreamingPosition[];
	isStreaming: boolean;
	isLoading?: boolean;
}

type TabId = "open" | "closed";

// ============================================
// Main Component
// ============================================

export const PositionsPanel = memo(function PositionsPanel({
	positions,
	isStreaming,
	isLoading = false,
}: PositionsPanelProps) {
	const [activeTab, setActiveTab] = useState<TabId>("open");

	const { data: closedTradesData, isLoading: closedTradesLoading } = useClosedTrades({
		limit: 100,
	});

	const tabs: { id: TabId; label: string; count?: number }[] = [
		{ id: "open", label: "Open", count: positions.length },
		{ id: "closed", label: "Closed", count: closedTradesData?.count },
	];

	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
			{/* Tab Header */}
			<div className="px-4 pt-4 pb-0 border-b border-cream-200 dark:border-night-700">
				<div className="flex items-center gap-1">
					{tabs.map((tab) => (
						<button
							key={tab.id}
							type="button"
							onClick={() => setActiveTab(tab.id)}
							className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors relative ${
								activeTab === tab.id
									? "text-stone-900 dark:text-night-50 bg-cream-50 dark:bg-night-800"
									: "text-stone-500 dark:text-night-400 hover:text-stone-700 dark:hover:text-night-200 hover:bg-cream-50 dark:hover:bg-night-600"
							}`}
						>
							{tab.label}
							{tab.count !== undefined && (
								<span
									className={`ml-2 px-1.5 py-0.5 text-xs rounded-full ${
										activeTab === tab.id
											? "bg-stone-200 dark:bg-night-600 text-stone-700 dark:text-night-200"
											: "bg-cream-100 dark:bg-night-700 text-stone-500 dark:text-night-400"
									}`}
								>
									{tab.count}
								</span>
							)}
							{activeTab === tab.id && (
								<span className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-600" />
							)}
						</button>
					))}

					{/* Streaming indicator for open positions */}
					{activeTab === "open" && isStreaming && (
						<div className="ml-auto flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
							<span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
							Live
						</div>
					)}
				</div>
			</div>

			{/* Tab Content */}
			<div>
				{activeTab === "open" ? (
					<OpenPositionsContent
						positions={positions}
						isStreaming={isStreaming}
						isLoading={isLoading}
					/>
				) : (
					<ClosedTradesContent data={closedTradesData} isLoading={closedTradesLoading} />
				)}
			</div>
		</div>
	);
});

// ============================================
// Tab Content Components
// ============================================

interface OpenPositionsContentProps {
	positions: StreamingPosition[];
	isStreaming: boolean;
	isLoading: boolean;
}

const OpenPositionsContent = memo(function OpenPositionsContent({
	positions,
	isLoading,
}: OpenPositionsContentProps) {
	if (isLoading) {
		return (
			<div className="p-4 space-y-2">
				{[1, 2, 3].map((i) => (
					<div key={i} className="h-12 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
				))}
			</div>
		);
	}

	if (positions.length === 0) {
		return (
			<div className="p-8 text-center text-stone-400 dark:text-night-400">No open positions</div>
		);
	}

	return <PositionsTable positions={positions} />;
});

interface ClosedTradesContentProps {
	data?: {
		trades: Array<{
			id: string;
			symbol: string;
			side: "LONG" | "SHORT";
			quantity: number;
			entryPrice: number;
			exitPrice: number;
			entryDate: string;
			exitDate: string;
			holdDays: number;
			realizedPnl: number;
			realizedPnlPct: number;
			entryOrderId: string | null;
			exitOrderId: string;
		}>;
		count: number;
		totalRealizedPnl: number;
		winCount: number;
		lossCount: number;
		winRate: number;
	};
	isLoading: boolean;
}

const ClosedTradesContent = memo(function ClosedTradesContent({
	data,
	isLoading,
}: ClosedTradesContentProps) {
	if (isLoading) {
		return (
			<div className="p-4 space-y-2">
				{[1, 2, 3].map((i) => (
					<div key={i} className="h-12 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
				))}
			</div>
		);
	}

	if (!data || data.trades.length === 0) {
		return (
			<div className="p-8 text-center text-stone-400 dark:text-night-400">No closed trades</div>
		);
	}

	return (
		<ClosedTradesTableInner
			trades={data.trades}
			totalRealizedPnl={data.totalRealizedPnl}
			winCount={data.winCount}
			lossCount={data.lossCount}
			winRate={data.winRate}
		/>
	);
});

// ============================================
// Inner Table Components (without card wrapper)
// ============================================

import Link from "next/link";
import { useCallback, useMemo } from "react";
import { SourceLogo } from "@/components/ui/source-logo";
import { buildTickerLogoUrl } from "@/lib/config";

const GRID_TEMPLATE_CLOSED =
	"minmax(80px, 1fr) minmax(60px, 0.8fr) minmax(80px, 1fr) minmax(80px, 1fr) minmax(90px, 1.2fr) minmax(70px, 1fr) minmax(60px, 0.8fr) minmax(90px, 1.2fr)";

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
		return "<1d";
	}
	if (days === 1) {
		return "1d";
	}
	return `${days}d`;
};

// Inline closed trades table without card wrapper
interface ClosedTradesTableInnerProps {
	trades: Array<{
		id: string;
		symbol: string;
		side: "LONG" | "SHORT";
		quantity: number;
		entryPrice: number;
		exitPrice: number;
		entryDate: string;
		exitDate: string;
		holdDays: number;
		realizedPnl: number;
		realizedPnlPct: number;
		entryOrderId: string | null;
		exitOrderId: string;
	}>;
	totalRealizedPnl: number;
	winCount: number;
	lossCount: number;
	winRate: number;
}

type ClosedSortField =
	| "symbol"
	| "quantity"
	| "entryPrice"
	| "exitPrice"
	| "realizedPnl"
	| "realizedPnlPct"
	| "holdDays"
	| "exitDate";

interface ClosedHeaderDef {
	label: string;
	field: ClosedSortField;
	align?: "left" | "right";
}

const CLOSED_HEADERS: ClosedHeaderDef[] = [
	{ label: "Symbol", field: "symbol", align: "left" },
	{ label: "Qty", field: "quantity" },
	{ label: "Entry", field: "entryPrice" },
	{ label: "Exit", field: "exitPrice" },
	{ label: "P&L", field: "realizedPnl" },
	{ label: "Return", field: "realizedPnlPct" },
	{ label: "Hold", field: "holdDays" },
	{ label: "Closed", field: "exitDate" },
];

function sortClosedTrades(
	trades: ClosedTradesTableInnerProps["trades"],
	sortState: { field: ClosedSortField; direction: "asc" | "desc" },
) {
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
		const aVal = a[field] as number;
		const bVal = b[field] as number;
		return (aVal - bVal) * multiplier;
	});

	return sorted;
}

const ClosedTradesTableInner = memo(function ClosedTradesTableInner({
	trades,
}: ClosedTradesTableInnerProps) {
	const [sortState, setSortState] = useState<{ field: ClosedSortField; direction: "asc" | "desc" }>(
		{
			field: "exitDate",
			direction: "desc",
		},
	);

	const handleSort = useCallback((field: ClosedSortField) => {
		setSortState((prev) => ({
			field,
			direction: prev.field === field && prev.direction === "desc" ? "asc" : "desc",
		}));
	}, []);

	const sortedTrades = useMemo(() => sortClosedTrades(trades, sortState), [trades, sortState]);

	return <ClosedTradesGrid sortState={sortState} onSort={handleSort} sortedTrades={sortedTrades} />;
});

function ClosedTradesGrid({
	sortState,
	onSort,
	sortedTrades,
}: {
	sortState: { field: ClosedSortField; direction: "asc" | "desc" };
	onSort: (field: ClosedSortField) => void;
	sortedTrades: ClosedTradesTableInnerProps["trades"];
}) {
	return (
		<div>
			<div
				className="grid bg-cream-50 dark:bg-night-700 text-sm text-stone-500 dark:text-night-300 border-b border-cream-200 dark:border-night-700"
				style={{ gridTemplateColumns: GRID_TEMPLATE_CLOSED }}
			>
				{CLOSED_HEADERS.map((header) => (
					<SortHeaderClosed
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
					<ClosedTradeRow key={trade.id} trade={trade} />
				))}
			</div>
		</div>
	);
}

interface SortHeaderClosedProps {
	label: string;
	field: ClosedSortField;
	currentSort: { field: ClosedSortField; direction: "asc" | "desc" };
	onSort: (field: ClosedSortField) => void;
	align?: "left" | "right";
}

const SortHeaderClosed = memo(function SortHeaderClosed({
	label,
	field,
	currentSort,
	onSort,
	align = "right",
}: SortHeaderClosedProps) {
	const isActive = currentSort.field === field;
	const icon = isActive ? (currentSort.direction === "asc" ? "↑" : "↓") : "";
	return (
		<button
			type="button"
			className={`px-4 py-3 font-medium cursor-pointer hover:bg-cream-100 dark:hover:bg-night-700 transition-colors select-none ${align === "right" ? "text-right justify-end" : "text-left justify-start"} flex items-center gap-1`}
			onClick={() => onSort(field)}
		>
			{align === "right" && <span className="w-3 text-xs">{icon}</span>}
			<span>{label}</span>
			{align === "left" && <span className="w-3 text-xs">{icon}</span>}
		</button>
	);
});

const ClosedTradeRow = memo(function ClosedTradeRow({
	trade,
}: {
	trade: ClosedTradesTableInnerProps["trades"][0];
}) {
	const pnlColor = trade.realizedPnl >= 0 ? "text-green-600" : "text-red-600";

	return (
		<div
			className="grid hover:bg-cream-50 dark:hover:bg-night-600 transition-colors border-b border-cream-100 dark:border-night-700"
			style={{ gridTemplateColumns: GRID_TEMPLATE_CLOSED }}
		>
			<div className="px-4 py-3 font-medium text-stone-900 dark:text-night-50 flex items-center">
				<div className="flex items-center gap-2">
					<SourceLogo
						logoUrl={buildTickerLogoUrl(trade.symbol)}
						domain={trade.symbol}
						size="sm"
						fallback="company"
					/>
					<Link href={`/portfolio/positions/${trade.id}`} className="hover:text-blue-600">
						{trade.symbol}
					</Link>
				</div>
			</div>
			<div className="px-4 py-3 text-right font-mono text-stone-900 dark:text-night-50 flex items-center justify-end">
				<span
					className={`px-2 py-0.5 text-xs font-medium rounded ${trade.side === "LONG" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"}`}
				>
					{trade.quantity}
				</span>
			</div>
			<div className="px-4 py-3 text-right font-mono text-stone-900 dark:text-night-50 flex items-center justify-end">
				{formatCurrency(trade.entryPrice)}
			</div>
			<div className="px-4 py-3 text-right font-mono text-stone-900 dark:text-night-50 flex items-center justify-end">
				{formatCurrency(trade.exitPrice)}
			</div>
			<div className={`px-4 py-3 text-right font-mono flex items-center justify-end ${pnlColor}`}>
				{trade.realizedPnl >= 0 ? "+" : ""}
				{formatCurrency(trade.realizedPnl, 2)}
			</div>
			<div className={`px-4 py-3 text-right font-mono flex items-center justify-end ${pnlColor}`}>
				{formatPct(trade.realizedPnlPct)}
			</div>
			<div className="px-4 py-3 text-right text-stone-500 dark:text-night-300 flex items-center justify-end">
				{formatHoldTime(trade.holdDays)}
			</div>
			<div className="px-4 py-3 text-right text-stone-500 dark:text-night-300 flex items-center justify-end">
				{formatDate(trade.exitDate)}
			</div>
		</div>
	);
});

export default PositionsPanel;
