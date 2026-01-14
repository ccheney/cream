"use client";

/**
 * Symbol-Focused Event Stream
 *
 * Shows all events (quotes, trades, orders, decisions) for a single symbol.
 * Designed to be embedded in charts pages or position details.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 3.2
 */

import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	EVENT_TYPE_COLORS,
	type NormalizedEvent,
	normalizeEvent,
	VALUE_COLORS,
	type WebSocketMessage,
} from "@/lib/feed/event-normalizer";
import { useWebSocketContext as useWebSocket } from "@/providers/WebSocketProvider";

// ============================================
// Types
// ============================================

interface SymbolStreamProps {
	symbol: string;
	showQuoteHeader?: boolean;
	showStatistics?: boolean;
	maxEvents?: number;
	className?: string;
}

interface StreamStats {
	quotes: number;
	trades: number;
	orders: number;
	total: number;
}

// ============================================
// Constants
// ============================================

const DEFAULT_MAX_EVENTS = 200;
const ROW_HEIGHT = 40;

// ============================================
// Component
// ============================================

export function SymbolStream({
	symbol,
	showQuoteHeader = true,
	showStatistics = true,
	maxEvents = DEFAULT_MAX_EVENTS,
	className = "",
}: SymbolStreamProps) {
	const { connected, lastMessage } = useWebSocket();
	const [events, setEvents] = useState<NormalizedEvent[]>([]);
	const [latestQuote, setLatestQuote] = useState<{
		bid: number;
		ask: number;
		last: number;
		change?: number;
	} | null>(null);
	const [stats, setStats] = useState<StreamStats>({ quotes: 0, trades: 0, orders: 0, total: 0 });
	const parentRef = useRef<HTMLDivElement>(null);

	// Filter events for this symbol
	const processMessage = useCallback(
		(message: WebSocketMessage) => {
			const normalized = normalizeEvent(message);
			if (!normalized) {
				return;
			}

			// Filter by symbol
			const eventSymbol = normalized.symbol?.toUpperCase();
			const targetSymbol = symbol.toUpperCase();

			if (eventSymbol !== targetSymbol) {
				return;
			}

			// Update latest quote if it's a quote event
			if (normalized.type === "quote" && normalized.raw) {
				const raw = normalized.raw as { bid: number; ask: number; last?: number };
				setLatestQuote((prev) => ({
					bid: raw.bid,
					ask: raw.ask,
					last: raw.last ?? prev?.last ?? 0,
					change: prev?.last ? raw.last && raw.last - prev.last : undefined,
				}));
			}

			// Add to events
			setEvents((prev) => [normalized, ...prev.slice(0, maxEvents - 1)]);

			// Update stats
			setStats((prev) => ({
				quotes: prev.quotes + (normalized.type === "quote" ? 1 : 0),
				trades: prev.trades + (normalized.type === "trade" ? 1 : 0),
				orders: prev.orders + (normalized.type === "order" || normalized.type === "fill" ? 1 : 0),
				total: prev.total + 1,
			}));
		},
		[symbol, maxEvents]
	);

	// Process incoming WebSocket messages
	useEffect(() => {
		if (lastMessage) {
			processMessage(lastMessage as WebSocketMessage);
		}
	}, [lastMessage, processMessage]);

	// Clear events when symbol changes
	// biome-ignore lint/correctness/useExhaustiveDependencies: symbol is intentionally the trigger
	useEffect(() => {
		setEvents([]);
		setLatestQuote(null);
		setStats({ quotes: 0, trades: 0, orders: 0, total: 0 });
	}, [symbol]);

	// Virtual list
	const virtualizer = useVirtualizer({
		count: events.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => ROW_HEIGHT,
		overscan: 5,
	});

	return (
		<div className={`flex flex-col h-full bg-white dark:bg-night-800 ${className}`}>
			{/* Quote Header */}
			{showQuoteHeader && (
				<div className="px-4 py-3 border-b border-cream-200 dark:border-night-700 bg-cream-50 dark:bg-night-800">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<span className="text-lg font-semibold text-stone-900 dark:text-night-50">
								{symbol}
							</span>
							{latestQuote && (
								<span className="text-lg font-mono text-stone-900 dark:text-night-50">
									${latestQuote.last?.toFixed(2) || "--"}
								</span>
							)}
							{latestQuote?.change !== undefined && latestQuote.change !== 0 && (
								<span
									className={`text-sm font-medium ${
										latestQuote.change >= 0 ? "text-green-500" : "text-red-500"
									}`}
								>
									{latestQuote.change >= 0 ? "+" : ""}
									{latestQuote.change.toFixed(2)}
								</span>
							)}
						</div>
						{latestQuote && (
							<div className="text-sm text-stone-500 dark:text-night-300">
								<span className="font-mono">
									${latestQuote.bid.toFixed(2)} × ${latestQuote.ask.toFixed(2)}
								</span>
								<span className="ml-2 text-stone-400 dark:text-night-400">
									Spread: ${(latestQuote.ask - latestQuote.bid).toFixed(2)}
								</span>
							</div>
						)}
					</div>
				</div>
			)}

			{/* Event Title */}
			<div className="px-4 py-2 border-b border-cream-200 dark:border-night-700 flex items-center justify-between">
				<span className="text-sm font-medium text-stone-700 dark:text-night-100">Event Stream</span>
				<div className="flex items-center gap-1">
					<div
						className={`w-2 h-2 rounded-full ${
							connected ? "bg-green-500 animate-pulse" : "bg-red-500"
						}`}
					/>
					<span className="text-xs text-stone-500 dark:text-night-300">
						{connected ? "Live" : "Offline"}
					</span>
				</div>
			</div>

			{/* Event List */}
			<div ref={parentRef} className="flex-1 overflow-auto">
				{events.length > 0 ? (
					<div
						style={{
							height: virtualizer.getTotalSize(),
							width: "100%",
							position: "relative",
						}}
					>
						{virtualizer.getVirtualItems().map((virtualRow) => {
							const event = events[virtualRow.index];
							if (!event) {
								return null;
							}
							return (
								<div
									key={virtualRow.key}
									style={{
										position: "absolute",
										top: 0,
										left: 0,
										width: "100%",
										height: `${virtualRow.size}px`,
										transform: `translateY(${virtualRow.start}px)`,
									}}
								>
									<SymbolEventRow event={event} />
								</div>
							);
						})}
					</div>
				) : (
					<div className="flex items-center justify-center h-32 text-sm text-stone-400 dark:text-night-400">
						{connected ? `Waiting for ${symbol} events...` : "Not connected"}
					</div>
				)}
			</div>

			{/* Statistics Footer */}
			{showStatistics && (
				<div className="px-4 py-2 border-t border-cream-200 dark:border-night-700 bg-cream-50 dark:bg-night-800">
					<div className="flex items-center gap-4 text-xs text-stone-500 dark:text-night-300">
						<span>
							Trades: <strong className="text-stone-700 dark:text-night-100">{stats.trades}</strong>
						</span>
						<span>
							Quotes:{" "}
							<strong className="text-stone-700 dark:text-night-100">
								{stats.quotes > 1000 ? `${(stats.quotes / 1000).toFixed(1)}K` : stats.quotes}
							</strong>
						</span>
						<span>
							Orders: <strong className="text-stone-700 dark:text-night-100">{stats.orders}</strong>
						</span>
					</div>
				</div>
			)}
		</div>
	);
}

// ============================================
// Event Row Component
// ============================================

function SymbolEventRow({ event }: { event: NormalizedEvent }) {
	const timeStr = event.timestamp.toLocaleTimeString("en-US", {
		hour12: false,
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});

	return (
		<div className="flex items-center gap-2 px-4 h-10 border-b border-cream-100 dark:border-night-700 hover:bg-cream-50 dark:hover:bg-night-750 transition-colors">
			{/* Timestamp */}
			<span className="text-xs font-mono text-stone-400 dark:text-night-400 w-16 flex-shrink-0">
				{timeStr}
			</span>

			{/* Icon & Type */}
			<span className={`text-sm w-4 flex-shrink-0 ${EVENT_TYPE_COLORS[event.type]}`}>
				{event.icon}
			</span>
			<span
				className={`text-xs font-medium uppercase w-14 flex-shrink-0 ${EVENT_TYPE_COLORS[event.type]}`}
			>
				{event.type.replace("_", " ").slice(0, 7)}
			</span>

			{/* Details */}
			<span className={`text-sm flex-1 truncate ${VALUE_COLORS[event.color]}`}>
				{event.details || event.title}
			</span>
		</div>
	);
}

export default SymbolStream;
