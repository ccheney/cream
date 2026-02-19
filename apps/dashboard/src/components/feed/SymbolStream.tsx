/**
 * Symbol-Focused Event Stream
 *
 * Shows all events (quotes, trades, orders, decisions) for a single symbol.
 * Designed to be embedded in charts pages or position details.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 3.2
 */

import { useVirtualizer } from "@tanstack/react-virtual";
import type { ReactElement } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	EVENT_TYPE_COLORS,
	type NormalizedEvent,
	normalizeEvent,
	VALUE_COLORS,
	type WebSocketMessage,
} from "@/lib/feed/event-normalizer";
import { useWebSocketContext as useWebSocket } from "@/providers/WebSocketProvider";

interface SymbolStreamProps {
	symbol: string;
	showQuoteHeader?: boolean;
	showStatistics?: boolean;
	maxEvents?: number;
	className?: string;
}

interface QuoteState {
	bid: number;
	ask: number;
	last: number;
	change?: number;
}

interface StreamStats {
	quotes: number;
	trades: number;
	orders: number;
	total: number;
}

type StreamVirtualizer = ReturnType<typeof useVirtualizer<HTMLDivElement, Element>>;

const DEFAULT_MAX_EVENTS = 200;
const ROW_HEIGHT = 40;

function calculateNextLatestQuote(
	prev: QuoteState | null,
	quote: { bid: number; ask: number; last?: number },
): QuoteState {
	const nextLast = quote.last ?? prev?.last ?? 0;
	return {
		bid: quote.bid,
		ask: quote.ask,
		last: nextLast,
		change: prev?.last ? nextLast - prev.last : undefined,
	};
}

function formatChangeLabel(value?: number): ReactElement | null {
	if (value === undefined || value === 0) {
		return null;
	}

	return (
		<span className={`text-sm font-medium ${value >= 0 ? "text-green-500" : "text-red-500"}`}>
			{value >= 0 ? "+" : ""}
			{value.toFixed(2)}
		</span>
	);
}

function updateStats(prev: StreamStats, event: NormalizedEvent): StreamStats {
	return {
		quotes: prev.quotes + (event.type === "quote" ? 1 : 0),
		trades: prev.trades + (event.type === "trade" ? 1 : 0),
		orders: prev.orders + (event.type === "order" || event.type === "fill" ? 1 : 0),
		total: prev.total + 1,
	};
}

function formatQuoteValue(value: number): string {
	return value.toFixed(2);
}

function formatVolume(value: number): string {
	return value > 1000 ? `${(value / 1000).toFixed(1)}K` : `${value}`;
}

function QuoteHeader({ symbol, latestQuote }: { symbol: string; latestQuote: QuoteState | null }) {
	return (
		<div className="px-4 py-3 border-b border-cream-200 dark:border-night-700 bg-cream-50 dark:bg-night-800">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<span className="text-lg font-semibold text-stone-900 dark:text-night-50">{symbol}</span>
					{latestQuote && (
						<span className="text-lg font-mono text-stone-900 dark:text-night-50">
							${latestQuote.last?.toFixed(2) || "--"}
						</span>
					)}
					{formatChangeLabel(latestQuote?.change)}
				</div>
				{latestQuote && (
					<div className="text-sm text-stone-500 dark:text-night-300">
						<span className="font-mono">
							${formatQuoteValue(latestQuote.bid)} × ${formatQuoteValue(latestQuote.ask)}
						</span>
						<span className="ml-2 text-stone-400 dark:text-night-400">
							Spread: ${formatQuoteValue(latestQuote.ask - latestQuote.bid)}
						</span>
					</div>
				)}
			</div>
		</div>
	);
}

function StreamHeader({ connected }: { connected: boolean }) {
	return (
		<div className="px-4 py-2 border-b border-cream-200 dark:border-night-700 flex items-center justify-between">
			<span className="text-sm font-medium text-stone-700 dark:text-night-100">Event Stream</span>
			<div className="flex items-center gap-1">
				<div
					className={`w-2 h-2 rounded-full ${connected ? "bg-green-500 animate-pulse" : "bg-red-500"}`}
				/>
				<span className="text-xs text-stone-500 dark:text-night-300">
					{connected ? "Live" : "Offline"}
				</span>
			</div>
		</div>
	);
}

function EventRow({ event }: { event: NormalizedEvent }) {
	const timeStr = event.timestamp.toLocaleTimeString("en-US", {
		hour12: false,
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});

	return (
		<div className="flex items-center gap-2 px-4 h-10 border-b border-cream-100 dark:border-night-700 hover:bg-cream-50 dark:hover:bg-night-600 transition-colors">
			<span className="text-xs font-mono text-stone-400 dark:text-night-400 w-16 flex-shrink-0">
				{timeStr}
			</span>
			<span className={`text-sm w-4 flex-shrink-0 ${EVENT_TYPE_COLORS[event.type]}`}>
				{event.icon}
			</span>
			<span
				className={`text-xs font-medium uppercase w-14 flex-shrink-0 ${EVENT_TYPE_COLORS[event.type]}`}
			>
				{event.type.replace("_", " ").slice(0, 7)}
			</span>
			<span className={`text-sm flex-1 truncate ${VALUE_COLORS[event.color]}`}>
				{event.details || event.title}
			</span>
		</div>
	);
}

function EventList({
	events,
	virtualizer,
	parentRef,
}: {
	events: NormalizedEvent[];
	virtualizer: StreamVirtualizer;
	parentRef: React.RefObject<HTMLDivElement | null>;
}) {
	if (events.length === 0) {
		return (
			<div className="flex items-center justify-center h-32 text-sm text-stone-400 dark:text-night-400">
				No events yet
			</div>
		);
	}

	return (
		<div ref={parentRef} className="flex-1 overflow-auto">
			<div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
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
							<EventRow event={event} />
						</div>
					);
				})}
			</div>
		</div>
	);
}

function StreamStatsFooter({
	stats,
	connected,
	symbol,
}: {
	stats: StreamStats;
	connected: boolean;
	symbol: string;
}) {
	if (!connected) {
		return (
			<div className="px-4 py-2 border-t border-cream-200 dark:border-night-700">Not connected</div>
		);
	}
	return (
		<div className="px-4 py-2 border-t border-cream-200 dark:border-night-700 bg-cream-50 dark:bg-night-800">
			<div className="flex items-center gap-4 text-xs text-stone-500 dark:text-night-300">
				<span>
					Trades: <strong className="text-stone-700 dark:text-night-100">{stats.trades}</strong>
				</span>
				<span>
					Quotes:{" "}
					<strong className="text-stone-700 dark:text-night-100">
						{formatVolume(stats.quotes)}
					</strong>
				</span>
				<span>
					Orders: <strong className="text-stone-700 dark:text-night-100">{stats.orders}</strong>
				</span>
				<span className="ml-auto text-stone-500">{symbol}</span>
			</div>
		</div>
	);
}

function StreamBody({
	events,
	stats,
	connected,
	symbol,
	showStatistics,
}: {
	events: NormalizedEvent[];
	stats: StreamStats;
	connected: boolean;
	symbol: string;
	showStatistics: boolean;
}) {
	const parentRef = useRef<HTMLDivElement>(null);
	const virtualizer: StreamVirtualizer = useVirtualizer({
		count: events.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => ROW_HEIGHT,
		overscan: 5,
	});

	return (
		<>
			<StreamHeader connected={connected} />
			<EventList events={events} virtualizer={virtualizer} parentRef={parentRef} />
			{showStatistics && <StreamStatsFooter stats={stats} connected={connected} symbol={symbol} />}
		</>
	);
}

function useSymbolStreamState({ symbol, maxEvents }: { symbol: string; maxEvents: number }) {
	const [events, setEvents] = useState<NormalizedEvent[]>([]);
	const [latestQuote, setLatestQuote] = useState<QuoteState | null>(null);
	const [stats, setStats] = useState<StreamStats>({ quotes: 0, trades: 0, orders: 0, total: 0 });
	const symbolRef = useRef(symbol);
	const maxEventsRef = useRef(maxEvents);

	useEffect(() => {
		symbolRef.current = symbol;
		maxEventsRef.current = maxEvents;

		setEvents([]);
		setLatestQuote(null);
		setStats({ quotes: 0, trades: 0, orders: 0, total: 0 });
	}, [maxEvents, symbol]);

	const handleMessage = useCallback((message: WebSocketMessage) => {
		const normalized = normalizeEvent(message);
		if (!normalized) {
			return;
		}

		const eventSymbol = normalized.symbol?.toUpperCase();
		const targetSymbol = symbolRef.current.toUpperCase();
		if (eventSymbol !== targetSymbol) {
			return;
		}

		if (normalized.type === "quote" && normalized.raw) {
			const raw = normalized.raw as { bid: number; ask: number; last?: number };
			setLatestQuote((prev) => calculateNextLatestQuote(prev, raw));
		}

		setEvents((prev) => {
			const limit = maxEventsRef.current;
			return [normalized, ...prev.slice(0, Math.max(0, limit - 1))];
		});
		setStats((prev) => updateStats(prev, normalized));
	}, []);

	return { events, latestQuote, stats, handleMessage };
}

export function SymbolStream({
	symbol,
	showQuoteHeader = true,
	showStatistics = true,
	maxEvents = DEFAULT_MAX_EVENTS,
	className = "",
}: SymbolStreamProps) {
	const { connected, lastMessage } = useWebSocket();
	const { events, latestQuote, stats, handleMessage } = useSymbolStreamState({
		symbol,
		maxEvents,
	});

	useEffect(() => {
		if (lastMessage) {
			handleMessage(lastMessage as WebSocketMessage);
		}
	}, [handleMessage, lastMessage]);

	return (
		<div className={`flex flex-col h-full bg-white dark:bg-night-800 ${className}`}>
			{showQuoteHeader && <QuoteHeader symbol={symbol} latestQuote={latestQuote} />}
			{showStatistics ? (
				<StreamBody
					events={events}
					stats={stats}
					connected={connected}
					symbol={symbol}
					showStatistics={showStatistics}
				/>
			) : (
				<div className="flex-1 p-2 text-sm text-stone-400 dark:text-night-400">
					{connected ? `Waiting for ${symbol} events...` : "Not connected"}
				</div>
			)}
		</div>
	);
}

export default SymbolStream;
