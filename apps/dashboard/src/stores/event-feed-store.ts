/**
 * @see docs/plans/ui/31-realtime-patterns.md
 */

import { create } from "zustand";
import { devtools, subscribeWithSelector } from "zustand/middleware";

export type EventType =
	| "trade_executed"
	| "order_placed"
	| "order_cancelled"
	| "order_filled"
	| "order_rejected"
	| "position_opened"
	| "position_closed"
	| "stop_triggered"
	| "take_profit_triggered"
	| "margin_warning"
	| "system_alert"
	| "agent_decision"
	| "market_event";

export type EventSeverity = "info" | "warning" | "error" | "success";

export interface FeedEvent {
	id: string;
	type: EventType;
	severity: EventSeverity;
	title: string;
	message: string;
	timestamp: Date;
	symbol?: string;
	metadata?: Record<string, unknown>;
}

export interface EventFeedState {
	/** Newest events are last in array */
	events: FeedEvent[];
	maxEvents: number;
	isAtBottom: boolean;
	/** Unread count when user scrolled away from bottom */
	newEventCount: number;
	isPaused: boolean;
	/** Empty array means no filter (show all) */
	typeFilter: EventType[];
	/** Empty array means no filter (show all) */
	severityFilter: EventSeverity[];
}

export interface EventFeedActions {
	addEvent: (event: Omit<FeedEvent, "id" | "timestamp">) => void;
	addEvents: (events: Array<Omit<FeedEvent, "id" | "timestamp">>) => void;
	clearEvents: () => void;
	setIsAtBottom: (isAtBottom: boolean) => void;
	resetNewEventCount: () => void;
	setPaused: (isPaused: boolean) => void;
	togglePaused: () => void;
	setTypeFilter: (types: EventType[]) => void;
	setSeverityFilter: (severities: EventSeverity[]) => void;
	getFilteredEvents: () => FeedEvent[];
}

export type EventFeedStore = EventFeedState & EventFeedActions;

const DEFAULT_MAX_EVENTS = 1000;

const initialState: EventFeedState = {
	events: [],
	maxEvents: DEFAULT_MAX_EVENTS,
	isAtBottom: true,
	newEventCount: 0,
	isPaused: false,
	typeFilter: [],
	severityFilter: [],
};

function generateEventId(): string {
	return `evt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export const useEventFeedStore = create<EventFeedStore>()(
	devtools(
		subscribeWithSelector((set, get) => ({
			...initialState,

			addEvent: (event) => {
				if (get().isPaused) {
					return;
				}

				const newEvent: FeedEvent = {
					...event,
					id: generateEventId(),
					timestamp: new Date(),
				};

				set((state) => {
					const events = [...state.events, newEvent];
					const trimmedEvents =
						events.length > state.maxEvents
							? events.slice(events.length - state.maxEvents)
							: events;

					return {
						events: trimmedEvents,
						newEventCount: state.isAtBottom ? 0 : state.newEventCount + 1,
					};
				});
			},

			addEvents: (events) => {
				if (get().isPaused) {
					return;
				}

				const now = new Date();
				const newEvents: FeedEvent[] = events.map((event, index) => ({
					...event,
					id: generateEventId(),
					timestamp: new Date(now.getTime() + index), // Stagger for stable ordering
				}));

				set((state) => {
					const allEvents = [...state.events, ...newEvents];
					const trimmedEvents =
						allEvents.length > state.maxEvents
							? allEvents.slice(allEvents.length - state.maxEvents)
							: allEvents;

					return {
						events: trimmedEvents,
						newEventCount: state.isAtBottom ? 0 : state.newEventCount + newEvents.length,
					};
				});
			},

			clearEvents: () => {
				set({
					events: [],
					newEventCount: 0,
				});
			},

			setIsAtBottom: (isAtBottom) => {
				set({
					isAtBottom,
					newEventCount: isAtBottom ? 0 : get().newEventCount,
				});
			},

			resetNewEventCount: () => {
				set({ newEventCount: 0 });
			},

			setPaused: (isPaused) => {
				set({ isPaused });
			},

			togglePaused: () => {
				set((state) => ({ isPaused: !state.isPaused }));
			},

			setTypeFilter: (types) => {
				set({ typeFilter: types });
			},

			setSeverityFilter: (severities) => {
				set({ severityFilter: severities });
			},

			getFilteredEvents: () => {
				const state = get();
				let filtered = state.events;

				if (state.typeFilter.length > 0) {
					filtered = filtered.filter((e) => state.typeFilter.includes(e.type));
				}

				if (state.severityFilter.length > 0) {
					filtered = filtered.filter((e) => state.severityFilter.includes(e.severity));
				}

				return filtered;
			},
		})),
		{ name: "event-feed-store" }
	)
);

export const selectEventCount = (state: EventFeedStore): number => state.events.length;

export const selectNewEventCount = (state: EventFeedStore): number => state.newEventCount;

export const selectHasNewEvents = (state: EventFeedStore): boolean => state.newEventCount > 0;

export const selectLatestEvent = (state: EventFeedStore): FeedEvent | null =>
	state.events.length > 0 ? (state.events[state.events.length - 1] ?? null) : null;

export const selectEventsByType =
	(type: EventType) =>
	(state: EventFeedStore): FeedEvent[] =>
		state.events.filter((e) => e.type === type);

export const selectEventsBySymbol =
	(symbol: string) =>
	(state: EventFeedStore): FeedEvent[] =>
		state.events.filter((e) => e.symbol === symbol);

export const selectEventsSince =
	(since: Date) =>
	(state: EventFeedStore): FeedEvent[] =>
		state.events.filter((e) => e.timestamp > since);

export function subscribeToNewEvents(callback: (event: FeedEvent) => void): () => void {
	let lastEventId: string | null = null;

	return useEventFeedStore.subscribe(
		(state) => state.events,
		(events) => {
			if (events.length === 0) {
				lastEventId = null;
				return;
			}

			const latestEvent = events[events.length - 1];
			if (!latestEvent) {
				return;
			}

			if (latestEvent.id !== lastEventId) {
				lastEventId = latestEvent.id;
				callback(latestEvent);
			}
		}
	);
}

export function subscribeToEventType(
	type: EventType,
	callback: (event: FeedEvent) => void
): () => void {
	let lastEventId: string | null = null;

	return useEventFeedStore.subscribe(
		(state) => state.events,
		(events) => {
			const typeEvents = events.filter((e) => e.type === type);
			if (typeEvents.length === 0) {
				lastEventId = null;
				return;
			}

			const latestEvent = typeEvents[typeEvents.length - 1];
			if (!latestEvent) {
				return;
			}

			if (latestEvent.id !== lastEventId) {
				lastEventId = latestEvent.id;
				callback(latestEvent);
			}
		}
	);
}

export default useEventFeedStore;
