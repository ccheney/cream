"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFeedStats } from "@/hooks/useFeedStats";
import {
	EVENT_TYPE_COLORS,
	type EventType,
	type NormalizedEvent,
	normalizeEvent,
	VALUE_COLORS,
	type WebSocketMessage,
} from "@/lib/feed/event-normalizer";
import { useWebSocketContext as useWebSocket } from "@/providers/WebSocketProvider";
import { type EventType as StoreEventType, useEventFeedStore } from "@/stores/event-feed-store";
import {
	type FeedEventType,
	selectFeedEnabledEventTypes,
	selectFeedSymbolFilter,
	usePreferencesStore,
} from "@/stores/preferences-store";

const MAX_EVENTS = 500;
const ROW_HEIGHT = 48;

const FEED_TO_STORE_TYPE: Partial<Record<EventType, StoreEventType>> = {
	trade: "trade_executed",
	order: "order_placed",
	fill: "order_filled",
	reject: "order_rejected",
	decision: "agent_decision",
	alert: "system_alert",
	agent: "agent_decision",
	cycle: "market_event",
	system: "market_event",
};

const EVENT_TYPES: EventType[] = [
	"quote",
	"trade",
	"options_quote",
	"options_trade",
	"decision",
	"order",
	"fill",
	"reject",
	"alert",
	"agent",
	"cycle",
	"system",
];

const FILTER_GROUPS: EventType[][] = [
	["quote", "trade"],
	["options_quote", "options_trade"],
	["order", "fill", "reject"],
	["decision", "agent", "cycle"],
	["alert", "system"],
];

const EVENT_TYPE_LABELS: Record<EventType, string> = {
	quote: "Quotes",
	trade: "Trades",
	options_quote: "Opt Quote",
	options_trade: "Opt Trade",
	decision: "Decisions",
	order: "Orders",
	fill: "Fills",
	reject: "Rejects",
	alert: "Alerts",
	agent: "Agents",
	cycle: "Cycles",
	system: "System",
};

export default function FeedPage() {
	const {
		clearEvents,
		connected,
		filteredEvents,
		filters,
		isPaused,
		parentRef,
		setSymbolFilter,
		sstats,
		symbolFilter,
		toggleAllFilters,
		toggleFilter,
		virtualizer,
		togglePause,
	} = useFeedPageModel();

	return (
		<div className="flex flex-col h-full">
			<FeedHeader connected={connected} isPaused={isPaused} onTogglePause={togglePause} />
			<FeedFiltersBar
				filters={filters}
				symbolFilter={symbolFilter}
				onSetSymbolFilter={setSymbolFilter}
				onToggleAll={toggleAllFilters}
				onToggleFilter={toggleFilter}
			/>
			<FeedEventStream
				clearEvents={clearEvents}
				connected={connected}
				filteredEvents={filteredEvents}
				parentRef={parentRef}
				stats={sstats}
				virtualizer={virtualizer}
			/>
		</div>
	);
}

function useFeedPageModel() {
	const { connected, lastMessage, subscribe, unsubscribe, subscribeSymbols, unsubscribeSymbols } =
		useWebSocket();
	const { stats: sstats, recordEvent } = useFeedStats();
	const addEventToStore = useEventFeedStore((s) => s.addEvent);
	const resetNewEventCount = useEventFeedStore((s) => s.resetNewEventCount);
	const filters = usePreferencesStore(selectFeedEnabledEventTypes);
	const symbolFilter = usePreferencesStore(selectFeedSymbolFilter);
	const updateFeed = usePreferencesStore((s) => s.updateFeed);
	const [events, setEvents] = useState<NormalizedEvent[]>([]);
	const [isPaused, setIsPaused] = useState(false);
	const parentRef = useRef<HTMLDivElement>(null);

	useFeedChannelSubscription(connected, subscribe, unsubscribe);
	useSymbolFilterSubscription(connected, symbolFilter, subscribeSymbols, unsubscribeSymbols);
	useEventIngestion(lastMessage, isPaused, recordEvent, addEventToStore, setEvents);
	useEffect(() => resetNewEventCount(), [resetNewEventCount]);

	const filteredEvents = useFilteredEvents(events, filters, symbolFilter);
	const virtualizer = useVirtualizer({
		count: filteredEvents.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => ROW_HEIGHT,
		overscan: 10,
	});

	return {
		clearEvents: () => setEvents([]),
		connected,
		filteredEvents,
		filters,
		isPaused,
		parentRef,
		setSymbolFilter: (value: string) => updateFeed({ symbolFilter: value }),
		sstats,
		symbolFilter,
		toggleAllFilters: (enabled: boolean) =>
			updateFeed({ enabledEventTypes: buildAllFilters(filters, enabled) }),
		toggleFilter: (type: FeedEventType) =>
			updateFeed({ enabledEventTypes: { ...filters, [type]: !filters[type] } }),
		virtualizer,
		togglePause: () => setIsPaused((prev) => !prev),
	};
}

function useFeedChannelSubscription(
	connected: boolean,
	subscribe: (channels: string[]) => void,
	unsubscribe: (channels: string[]) => void,
) {
	const channels = useMemo(() => ["cycles", "agents", "alerts", "orders", "trades"], []);

	useEffect(() => {
		if (!connected) {
			return;
		}
		subscribe(channels);
		return () => unsubscribe(channels);
	}, [channels, connected, subscribe, unsubscribe]);
}

function useSymbolFilterSubscription(
	connected: boolean,
	symbolFilter: string,
	subscribeSymbols: (symbols: string[]) => void,
	unsubscribeSymbols: (symbols: string[]) => void,
) {
	const [subscribedSymbol, setSubscribedSymbol] = useState<string | null>(null);

	useEffect(() => {
		const ticker = getValidTicker(symbolFilter);
		if (!connected || !ticker) {
			if (subscribedSymbol) {
				unsubscribeSymbols([subscribedSymbol]);
				setSubscribedSymbol(null);
			}
			return;
		}
		if (ticker === subscribedSymbol) {
			return;
		}
		if (subscribedSymbol) {
			unsubscribeSymbols([subscribedSymbol]);
		}
		subscribeSymbols([ticker]);
		setSubscribedSymbol(ticker);
	}, [connected, subscribedSymbol, subscribeSymbols, symbolFilter, unsubscribeSymbols]);

	useEffect(() => {
		return () => {
			if (subscribedSymbol) {
				unsubscribeSymbols([subscribedSymbol]);
			}
		};
	}, [subscribedSymbol, unsubscribeSymbols]);
}

function useEventIngestion(
	lastMessage: unknown,
	isPaused: boolean,
	recordEvent: (type: EventType) => void,
	addEventToStore: (event: {
		type: StoreEventType;
		severity: "info";
		title: string;
		message: string;
		symbol?: string;
	}) => void,
	setEvents: React.Dispatch<React.SetStateAction<NormalizedEvent[]>>,
) {
	useEffect(() => {
		if (!lastMessage || isPaused) {
			return;
		}
		const normalized = normalizeEvent(lastMessage as WebSocketMessage);
		if (!normalized) {
			return;
		}
		recordEvent(normalized.type);
		setEvents((prev) => [normalized, ...prev.slice(0, MAX_EVENTS - 1)]);
		const storeType = FEED_TO_STORE_TYPE[normalized.type];
		if (!storeType) {
			return;
		}
		addEventToStore({
			type: storeType,
			severity: "info",
			title: normalized.title,
			message: normalized.details,
			symbol: normalized.symbol,
		});
	}, [addEventToStore, isPaused, lastMessage, recordEvent, setEvents]);
}

function useFilteredEvents(
	events: NormalizedEvent[],
	filters: Record<EventType, boolean>,
	symbolFilter: string,
): NormalizedEvent[] {
	return useMemo(
		() =>
			events.filter((event) => {
				if (!filters[event.type]) {
					return false;
				}
				if (!symbolFilter || !event.symbol) {
					return true;
				}
				return event.symbol.toLowerCase().includes(symbolFilter.toLowerCase());
			}),
		[events, filters, symbolFilter],
	);
}

function buildAllFilters(
	filters: Record<EventType, boolean>,
	enabled: boolean,
): Record<EventType, boolean> {
	const next = { ...filters };
	for (const type of EVENT_TYPES) {
		next[type] = enabled;
	}
	return next;
}

function getValidTicker(value: string): string | null {
	const ticker = value.trim().toUpperCase();
	return /^[A-Z]{1,5}$/.test(ticker) ? ticker : null;
}

function FeedHeader({
	connected,
	isPaused,
	onTogglePause,
}: {
	connected: boolean;
	isPaused: boolean;
	onTogglePause: () => void;
}) {
	return (
		<div className="shrink-0 flex items-center justify-between mb-4">
			<h1 className="text-2xl font-semibold text-stone-900 dark:text-night-50">Real-Time Feed</h1>
			<div className="flex items-center gap-4">
				<div className="flex items-center gap-1">
					<div
						className={`w-2 h-2 rounded-full ${connected ? "bg-green-500 animate-pulse" : "bg-red-500"}`}
					/>
					<span className="text-sm text-stone-500 dark:text-night-300">
						{connected ? "Live" : "Disconnected"}
					</span>
				</div>
				<button
					type="button"
					onClick={onTogglePause}
					className={`px-3 py-1 text-sm rounded-md transition-colors ${
						isPaused
							? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
							: "bg-cream-100 text-stone-700 dark:bg-night-700 dark:text-night-200"
					}`}
				>
					{isPaused ? "Resume" : "Pause"}
				</button>
			</div>
		</div>
	);
}

function FeedFiltersBar({
	filters,
	symbolFilter,
	onSetSymbolFilter,
	onToggleAll,
	onToggleFilter,
}: {
	filters: Record<EventType, boolean>;
	symbolFilter: string;
	onSetSymbolFilter: (value: string) => void;
	onToggleAll: (enabled: boolean) => void;
	onToggleFilter: (type: FeedEventType) => void;
}) {
	return (
		<div className="shrink-0 flex flex-wrap items-center gap-2 mb-4">
			<div className="flex items-center gap-1 mr-1">
				<button
					type="button"
					onClick={() => onToggleAll(true)}
					className="text-xs text-stone-500 hover:text-stone-700 dark:text-night-300 dark:hover:text-night-100"
				>
					All
				</button>
				<span className="text-stone-400 dark:text-night-500">|</span>
				<button
					type="button"
					onClick={() => onToggleAll(false)}
					className="text-xs text-stone-500 hover:text-stone-700 dark:text-night-300 dark:hover:text-night-100"
				>
					None
				</button>
			</div>
			<FilterGroupChips filters={filters} onToggleFilter={onToggleFilter} />
			<div className="flex-1" />
			<input
				type="text"
				placeholder="Filter by symbol..."
				value={symbolFilter}
				onChange={(event) => onSetSymbolFilter(event.target.value)}
				className="px-3 py-1 text-sm rounded-md border border-cream-200 dark:border-night-600 bg-white dark:bg-night-800 text-stone-900 dark:text-night-100 placeholder-stone-400 dark:placeholder-night-400 w-40"
			/>
		</div>
	);
}

function FilterGroupChips({
	filters,
	onToggleFilter,
}: {
	filters: Record<EventType, boolean>;
	onToggleFilter: (type: FeedEventType) => void;
}) {
	return (
		<>
			{FILTER_GROUPS.map((group, index) => (
				<div key={group.join("-")} className="contents">
					{index > 0 && <FilterSeparator />}
					{group.map((type) => (
						<FilterChip
							key={type}
							label={EVENT_TYPE_LABELS[type]}
							active={filters[type]}
							onClick={() => onToggleFilter(type)}
						/>
					))}
				</div>
			))}
		</>
	);
}

function FeedEventStream({
	clearEvents,
	connected,
	filteredEvents,
	parentRef,
	stats,
	virtualizer,
}: {
	clearEvents: () => void;
	connected: boolean;
	filteredEvents: NormalizedEvent[];
	parentRef: React.RefObject<HTMLDivElement | null>;
	stats: { quotesPerMin: number; tradesPerMin: number; optionsPerMin: number; totalPerMin: number };
	virtualizer: ReturnType<typeof useVirtualizer<HTMLDivElement, Element>>;
}) {
	return (
		<div className="flex-1 min-h-0 bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 flex flex-col overflow-hidden">
			<FeedStreamHeader count={filteredEvents.length} onClear={clearEvents} />
			<VirtualizedEventList
				connected={connected}
				filteredEvents={filteredEvents}
				parentRef={parentRef}
				virtualizer={virtualizer}
			/>
			<FeedStatsBar stats={stats} />
		</div>
	);
}

function FeedStreamHeader({ count, onClear }: { count: number; onClear: () => void }) {
	return (
		<div className="px-4 py-3 border-b border-cream-200 dark:border-night-700 flex items-center justify-between flex-shrink-0">
			<h2 className="text-lg font-medium text-stone-900 dark:text-night-50">
				Event Stream
				{count > 0 && (
					<span className="ml-2 text-sm font-normal text-stone-500 dark:text-night-300">
						({count} events)
					</span>
				)}
			</h2>
			<button
				type="button"
				onClick={onClear}
				className="text-sm text-stone-500 hover:text-stone-700 dark:text-night-300 dark:hover:text-night-100"
			>
				Clear
			</button>
		</div>
	);
}

function VirtualizedEventList({
	connected,
	filteredEvents,
	parentRef,
	virtualizer,
}: {
	connected: boolean;
	filteredEvents: NormalizedEvent[];
	parentRef: React.RefObject<HTMLDivElement | null>;
	virtualizer: ReturnType<typeof useVirtualizer<HTMLDivElement, Element>>;
}) {
	return (
		<div ref={parentRef} className="flex-1 min-h-0 overflow-auto">
			{filteredEvents.length === 0 ? (
				<EmptyFeedState connected={connected} />
			) : (
				<div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
					{virtualizer.getVirtualItems().map((virtualRow) => {
						const event = filteredEvents[virtualRow.index];
						if (!event) {
							return null;
						}
						return (
							<div
								key={virtualRow.key}
								data-index={virtualRow.index}
								style={{
									position: "absolute",
									top: 0,
									left: 0,
									width: "100%",
									height: `${virtualRow.size}px`,
									transform: `translateY(${virtualRow.start}px)`,
								}}
							>
								<FeedEventRow event={event} />
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}

function EmptyFeedState({ connected }: { connected: boolean }) {
	return (
		<div className="flex items-center justify-center h-full text-stone-400 dark:text-night-400">
			{connected ? "Waiting for events..." : "Connect to receive events"}
		</div>
	);
}

function FeedStatsBar({
	stats,
}: {
	stats: { quotesPerMin: number; tradesPerMin: number; optionsPerMin: number; totalPerMin: number };
}) {
	return (
		<div className="px-4 py-2 border-t border-cream-200 dark:border-night-700 bg-cream-50 dark:bg-night-800 flex-shrink-0">
			<div className="flex items-center gap-6 text-xs text-stone-500 dark:text-night-300">
				<StatItem value={stats.quotesPerMin} label="quotes/min" />
				<StatItem value={stats.tradesPerMin} label="trades/min" />
				<StatItem value={stats.optionsPerMin} label="options/min" />
				<StatItem value={stats.totalPerMin} label="total/min" />
			</div>
		</div>
	);
}

function StatItem({ value, label }: { value: number; label: string }) {
	return (
		<span>
			<strong className="text-stone-700 dark:text-night-100">{value}</strong> {label}
		</span>
	);
}

function FilterSeparator() {
	return <div className="w-px h-4 bg-cream-300 dark:bg-night-600 mx-1" />;
}

function FilterChip({
	label,
	active,
	onClick,
}: {
	label: string;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`px-2 py-0.5 rounded-full text-xs transition-colors ${
				active
					? "bg-stone-700 dark:bg-night-200 text-cream-50 dark:text-night-900"
					: "bg-cream-300 dark:bg-night-700 text-stone-600 dark:text-night-300 hover:bg-cream-200 dark:hover:bg-night-800"
			}`}
		>
			{label}
		</button>
	);
}

function FeedEventRow({ event }: { event: NormalizedEvent }) {
	const timeStr = event.timestamp.toLocaleTimeString("en-US", {
		hour12: false,
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});

	return (
		<div className="flex items-center gap-3 px-4 h-12 border-b border-cream-100 dark:border-night-700 hover:bg-cream-50 dark:hover:bg-night-600 transition-colors">
			<span className="text-xs font-mono text-stone-400 dark:text-night-400 w-20 flex-shrink-0">
				{timeStr}
			</span>
			<span className={`text-sm w-4 flex-shrink-0 ${EVENT_TYPE_COLORS[event.type]}`}>
				{event.icon}
			</span>
			<span
				className={`text-xs font-medium uppercase w-16 flex-shrink-0 ${EVENT_TYPE_COLORS[event.type]}`}
			>
				{event.type.replace("_", " ").slice(0, 8)}
			</span>
			{event.symbol && (
				<span className="text-sm font-mono font-medium text-stone-900 dark:text-night-100 w-14 flex-shrink-0 truncate">
					{event.symbol}
				</span>
			)}
			<span className={`text-sm flex-shrink-0 max-w-48 truncate ${VALUE_COLORS[event.color]}`}>
				{event.title}
			</span>
			<span className="text-sm text-stone-500 dark:text-night-300 flex-1 truncate">
				{event.details}
			</span>
		</div>
	);
}
