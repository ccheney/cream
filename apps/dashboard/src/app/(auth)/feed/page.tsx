"use client";

/**
 * Feed Page - Real-time event stream
 */

import { useEffect, useRef, useState } from "react";
import { useWebSocketContext as useWebSocket } from "@/providers/WebSocketProvider";

type EventType = "quote" | "order" | "decision" | "agent" | "alert" | "system";

interface FeedEvent {
  id: string;
  type: EventType;
  time: string;
  message: string;
  symbol?: string;
  value?: string;
  data?: Record<string, unknown>;
}

export default function FeedPage() {
  const { isConnected, lastMessage } = useWebSocket();
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [filters, setFilters] = useState<Record<EventType, boolean>>({
    quote: true,
    order: true,
    decision: true,
    agent: true,
    alert: true,
    system: false,
  });
  const [isPaused, setIsPaused] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  // Process incoming WebSocket messages
  useEffect(() => {
    if (lastMessage && !isPaused) {
      const msgData = lastMessage.data as Record<string, unknown> | undefined;
      const event: FeedEvent = {
        id: crypto.randomUUID(),
        type: (lastMessage.type as EventType) || "system",
        time: new Date().toLocaleTimeString(),
        message: JSON.stringify(lastMessage.data),
        symbol: msgData?.symbol as string | undefined,
        value: msgData?.value as string | undefined,
        data: msgData,
      };
      setEvents((prev) => [event, ...prev.slice(0, 499)]);
    }
  }, [lastMessage, isPaused]);

  // Auto-scroll to top when new events arrive
  useEffect(() => {
    if (feedRef.current && !isPaused) {
      feedRef.current.scrollTop = 0;
    }
  }, [isPaused]);

  const filteredEvents = events.filter((e) => filters[e.type]);

  const toggleFilter = (type: EventType) => {
    setFilters((prev) => ({ ...prev, [type]: !prev[type] }));
  };

  const clearEvents = () => setEvents([]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-cream-900 dark:text-cream-100">
          Real-Time Feed
        </h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <div
              className={`w-2 h-2 rounded-full ${
                isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"
              }`}
            />
            <span className="text-sm text-cream-500 dark:text-cream-400">
              {isConnected ? "Live" : "Disconnected"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsPaused(!isPaused)}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              isPaused
                ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                : "bg-cream-100 text-cream-700 dark:bg-night-700 dark:text-cream-300"
            }`}
          >
            {isPaused ? "Resume" : "Pause"}
          </button>
        </div>
      </div>

      {/* Filter Controls */}
      <div className="flex items-center gap-2">
        {(Object.keys(filters) as EventType[]).map((type) => (
          <FilterChip
            key={type}
            label={type.charAt(0).toUpperCase() + type.slice(1)}
            active={filters[type]}
            onClick={() => toggleFilter(type)}
          />
        ))}
      </div>

      {/* Event Stream */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
        <div className="p-4 border-b border-cream-200 dark:border-night-700 flex items-center justify-between">
          <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100">
            Event Stream
            {filteredEvents.length > 0 && (
              <span className="ml-2 text-sm font-normal text-cream-500 dark:text-cream-400">
                ({filteredEvents.length} events)
              </span>
            )}
          </h2>
          <button
            type="button"
            onClick={clearEvents}
            className="text-sm text-cream-500 hover:text-cream-700 dark:text-cream-400 dark:hover:text-cream-200"
          >
            Clear
          </button>
        </div>
        <div ref={feedRef} className="h-[600px] overflow-auto">
          <div className="p-4 space-y-1">
            {filteredEvents.length > 0 ? (
              filteredEvents.map((event) => <FeedEventRow key={event.id} event={event} />)
            ) : (
              <div className="text-center py-8 text-cream-400">
                {isConnected ? "Waiting for events..." : "Connect to receive events"}
              </div>
            )}
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
      className={`px-3 py-1 rounded-full text-sm transition-colors ${
        active
          ? "bg-cream-900 dark:bg-cream-100 text-cream-100 dark:text-cream-900"
          : "bg-cream-100 dark:bg-night-700 text-cream-600 dark:text-cream-400 hover:bg-cream-200 dark:hover:bg-night-600"
      }`}
    >
      {label}
    </button>
  );
}

function FeedEventRow({ event }: { event: FeedEvent }) {
  const typeColors: Record<EventType, string> = {
    quote: "text-blue-500",
    order: "text-purple-500",
    decision: "text-green-500",
    agent: "text-amber-500",
    alert: "text-red-500",
    system: "text-gray-500",
  };

  return (
    <div className="flex items-start gap-3 py-2 border-b border-cream-100 dark:border-night-700 last:border-0 hover:bg-cream-50 dark:hover:bg-night-750 transition-colors">
      <span className="text-xs font-mono text-cream-400 w-20 flex-shrink-0">{event.time}</span>
      <span
        className={`text-xs font-medium uppercase w-16 flex-shrink-0 ${typeColors[event.type]}`}
      >
        {event.type}
      </span>
      {event.symbol && (
        <span className="text-sm font-mono font-medium text-cream-900 dark:text-cream-100 w-16 flex-shrink-0">
          {event.symbol}
        </span>
      )}
      <span className="text-sm text-cream-600 dark:text-cream-400 flex-1 truncate">
        {event.message}
      </span>
      {event.value && (
        <span className="text-sm font-mono text-cream-900 dark:text-cream-100">{event.value}</span>
      )}
    </div>
  );
}
