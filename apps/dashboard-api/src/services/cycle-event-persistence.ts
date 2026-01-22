/**
 * Cycle Event Persistence Service
 *
 * Queues streaming events in memory and batches writes to database.
 * Uses fire-and-forget async flush every 500ms with sync flush on cycle completion.
 */

import type { CreateCycleEventInput, CyclesRepository } from "@cream/storage";

// ============================================
// Types
// ============================================

interface QueuedEvent extends CreateCycleEventInput {
	queuedAt: number;
}

// ============================================
// Service State
// ============================================

const eventQueues = new Map<string, QueuedEvent[]>();
const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();

const FLUSH_INTERVAL_MS = 500;

// ============================================
// Service Implementation
// ============================================

/**
 * Queue a streaming event for batched persistence
 */
export function queueEvent(cycleId: string, event: CreateCycleEventInput): void {
	const queue = eventQueues.get(cycleId) ?? [];
	queue.push({ ...event, queuedAt: Date.now() });
	eventQueues.set(cycleId, queue);

	// Schedule flush if not already scheduled
	if (!flushTimers.has(cycleId)) {
		const timer = setTimeout(() => {
			flushTimers.delete(cycleId);
			// Fire-and-forget async flush
			void flushAsync(cycleId);
		}, FLUSH_INTERVAL_MS);
		flushTimers.set(cycleId, timer);
	}
}

/**
 * Queue a tool call event
 */
export function queueToolCall(
	cycleId: string,
	agentType: string,
	data: {
		toolCallId: string;
		toolName: string;
		toolArgs: string;
	},
): void {
	queueEvent(cycleId, {
		cycleId,
		eventType: "tool_call",
		agentType,
		data,
	});
}

/**
 * Queue a tool result event
 */
export function queueToolResult(
	cycleId: string,
	agentType: string,
	data: {
		toolCallId: string;
		toolName: string;
		success: boolean;
		resultSummary?: string;
		durationMs?: number;
	},
): void {
	queueEvent(cycleId, {
		cycleId,
		eventType: "tool_result",
		agentType,
		data,
	});
}

/**
 * Queue a reasoning delta event
 */
export function queueReasoningDelta(cycleId: string, agentType: string, text: string): void {
	queueEvent(cycleId, {
		cycleId,
		eventType: "reasoning_delta",
		agentType,
		data: { text },
	});
}

/**
 * Queue a text delta event
 */
export function queueTextDelta(cycleId: string, agentType: string, text: string): void {
	queueEvent(cycleId, {
		cycleId,
		eventType: "text_delta",
		agentType,
		data: { text },
	});
}

/**
 * Queue an agent start event
 */
export function queueAgentStart(cycleId: string, agentType: string): void {
	queueEvent(cycleId, {
		cycleId,
		eventType: "agent_start",
		agentType,
	});
}

/**
 * Queue an agent complete event
 */
export function queueAgentComplete(
	cycleId: string,
	agentType: string,
	data?: { output?: unknown },
): void {
	queueEvent(cycleId, {
		cycleId,
		eventType: "agent_complete",
		agentType,
		data: data ?? {},
	});
}

// Repository reference for flushing
let cyclesRepoRef: CyclesRepository | null = null;

/**
 * Set the repository reference for flushing
 */
export function setCyclesRepository(repo: CyclesRepository): void {
	cyclesRepoRef = repo;
}

/**
 * Async flush - fire-and-forget, logs errors but doesn't throw
 */
async function flushAsync(cycleId: string): Promise<void> {
	const queue = eventQueues.get(cycleId);
	if (!queue || queue.length === 0) {
		return;
	}

	// Clear queue immediately to prevent double-flush
	eventQueues.set(cycleId, []);

	if (!cyclesRepoRef) {
		return;
	}

	try {
		await cyclesRepoRef.addEventsBatch(queue);
	} catch (_error) {
		// Non-critical - we don't re-queue to avoid memory buildup
	}
}

/**
 * Sync flush - waits for completion, used on cycle end
 */
export async function flushSync(cycleId: string): Promise<void> {
	// Clear any pending timer
	const timer = flushTimers.get(cycleId);
	if (timer) {
		clearTimeout(timer);
		flushTimers.delete(cycleId);
	}

	const queue = eventQueues.get(cycleId);
	if (!queue || queue.length === 0) {
		return;
	}

	// Clear queue
	eventQueues.set(cycleId, []);

	if (!cyclesRepoRef) {
		return;
	}

	// This one throws on error since it's sync
	await cyclesRepoRef.addEventsBatch(queue);
}

/**
 * Clear all queued events for a cycle (e.g., on error)
 */
export function clearQueue(cycleId: string): void {
	const timer = flushTimers.get(cycleId);
	if (timer) {
		clearTimeout(timer);
		flushTimers.delete(cycleId);
	}
	eventQueues.delete(cycleId);
}

/**
 * Get queue stats for debugging
 */
export function getQueueStats(): { cycleId: string; queueSize: number }[] {
	return Array.from(eventQueues.entries()).map(([cycleId, queue]) => ({
		cycleId,
		queueSize: queue.length,
	}));
}
