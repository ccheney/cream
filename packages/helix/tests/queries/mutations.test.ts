/**
 * Mutations Tests
 */

import { beforeEach, describe, expect, it } from "bun:test";
import type { ExternalEvent, TradeDecision, TradeLifecycleEvent } from "@cream/helix-schema";
import type { HelixClient, QueryResult } from "../../src/client.js";
import {
	batchCreateEdges,
	batchCreateLifecycleEvents,
	batchUpsertExternalEvents,
	batchUpsertTradeDecisions,
	createEdge,
	createHasEventEdge,
	createInfluencedDecisionEdge,
	createLifecycleEvent,
	type NodeWithEmbedding,
	upsertExternalEvent,
	upsertTradeDecision,
} from "../../src/queries/mutations.js";

// ============================================
// Mock Client
// ============================================

function createMockClient(
	options: { shouldFail?: boolean; failOnQuery?: string } = {},
): HelixClient {
	return {
		query: async <T = unknown>(
			queryName: string,
			_params?: Record<string, unknown>,
		): Promise<QueryResult<T>> => {
			if (options.shouldFail) {
				throw new Error("Mock query failure");
			}
			if (options.failOnQuery && queryName === options.failOnQuery) {
				throw new Error(`Query ${queryName} failed`);
			}
			return { data: {} as T, executionTimeMs: 1 };
		},
		isConnected: () => true,
		healthCheck: async () => ({ healthy: true, latencyMs: 1 }),
		close: () => {},
		getConfig: () => ({
			host: "localhost",
			port: 6969,
			timeout: 5000,
			maxRetries: 3,
			retryDelay: 100,
		}),
	};
}

// ============================================
// Trade Decision Tests
// ============================================

describe("upsertTradeDecision", () => {
	let client: HelixClient;

	beforeEach(() => {
		client = createMockClient();
	});

	it("should upsert a trade decision successfully", async () => {
		const decision = {
			decision_id: "dec-001",
			cycle_id: "cycle-001",
			instrument_id: "AAPL",
			regime_label: "bull_trend",
			action: "BUY",
			decision_json: "{}",
			rationale_text: "Strong momentum",
			snapshot_reference: "snap-001",
			created_at: new Date().toISOString(),
			environment: "PAPER",
		} as TradeDecision;

		const result = await upsertTradeDecision(client, decision);

		expect(result.success).toBe(true);
		expect(result.id).toBe("dec-001");
		expect(result.error).toBeUndefined();
	});

	it("should upsert a trade decision with embedding", async () => {
		const decision = {
			decision_id: "dec-002",
			cycle_id: "cycle-001",
			instrument_id: "MSFT",
			regime_label: "bear_trend",
			action: "SELL",
			decision_json: "{}",
			rationale_text: "Bearish pattern",
			snapshot_reference: "snap-002",
			created_at: new Date().toISOString(),
			environment: "PAPER",
		} as TradeDecision;
		const embedding = new Array(768).fill(0.5);

		const result = await upsertTradeDecision(client, decision, embedding, "text-embedding-004");

		expect(result.success).toBe(true);
		expect(result.id).toBe("dec-002");
	});

	it("should return error on failure", async () => {
		const failingClient = createMockClient({ shouldFail: true });
		const decision = {
			decision_id: "dec-003",
			cycle_id: "cycle-001",
			instrument_id: "GOOG",
			regime_label: "range",
			action: "HOLD",
			decision_json: "{}",
			rationale_text: "Wait",
			snapshot_reference: "snap-003",
			created_at: new Date().toISOString(),
			environment: "PAPER",
		} as TradeDecision;

		const result = await upsertTradeDecision(failingClient, decision);

		expect(result.success).toBe(false);
		expect(result.id).toBe("dec-003");
		expect(result.error).toBe("Mock query failure");
	});
});

// ============================================
// Lifecycle Event Tests
// ============================================

describe("createLifecycleEvent", () => {
	let client: HelixClient;

	beforeEach(() => {
		client = createMockClient();
	});

	it("should create a lifecycle event successfully", async () => {
		const event = {
			event_id: "evt-001",
			decision_id: "dec-001",
			event_type: "FILL",
			timestamp: new Date().toISOString(),
			price: 150.25,
			quantity: 100,
			environment: "PAPER",
		} as TradeLifecycleEvent;

		const result = await createLifecycleEvent(client, event);

		expect(result.success).toBe(true);
		expect(result.id).toBe("evt-001");
	});

	it("should return error on failure", async () => {
		const failingClient = createMockClient({ shouldFail: true });
		const event = {
			event_id: "evt-002",
			decision_id: "dec-001",
			event_type: "CLOSE",
			timestamp: new Date().toISOString(),
			price: 155.5,
			quantity: 100,
			environment: "PAPER",
		} as TradeLifecycleEvent;

		const result = await createLifecycleEvent(failingClient, event);

		expect(result.success).toBe(false);
		expect(result.id).toBe("evt-002");
		expect(result.error).toBe("Mock query failure");
	});
});

// ============================================
// External Event Tests
// ============================================

describe("upsertExternalEvent", () => {
	let client: HelixClient;

	beforeEach(() => {
		client = createMockClient();
	});

	it("should upsert an external event successfully", async () => {
		const event = {
			event_id: "ext-001",
			event_type: "NEWS",
			event_time: new Date().toISOString(),
			payload: JSON.stringify({ source: "reuters", headline: "Apple beats Q4 expectations" }),
			related_instrument_ids: '["AAPL"]',
		} as ExternalEvent;

		const result = await upsertExternalEvent(client, event);

		expect(result.success).toBe(true);
		expect(result.id).toBe("ext-001");
	});

	it("should upsert an external event with embedding", async () => {
		const event = {
			event_id: "ext-002",
			event_type: "EARNINGS",
			event_time: new Date().toISOString(),
			payload: JSON.stringify({ source: "sec", headline: "Apple Q4 2025 Earnings" }),
			related_instrument_ids: '["AAPL"]',
		} as ExternalEvent;
		const embedding = new Array(768).fill(0.3);

		const result = await upsertExternalEvent(client, event, embedding, "text-embedding-004");

		expect(result.success).toBe(true);
		expect(result.id).toBe("ext-002");
	});

	it("should return error on failure", async () => {
		const failingClient = createMockClient({ shouldFail: true });
		const event = {
			event_id: "ext-003",
			event_type: "NEWS",
			event_time: new Date().toISOString(),
			payload: JSON.stringify({ source: "bloomberg", headline: "Market update" }),
			related_instrument_ids: "[]",
		} as ExternalEvent;

		const result = await upsertExternalEvent(failingClient, event);

		expect(result.success).toBe(false);
		expect(result.id).toBe("ext-003");
		expect(result.error).toBe("Mock query failure");
	});
});

// ============================================
// Edge Tests
// ============================================

describe("createEdge", () => {
	let client: HelixClient;

	beforeEach(() => {
		client = createMockClient();
	});

	it("should create an edge successfully", async () => {
		const result = await createEdge(client, {
			sourceId: "node-001",
			targetId: "node-002",
			edgeType: "RELATES_TO",
		});

		expect(result.success).toBe(true);
		expect(result.id).toBe("node-001->node-002");
	});

	it("should create an edge with properties", async () => {
		const result = await createEdge(client, {
			sourceId: "node-003",
			targetId: "node-004",
			edgeType: "FOLLOWS",
			properties: { weight: 0.8 },
		});

		expect(result.success).toBe(true);
		expect(result.id).toBe("node-003->node-004");
	});

	it("should return error on failure", async () => {
		const failingClient = createMockClient({ shouldFail: true });
		const result = await createEdge(failingClient, {
			sourceId: "node-005",
			targetId: "node-006",
			edgeType: "TEST",
		});

		expect(result.success).toBe(false);
		expect(result.id).toBe("node-005->node-006");
		expect(result.error).toBe("Mock query failure");
	});
});

describe("createInfluencedDecisionEdge", () => {
	let client: HelixClient;

	beforeEach(() => {
		client = createMockClient();
	});

	it("should create an influenced decision edge", async () => {
		const result = await createInfluencedDecisionEdge(client, {
			source_id: "ext-001",
			target_id: "dec-001",
			influence_score: 0.75,
			influence_type: "POSITIVE",
		});

		expect(result.success).toBe(true);
		expect(result.id).toBe("ext-001->dec-001");
	});
});

describe("createHasEventEdge", () => {
	let client: HelixClient;

	beforeEach(() => {
		client = createMockClient();
	});

	it("should create a has event edge", async () => {
		const result = await createHasEventEdge(client, {
			source_id: "dec-001",
			target_id: "evt-001",
		});

		expect(result.success).toBe(true);
		expect(result.id).toBe("dec-001->evt-001");
	});
});

// ============================================
// Batch Tests
// ============================================

describe("batchUpsertTradeDecisions", () => {
	let client: HelixClient;

	beforeEach(() => {
		client = createMockClient();
	});

	it("should batch upsert trade decisions", async () => {
		const decisions: NodeWithEmbedding<TradeDecision>[] = [
			{
				node: {
					decision_id: "batch-001",
					cycle_id: "cycle-001",
					instrument_id: "AAPL",
					regime_label: "bull_trend",
					action: "BUY",
					decision_json: "{}",
					rationale_text: "Test",
					snapshot_reference: "snap-batch-001",
					created_at: new Date().toISOString(),
					environment: "PAPER",
				} as TradeDecision,
			},
			{
				node: {
					decision_id: "batch-002",
					cycle_id: "cycle-001",
					instrument_id: "MSFT",
					regime_label: "bear_trend",
					action: "SELL",
					decision_json: "{}",
					rationale_text: "Test 2",
					snapshot_reference: "snap-batch-002",
					created_at: new Date().toISOString(),
					environment: "PAPER",
				} as TradeDecision,
				embedding: new Array(768).fill(0.5),
				embeddingModelVersion: "text-embedding-004",
			},
		];

		const result = await batchUpsertTradeDecisions(client, decisions);

		expect(result.successful).toHaveLength(2);
		expect(result.failed).toHaveLength(0);
		expect(result.totalProcessed).toBe(2);
		expect(result.executionTimeMs).toBeGreaterThan(0);
	});

	it("should handle partial failures", async () => {
		const failingClient = createMockClient({ failOnQuery: "upsertTradeDecision" });
		const decisions: NodeWithEmbedding<TradeDecision>[] = [
			{
				node: {
					decision_id: "fail-001",
					cycle_id: "cycle-001",
					instrument_id: "AAPL",
					regime_label: "bull_trend",
					action: "BUY",
					decision_json: "{}",
					rationale_text: "Test",
					snapshot_reference: "snap-fail-001",
					created_at: new Date().toISOString(),
					environment: "PAPER",
				} as TradeDecision,
			},
		];

		const result = await batchUpsertTradeDecisions(failingClient, decisions);

		expect(result.failed).toHaveLength(1);
		expect(result.totalProcessed).toBe(1);
	});
});

describe("batchCreateLifecycleEvents", () => {
	let client: HelixClient;

	beforeEach(() => {
		client = createMockClient();
	});

	it("should batch create lifecycle events", async () => {
		const events: TradeLifecycleEvent[] = [
			{
				event_id: "batch-evt-001",
				decision_id: "dec-001",
				event_type: "FILL",
				timestamp: new Date().toISOString(),
				price: 150.25,
				quantity: 100,
				environment: "PAPER",
			} as TradeLifecycleEvent,
			{
				event_id: "batch-evt-002",
				decision_id: "dec-001",
				event_type: "CLOSE",
				timestamp: new Date().toISOString(),
				price: 155.5,
				quantity: 100,
				environment: "PAPER",
			} as TradeLifecycleEvent,
		];

		const result = await batchCreateLifecycleEvents(client, events);

		expect(result.successful).toHaveLength(2);
		expect(result.failed).toHaveLength(0);
		expect(result.totalProcessed).toBe(2);
	});
});

describe("batchUpsertExternalEvents", () => {
	let client: HelixClient;

	beforeEach(() => {
		client = createMockClient();
	});

	it("should batch upsert external events", async () => {
		const events: NodeWithEmbedding<ExternalEvent>[] = [
			{
				node: {
					event_id: "batch-ext-001",
					event_type: "NEWS",
					event_time: new Date().toISOString(),
					payload: JSON.stringify({ source: "reuters", headline: "Headline 1" }),
					related_instrument_ids: '["AAPL"]',
				} as ExternalEvent,
			},
			{
				node: {
					event_id: "batch-ext-002",
					event_type: "EARNINGS",
					event_time: new Date().toISOString(),
					payload: JSON.stringify({ source: "sec", headline: "Headline 2" }),
					related_instrument_ids: '["MSFT"]',
				} as ExternalEvent,
				embedding: new Array(768).fill(0.4),
			},
		];

		const result = await batchUpsertExternalEvents(client, events);

		expect(result.successful).toHaveLength(2);
		expect(result.failed).toHaveLength(0);
		expect(result.totalProcessed).toBe(2);
	});
});

describe("batchCreateEdges", () => {
	let client: HelixClient;

	beforeEach(() => {
		client = createMockClient();
	});

	it("should batch create edges", async () => {
		const edges = [
			{ sourceId: "a", targetId: "b", edgeType: "RELATES_TO" },
			{ sourceId: "b", targetId: "c", edgeType: "FOLLOWS", properties: { weight: 0.5 } },
		];

		const result = await batchCreateEdges(client, edges);

		expect(result.successful).toHaveLength(2);
		expect(result.failed).toHaveLength(0);
		expect(result.totalProcessed).toBe(2);
	});

	it("should handle all failures", async () => {
		const failingClient = createMockClient({ shouldFail: true });
		const edges = [{ sourceId: "x", targetId: "y", edgeType: "TEST" }];

		const result = await batchCreateEdges(failingClient, edges);

		expect(result.successful).toHaveLength(0);
		expect(result.failed).toHaveLength(1);
		expect(result.failed[0]?.error).toBe("Mock query failure");
	});
});
