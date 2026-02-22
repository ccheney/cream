/**
 * WebSocket Cache Invalidation
 *
 * Handles TanStack Query cache invalidation triggered by WebSocket messages.
 * Uses debouncing to avoid excessive refetches from rapid message bursts.
 */

import { getQueryClient } from "./query-client";
import {
	handleWSMessageWithContext,
	mapInvalidationHintToQueryKey as resolveInvalidationHintToQueryKey,
} from "./ws-invalidation.handlers";
import type { WSMessage } from "./ws-invalidation.types";

const pendingInvalidations = new Set<string>();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 100;

function mapInvalidationHintToQueryKey(hint: string): readonly unknown[] | null {
	return resolveInvalidationHintToQueryKey(hint);
}

function queueInvalidation(hint: string): void {
	pendingInvalidations.add(hint);
	scheduleFlush();
}

function queueInvalidations(hints: string[]): void {
	for (const hint of hints) {
		pendingInvalidations.add(hint);
	}
	scheduleFlush();
}

function scheduleFlush(): void {
	if (debounceTimer !== null) {
		return;
	}

	debounceTimer = setTimeout(() => {
		flushPendingInvalidations();
		debounceTimer = null;
	}, DEBOUNCE_MS);
}

function flushPendingInvalidations(): void {
	if (pendingInvalidations.size === 0) {
		return;
	}

	const queryClient = getQueryClient();
	const processedKeys = new Set<string>();

	for (const hint of pendingInvalidations) {
		const queryKey = mapInvalidationHintToQueryKey(hint);
		if (!queryKey) {
			continue;
		}

		const keyString = JSON.stringify(queryKey);
		if (processedKeys.has(keyString)) {
			continue;
		}

		processedKeys.add(keyString);
		queryClient.invalidateQueries({ queryKey });
	}

	pendingInvalidations.clear();
}

export function handleWSMessage(message: WSMessage): void {
	handleWSMessageWithContext(message, {
		queryClient: getQueryClient(),
		queueInvalidation,
		queueInvalidations,
	});
}

export function createWSMessageHandler() {
	return handleWSMessage;
}

export function flushInvalidations(): void {
	if (debounceTimer !== null) {
		clearTimeout(debounceTimer);
		debounceTimer = null;
	}
	flushPendingInvalidations();
}

export { queueInvalidation, queueInvalidations };
export type {
	AgentOutputData,
	AggregateData,
	Candle,
	CycleProgressData,
	CycleResultData,
	DecisionData,
	OptionsQuoteData,
	OptionsTradeData,
	OrderData,
	QuoteData,
	ScannerAlertData,
	ScannerSignal,
	ScannerStatusData,
	SystemStatusData,
	WSMessage,
	WSMessageType,
} from "./ws-invalidation.types";

export default handleWSMessage;
