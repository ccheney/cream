/**
 * EventFeed Component
 *
 * Real-time event feed with virtualized scrolling, auto-scroll behavior,
 * color-coded borders, and relative timestamps.
 *
 * Design: Implements "Precision Warmth" aesthetic with The Cream Glow,
 * layered surfaces, and living indicators.
 *
 * @see docs/plans/ui/31-realtime-patterns.md lines 46-67
 * @see docs/plans/ui/20-design-philosophy.md
 */

"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useCallback, useEffect, useRef } from "react";
import { useAutoScroll } from "./use-auto-scroll";
import { useRelativeTime } from "./use-relative-time";

// ============================================
// Types
// ============================================

export type EventType = "QUOTE" | "FILL" | "ORDER" | "DECISION";

export interface FeedEvent {
	/** Unique event identifier */
	id: string;
	/** Event type */
	type: EventType;
	/** Event timestamp */
	timestamp: Date;
	/** Related trading symbol */
	symbol?: string;
	/** Event message/description */
	message: string;
	/** Additional metadata */
	metadata?: Record<string, unknown>;
}

export interface EventFeedProps {
	/** Array of events to display */
	events: FeedEvent[];
	/** Callback when an event is clicked */
	onEventClick?: (event: FeedEvent) => void;
	/** Height of the feed container */
	height?: number | string;
	/** Maximum number of events to keep (for memory management) */
	maxEvents?: number;
	/** Custom CSS class */
	className?: string;
	/** Test ID for testing */
	"data-testid"?: string;
}

// ============================================
// Constants
// ============================================

const EVENT_ITEM_HEIGHT = 52; // Slightly more generous for visual breathing room

const EVENT_TYPE_CONFIG: Record<
	EventType,
	{ color: string; bgAlpha: string; icon: string; label: string }
> = {
	QUOTE: {
		color: "var(--color-info, #6366f1)",
		bgAlpha: "rgba(99, 102, 241, 0.12)",
		icon: "◉",
		label: "QUOTE",
	},
	FILL: {
		color: "var(--color-profit, #22c55e)",
		bgAlpha: "rgba(34, 197, 94, 0.12)",
		icon: "✓",
		label: "FILL",
	},
	ORDER: {
		color: "var(--color-active, #f5a623)",
		bgAlpha: "rgba(245, 166, 35, 0.12)",
		icon: "▸",
		label: "ORDER",
	},
	DECISION: {
		color: "var(--color-agent-technical, #8b5cf6)",
		bgAlpha: "rgba(139, 92, 246, 0.12)",
		icon: "◆",
		label: "DECISION",
	},
};

// ============================================
// Event Item Component
// ============================================

interface EventItemProps {
	event: FeedEvent;
	onClick?: (event: FeedEvent) => void;
}

const EventItem = memo(function EventItem({ event, onClick }: EventItemProps) {
	const { formatted } = useRelativeTime(event.timestamp);
	const config = EVENT_TYPE_CONFIG[event.type];

	const handleClick = useCallback(() => {
		onClick?.(event);
	}, [event, onClick]);

	return (
		<button
			type="button"
			className="group w-full flex items-center gap-3 px-4 py-2.5 border-l-[3px] transition-all duration-150 ease-out cursor-pointer hover:bg-cream-100 dark:hover:bg-night-800/60 text-left"
			style={{
				borderLeftColor: config.color,
				boxShadow: "inset 0 -1px 0 var(--border-subtle, rgba(0,0,0,0.06))",
			}}
			onClick={handleClick}
			aria-label={`${event.type} event: ${event.message}`}
			data-event-id={event.id}
		>
			{/* Icon with subtle glow on hover */}
			<span
				className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full text-sm transition-shadow duration-150"
				style={{
					color: config.color,
					backgroundColor: config.bgAlpha,
				}}
				aria-hidden="true"
			>
				{config.icon}
			</span>

			{/* Timestamp - monospace for data */}
			<span className="flex-shrink-0 w-14 text-xs font-mono text-stone-500 dark:text-night-400 tabular-nums tracking-tight">
				{formatted}
			</span>

			{/* Type Badge - refined pill shape */}
			<span
				className="flex-shrink-0 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full"
				style={{
					backgroundColor: config.bgAlpha,
					color: config.color,
				}}
			>
				{config.label}
			</span>

			{/* Symbol (if present) - emphasized */}
			{event.symbol && (
				<span className="flex-shrink-0 font-mono font-semibold text-sm text-stone-800 dark:text-night-100">
					{event.symbol}
				</span>
			)}

			{/* Message - truncated with fade */}
			<span className="flex-1 text-sm text-stone-600 dark:text-night-300 truncate group-hover:text-stone-800 dark:group-hover:text-night-100 transition-colors">
				{event.message}
			</span>
		</button>
	);
});

// ============================================
// New Events Button Component
// ============================================

interface NewEventsButtonProps {
	count: number;
	onClick: () => void;
}

const NewEventsButton = memo(function NewEventsButton({ count, onClick }: NewEventsButtonProps) {
	if (count === 0) {
		return null;
	}

	return (
		<button
			type="button"
			className="absolute top-0 left-0 right-0 z-10 flex items-center justify-center gap-1.5 py-2 text-sm font-medium text-stone-600 dark:text-night-200 bg-cream-100/95 dark:bg-night-800/95 backdrop-blur-sm border-b border-stone-200/60 dark:border-night-700/60 hover:bg-cream-200/95 dark:hover:bg-night-700/95 transition-colors cursor-pointer"
			onClick={onClick}
			aria-label={`Show ${count} new ${count === 1 ? "event" : "events"}`}
		>
			<span className="text-stone-500 dark:text-night-400" aria-hidden="true">
				↓
			</span>
			<span>
				{count} new {count === 1 ? "event" : "events"}
			</span>
		</button>
	);
});

// ============================================
// Empty State Component
// ============================================

const EmptyState = memo(function EmptyState() {
	return (
		<div className="flex flex-col items-center justify-center h-full text-stone-500 dark:text-night-400">
			{/* Minimal activity indicator */}
			<div className="relative mb-4">
				<div className="w-12 h-12 rounded-full border-2 border-dashed border-stone-300 dark:border-night-600 flex items-center justify-center">
					<div className="w-2 h-2 rounded-full bg-stone-300 dark:bg-night-600" />
				</div>
				{/* Subtle pulse ring */}
				<div className="absolute inset-0 rounded-full border-2 border-stone-200 dark:border-night-700 animate-ping opacity-20" />
			</div>
			<span className="text-sm font-medium text-stone-500 dark:text-night-400">
				Awaiting events
			</span>
			<span className="text-xs text-stone-400 dark:text-night-500 mt-1">
				Activity will appear here
			</span>
		</div>
	);
});

// ============================================
// Main Component
// ============================================

/**
 * EventFeed displays a virtualized, real-time event feed.
 *
 * Features:
 * - Virtualized scrolling for performance with 1000+ events
 * - Auto-scroll when at bottom, pause when user scrolls up
 * - "New events" button when paused
 * - Color-coded left borders by event type
 * - Live-updating relative timestamps
 * - Keyboard accessible
 *
 * @example
 * ```tsx
 * <EventFeed
 *   events={events}
 *   onEventClick={(event) => console.log('Clicked:', event)}
 *   height={400}
 * />
 * ```
 */
export const EventFeed = memo(function EventFeed({
	events,
	onEventClick,
	height = 400,
	maxEvents = 1000,
	className = "",
	"data-testid": testId,
}: EventFeedProps) {
	// Limit events for memory management
	const displayEvents = events.length > maxEvents ? events.slice(-maxEvents) : events;

	// Auto-scroll behavior
	const { containerRef, isAutoScrolling, newItemCount, scrollToBottom, onNewItems, onScroll } =
		useAutoScroll({ threshold: 50 });

	// Track previous event count for detecting new events
	const prevCountRef = useRef(displayEvents.length);

	// Notify when new events arrive
	useEffect(() => {
		const newCount = displayEvents.length - prevCountRef.current;
		if (newCount > 0) {
			onNewItems(newCount);
		}
		prevCountRef.current = displayEvents.length;
	}, [displayEvents.length, onNewItems]);

	// Virtualizer setup
	const virtualizer = useVirtualizer({
		count: displayEvents.length,
		getScrollElement: () => containerRef.current,
		estimateSize: () => EVENT_ITEM_HEIGHT,
		overscan: 5,
	});

	// Handle scroll to bottom when auto-scrolling kicks in
	useEffect(() => {
		if (isAutoScrolling && containerRef.current) {
			virtualizer.scrollToIndex(displayEvents.length - 1, {
				align: "end",
				behavior: "auto",
			});
		}
	}, [isAutoScrolling, displayEvents.length, virtualizer, containerRef.current]);

	const containerHeight = typeof height === "number" ? `${height}px` : height;

	if (displayEvents.length === 0) {
		return (
			<div
				className={`relative surface-1 ${className}`}
				style={{ height: containerHeight }}
				data-testid={testId}
			>
				<EmptyState />
			</div>
		);
	}

	return (
		<div
			className={`relative overflow-hidden rounded-xl border border-stone-200/80 dark:border-night-700/60 shadow-sm bg-cream-50 dark:bg-night-900 ${className}`}
			style={{ height: containerHeight }}
			data-testid={testId}
		>
			{/* New Events Button - positioned at top of container */}
			<NewEventsButton count={newItemCount} onClick={scrollToBottom} />

			{/* Virtualized List */}
			<div
				ref={containerRef}
				className="h-full overflow-y-auto"
				onScroll={onScroll}
				role="log"
				aria-live="polite"
				aria-label="Event feed"
			>
				<div
					style={{
						height: `${virtualizer.getTotalSize()}px`,
						width: "100%",
						position: "relative",
					}}
				>
					{virtualizer.getVirtualItems().map((virtualItem) => {
						const event = displayEvents[virtualItem.index];
						if (!event) {
							return null;
						}
						return (
							<div
								key={event.id}
								style={{
									position: "absolute",
									top: 0,
									left: 0,
									width: "100%",
									height: `${virtualItem.size}px`,
									transform: `translateY(${virtualItem.start}px)`,
								}}
							>
								<EventItem event={event} onClick={onEventClick} />
							</div>
						);
					})}
				</div>
			</div>

			{/* Living "Live" Indicator with Cream Glow */}
			{isAutoScrolling && (
				<div
					className="absolute bottom-3 right-3 flex items-center gap-1.5 px-2.5 py-1.5 bg-night-900/90 dark:bg-night-800/95 backdrop-blur-sm text-white text-xs font-medium rounded-full shadow-md"
					aria-hidden="true"
				>
					{/* Pulsing dot - the "Living Indicator" */}
					<span className="relative flex h-2 w-2">
						<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
						<span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
					</span>
					<span className="tracking-wide">LIVE</span>
				</div>
			)}
		</div>
	);
});

// ============================================
// Exports
// ============================================

export type { EventItemProps, NewEventsButtonProps };
export default EventFeed;
