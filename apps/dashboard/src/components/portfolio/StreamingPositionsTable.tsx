/**
 * StreamingPositionsTable Component
 *
 * Real-time positions table with streaming price updates, flash animations,
 * sortable columns, and virtualization for large portfolios.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 4.2
 */

"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import Link from "next/link";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { usePriceFlash } from "@/components/ui/use-price-flash";
import type { StreamingPosition } from "@/hooks/usePortfolioStreaming";

// ============================================
// Types
// ============================================

export interface StreamingPositionsTableProps {
	positions: StreamingPosition[];
	isStreaming: boolean;
	isLoading?: boolean;
}

type SortField =
	| "symbol"
	| "qty"
	| "avgEntry"
	| "livePrice"
	| "liveDayPnl"
	| "liveUnrealizedPnl"
	| "liveUnrealizedPnlPct";

type SortDirection = "asc" | "desc";

interface SortState {
	field: SortField;
	direction: SortDirection;
}

// ============================================
// Constants
// ============================================

const ROW_HEIGHT = 48;
const OVERSCAN = 5;

// Grid template for consistent column widths (7 columns)
const GRID_TEMPLATE =
	"minmax(100px, 1.5fr) minmax(60px, 1fr) minmax(80px, 1.2fr) minmax(80px, 1.2fr) minmax(80px, 1.2fr) minmax(90px, 1.3fr) minmax(80px, 1.2fr)";

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
			className={`px-4 py-3 font-medium cursor-pointer hover:bg-cream-100 dark:hover:bg-night-700 transition-colors select-none ${
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

interface VirtualizedRowProps {
	position: StreamingPosition;
	style: React.CSSProperties;
}

const VirtualizedRow = memo(function VirtualizedRow({ position, style }: VirtualizedRowProps) {
	const { flash } = usePriceFlash(position.livePrice, position.previousPrice);

	const pnlColor = position.liveUnrealizedPnl >= 0 ? "text-green-600" : "text-red-600";
	const dayPnlColor = position.liveDayPnl >= 0 ? "text-green-600" : "text-red-600";

	const pnlFlashClasses = flash.isFlashing
		? flash.direction === "up"
			? "animate-flash-profit"
			: "animate-flash-loss"
		: "";

	return (
		<div
			className="grid hover:bg-cream-50 dark:hover:bg-night-600 transition-colors absolute left-0 right-0 border-b border-cream-100 dark:border-night-700"
			style={{ ...style, gridTemplateColumns: GRID_TEMPLATE }}
			role="row"
		>
			{/* Symbol */}
			<div
				className="px-4 py-3 font-medium text-stone-900 dark:text-night-50 flex items-center"
				role="cell"
			>
				<div className="flex items-center gap-2">
					<Link href={`/portfolio/positions/${position.id}`} className="hover:text-blue-600">
						{position.symbol}
					</Link>
					{position.isStreaming && (
						<span
							className="w-2 h-2 rounded-full bg-green-500 animate-pulse"
							title="Live streaming"
							role="status"
							aria-label="Live streaming"
						/>
					)}
				</div>
			</div>

			{/* Quantity */}
			<div
				className="px-4 py-3 text-right font-mono text-stone-900 dark:text-night-50 flex items-center justify-end"
				role="cell"
			>
				<span
					className={`px-2 py-0.5 text-xs font-medium rounded ${
						position.side === "LONG"
							? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
							: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
					}`}
				>
					{position.qty}
				</span>
			</div>

			{/* Avg Entry */}
			<div
				className="px-4 py-3 text-right font-mono text-stone-900 dark:text-night-50 flex items-center justify-end"
				role="cell"
			>
				{formatCurrency(position.avgEntry)}
			</div>

			{/* Current Price (flashes on update) */}
			<div
				className={`px-4 py-3 text-right flex items-center justify-end ${pnlFlashClasses} rounded`}
				role="cell"
			>
				<AnimatedNumber
					value={position.livePrice}
					format="currency"
					decimals={2}
					className="font-mono text-stone-900 dark:text-night-50"
					animationThreshold={0.001}
				/>
			</div>

			{/* Day P&L */}
			<div
				className={`px-4 py-3 text-right font-mono flex items-center justify-end ${dayPnlColor}`}
				role="cell"
			>
				{position.liveDayPnl >= 0 ? "+" : ""}
				<AnimatedNumber
					value={position.liveDayPnl}
					format="currency"
					decimals={0}
					className="inline"
					animationThreshold={1}
				/>
			</div>

			{/* Unrealized P&L */}
			<div
				className={`px-4 py-3 text-right font-mono flex items-center justify-end ${pnlColor}`}
				role="cell"
			>
				{position.liveUnrealizedPnl >= 0 ? "+" : ""}
				<AnimatedNumber
					value={position.liveUnrealizedPnl}
					format="currency"
					decimals={0}
					className="inline"
					animationThreshold={1}
				/>
			</div>

			{/* % Change */}
			<div
				className={`px-4 py-3 text-right font-mono flex items-center justify-end ${pnlColor}`}
				role="cell"
			>
				{formatPct(position.liveUnrealizedPnlPct)}
			</div>
		</div>
	);
});

// ============================================
// Main Component
// ============================================

export const StreamingPositionsTable = memo(function StreamingPositionsTable({
	positions,
	isStreaming,
	isLoading = false,
}: StreamingPositionsTableProps) {
	const parentRef = useRef<HTMLDivElement>(null);

	// Sort state
	const [sortState, setSortState] = useState<SortState>({
		field: "symbol",
		direction: "asc",
	});

	// Handle sort toggle
	const handleSort = useCallback((field: SortField) => {
		setSortState((prev) => ({
			field,
			direction: prev.field === field && prev.direction === "asc" ? "desc" : "asc",
		}));
	}, []);

	// Sort positions
	const sortedPositions = useMemo(() => {
		const sorted = [...positions];
		const { field, direction } = sortState;
		const multiplier = direction === "asc" ? 1 : -1;

		sorted.sort((a, b) => {
			let aVal: number | string;
			let bVal: number | string;

			switch (field) {
				case "symbol":
					aVal = a.symbol;
					bVal = b.symbol;
					break;
				case "qty":
					aVal = a.qty;
					bVal = b.qty;
					break;
				case "avgEntry":
					aVal = a.avgEntry;
					bVal = b.avgEntry;
					break;
				case "livePrice":
					aVal = a.livePrice;
					bVal = b.livePrice;
					break;
				case "liveDayPnl":
					aVal = a.liveDayPnl;
					bVal = b.liveDayPnl;
					break;
				case "liveUnrealizedPnl":
					aVal = a.liveUnrealizedPnl;
					bVal = b.liveUnrealizedPnl;
					break;
				case "liveUnrealizedPnlPct":
					aVal = a.liveUnrealizedPnlPct;
					bVal = b.liveUnrealizedPnlPct;
					break;
				default:
					aVal = a.symbol;
					bVal = b.symbol;
			}

			if (typeof aVal === "string" && typeof bVal === "string") {
				return aVal.localeCompare(bVal) * multiplier;
			}

			return ((aVal as number) - (bVal as number)) * multiplier;
		});

		return sorted;
	}, [positions, sortState]);

	// Virtualizer
	const virtualizer = useVirtualizer({
		count: sortedPositions.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => ROW_HEIGHT,
		overscan: OVERSCAN,
	});

	const virtualItems = virtualizer.getVirtualItems();
	const totalSize = virtualizer.getTotalSize();

	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
			{/* Header */}
			<div className="p-4 border-b border-cream-200 dark:border-night-700 flex items-center justify-between">
				<h2 className="text-lg font-medium text-stone-900 dark:text-night-50">Open Positions</h2>
				<div className="flex items-center gap-3">
					{isStreaming && (
						<div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
							<span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
							Live
						</div>
					)}
					<span className="text-sm text-stone-500 dark:text-night-300">
						{positions.length} positions
					</span>
				</div>
			</div>

			{isLoading ? (
				<div className="p-4 space-y-2">
					{[1, 2, 3].map((i) => (
						<div key={i} className="h-12 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
					))}
				</div>
			) : positions.length > 0 ? (
				<div role="table" aria-label="Open positions">
					{/* Column headers */}
					<div
						className="grid bg-cream-50 dark:bg-night-700 text-sm text-stone-500 dark:text-night-300 border-b border-cream-200 dark:border-night-700"
						style={{ gridTemplateColumns: GRID_TEMPLATE }}
						role="row"
					>
						<SortableHeader
							label="Symbol"
							field="symbol"
							currentSort={sortState}
							onSort={handleSort}
							align="left"
						/>
						<SortableHeader label="Qty" field="qty" currentSort={sortState} onSort={handleSort} />
						<SortableHeader
							label="Avg Entry"
							field="avgEntry"
							currentSort={sortState}
							onSort={handleSort}
						/>
						<SortableHeader
							label="Current"
							field="livePrice"
							currentSort={sortState}
							onSort={handleSort}
						/>
						<SortableHeader
							label="Day P&L"
							field="liveDayPnl"
							currentSort={sortState}
							onSort={handleSort}
						/>
						<SortableHeader
							label="Unrealized"
							field="liveUnrealizedPnl"
							currentSort={sortState}
							onSort={handleSort}
						/>
						<SortableHeader
							label="% Change"
							field="liveUnrealizedPnlPct"
							currentSort={sortState}
							onSort={handleSort}
						/>
					</div>

					{/* Virtualized rows */}
					<div
						ref={parentRef}
						className="overflow-auto"
						style={{ maxHeight: "400px" }}
						role="rowgroup"
					>
						<div style={{ height: totalSize, position: "relative" }}>
							{virtualItems.map((virtualItem) => {
								const position = sortedPositions[virtualItem.index];
								if (!position) {
									return null;
								}
								return (
									<VirtualizedRow
										key={position.id}
										position={position}
										style={{
											height: `${virtualItem.size}px`,
											transform: `translateY(${virtualItem.start}px)`,
										}}
									/>
								);
							})}
						</div>
					</div>
				</div>
			) : (
				<div className="p-8 text-center text-stone-400 dark:text-night-400">No positions</div>
			)}
		</div>
	);
});

export default StreamingPositionsTable;
