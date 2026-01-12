"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const MAX_EVENTS = 500;
const ROW_HEIGHT = 48;

/** Map feed event types to store event types for cross-component unread tracking */
const FEED_TO_STORE_TYPE: Partial<Record<EventType, StoreEventType>> = {
  trade: "trade_executed",
  order: "order_placed",
  fill: "order_filled",
  reject: "order_rejected",
  decision: "agent_decision",
  alert: "system_alert",
  agent: "agent_decision",
  cycle: "market_event",
  backtest: "market_event",
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
  "backtest",
  "system",
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
  backtest: "Backtest",
  system: "System",
};

export default function FeedPage() {
  const { connected, lastMessage, subscribe, unsubscribe, subscribeSymbols, unsubscribeSymbols } =
    useWebSocket();
  const { stats, recordEvent } = useFeedStats();
  const addEventToStore = useEventFeedStore((s) => s.addEvent);
  const resetNewEventCount = useEventFeedStore((s) => s.resetNewEventCount);
  const [events, setEvents] = useState<NormalizedEvent[]>([]);
  const [filters, setFilters] = useState<Record<EventType, boolean>>(() => {
    const initial: Record<EventType, boolean> = {} as Record<EventType, boolean>;
    for (const type of EVENT_TYPES) {
      // Default: show most events, hide system
      initial[type] = type !== "system";
    }
    return initial;
  });
  const [isPaused, setIsPaused] = useState(false);
  const [symbolFilter, setSymbolFilter] = useState("");
  const [subscribedSymbol, setSubscribedSymbol] = useState<string | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  // Subscribe to feed-relevant channels when page mounts
  const feedChannels = useMemo(
    () => ["cycles", "agents", "alerts", "orders", "trades", "backtests"],
    []
  );
  useEffect(() => {
    if (connected) {
      subscribe(feedChannels);
    }
    return () => {
      if (connected) {
        unsubscribe(feedChannels);
      }
    };
  }, [connected, subscribe, unsubscribe, feedChannels]);

  // Subscribe to symbol for real-time quotes/trades when filter is a valid symbol
  useEffect(() => {
    const trimmed = symbolFilter.trim().toUpperCase();
    // Only subscribe if it looks like a valid ticker (1-5 uppercase letters)
    const isValidTicker = /^[A-Z]{1,5}$/.test(trimmed);

    if (connected && isValidTicker && trimmed !== subscribedSymbol) {
      // Unsubscribe from previous symbol
      if (subscribedSymbol) {
        unsubscribeSymbols([subscribedSymbol]);
      }
      // Subscribe to new symbol
      subscribeSymbols([trimmed]);
      setSubscribedSymbol(trimmed);
    } else if (!isValidTicker && subscribedSymbol) {
      // Unsubscribe when filter is cleared or invalid
      unsubscribeSymbols([subscribedSymbol]);
      setSubscribedSymbol(null);
    }
  }, [connected, symbolFilter, subscribedSymbol, subscribeSymbols, unsubscribeSymbols]);

  // Cleanup symbol subscription on unmount
  useEffect(() => {
    return () => {
      if (subscribedSymbol) {
        unsubscribeSymbols([subscribedSymbol]);
      }
    };
  }, [subscribedSymbol, unsubscribeSymbols]);

  // Reset unread count when viewing feed page
  useEffect(() => {
    resetNewEventCount();
  }, [resetNewEventCount]);

  useEffect(() => {
    if (lastMessage && !isPaused) {
      const normalized = normalizeEvent(lastMessage as WebSocketMessage);
      if (normalized) {
        recordEvent(normalized.type);
        setEvents((prev) => [normalized, ...prev.slice(0, MAX_EVENTS - 1)]);

        // Also add to global store for unread badge (only for significant events)
        const storeType = FEED_TO_STORE_TYPE[normalized.type];
        if (storeType) {
          addEventToStore({
            type: storeType,
            severity: "info",
            title: normalized.title,
            message: normalized.details,
            symbol: normalized.symbol,
          });
        }
      }
    }
  }, [lastMessage, isPaused, recordEvent, addEventToStore]);

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (!filters[e.type]) {
        return false;
      }
      if (
        symbolFilter &&
        e.symbol &&
        !e.symbol.toLowerCase().includes(symbolFilter.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [events, filters, symbolFilter]);

  const virtualizer = useVirtualizer({
    count: filteredEvents.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  const toggleFilter = useCallback((type: EventType) => {
    setFilters((prev) => ({ ...prev, [type]: !prev[type] }));
  }, []);

  const clearEvents = useCallback(() => setEvents([]), []);

  const toggleAllFilters = useCallback((enabled: boolean) => {
    setFilters((prev) => {
      const next = { ...prev };
      for (const type of EVENT_TYPES) {
        next[type] = enabled;
      }
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold text-stone-900 dark:text-night-50">Real-Time Feed</h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <div
              className={`w-2 h-2 rounded-full ${
                connected ? "bg-green-500 animate-pulse" : "bg-red-500"
              }`}
            />
            <span className="text-sm text-stone-500 dark:text-night-300">
              {connected ? "Live" : "Disconnected"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsPaused(!isPaused)}
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

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-1 mr-2">
          <button
            type="button"
            onClick={() => toggleAllFilters(true)}
            className="text-xs text-stone-500 hover:text-stone-700 dark:text-night-300 dark:hover:text-night-100"
          >
            All
          </button>
          <span className="text-stone-400 dark:text-night-500">|</span>
          <button
            type="button"
            onClick={() => toggleAllFilters(false)}
            className="text-xs text-stone-500 hover:text-stone-700 dark:text-night-300 dark:hover:text-night-100"
          >
            None
          </button>
        </div>
        {EVENT_TYPES.map((type) => (
          <FilterChip
            key={type}
            label={EVENT_TYPE_LABELS[type]}
            active={filters[type]}
            onClick={() => toggleFilter(type)}
          />
        ))}
        <div className="flex-1" />
        <input
          type="text"
          placeholder="Filter by symbol..."
          value={symbolFilter}
          onChange={(e) => setSymbolFilter(e.target.value)}
          className="px-3 py-1 text-sm rounded-md border border-cream-200 dark:border-night-600 bg-white dark:bg-night-800 text-stone-900 dark:text-night-100 placeholder-stone-400 dark:placeholder-night-400 w-40"
        />
      </div>

      <div className="flex-1 bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-cream-200 dark:border-night-700 flex items-center justify-between flex-shrink-0">
          <h2 className="text-lg font-medium text-stone-900 dark:text-night-50">
            Event Stream
            {filteredEvents.length > 0 && (
              <span className="ml-2 text-sm font-normal text-stone-500 dark:text-night-300">
                ({filteredEvents.length} events)
              </span>
            )}
          </h2>
          <button
            type="button"
            onClick={clearEvents}
            className="text-sm text-stone-500 hover:text-stone-700 dark:text-night-300 dark:hover:text-night-100"
          >
            Clear
          </button>
        </div>

        <div ref={parentRef} className="flex-1 overflow-auto">
          {filteredEvents.length > 0 ? (
            <div
              style={{
                height: virtualizer.getTotalSize(),
                width: "100%",
                position: "relative",
              }}
            >
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
          ) : (
            <div className="flex items-center justify-center h-full text-stone-400 dark:text-night-400">
              {connected ? "Waiting for events..." : "Connect to receive events"}
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t border-cream-200 dark:border-night-700 bg-cream-50 dark:bg-night-800 flex-shrink-0">
          <div className="flex items-center gap-6 text-xs text-stone-500 dark:text-night-300">
            <span>
              <strong className="text-stone-700 dark:text-night-100">{stats.quotesPerMin}</strong>{" "}
              quotes/min
            </span>
            <span>
              <strong className="text-stone-700 dark:text-night-100">{stats.tradesPerMin}</strong>{" "}
              trades/min
            </span>
            <span>
              <strong className="text-stone-700 dark:text-night-100">{stats.optionsPerMin}</strong>{" "}
              options/min
            </span>
            <span>
              <strong className="text-stone-700 dark:text-night-100">{stats.totalPerMin}</strong>{" "}
              total/min
            </span>
          </div>
        </div>
      </div>
    </div>
  );
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
    <div className="flex items-center gap-3 px-4 h-12 border-b border-cream-100 dark:border-night-700 hover:bg-cream-50 dark:hover:bg-night-750 transition-colors">
      {/* Timestamp */}
      <span className="text-xs font-mono text-stone-400 dark:text-night-400 w-20 flex-shrink-0">
        {timeStr}
      </span>

      {/* Icon & Type */}
      <span className={`text-sm w-4 flex-shrink-0 ${EVENT_TYPE_COLORS[event.type]}`}>
        {event.icon}
      </span>
      <span
        className={`text-xs font-medium uppercase w-16 flex-shrink-0 ${EVENT_TYPE_COLORS[event.type]}`}
      >
        {event.type.replace("_", " ").slice(0, 8)}
      </span>

      {/* Symbol */}
      {event.symbol && (
        <span className="text-sm font-mono font-medium text-stone-900 dark:text-night-100 w-14 flex-shrink-0 truncate">
          {event.symbol}
        </span>
      )}

      {/* Title */}
      <span className={`text-sm flex-shrink-0 max-w-48 truncate ${VALUE_COLORS[event.color]}`}>
        {event.title}
      </span>

      {/* Details */}
      <span className="text-sm text-stone-500 dark:text-night-300 flex-1 truncate">
        {event.details}
      </span>
    </div>
  );
}
