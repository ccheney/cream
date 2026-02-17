/**
 * CBR persistence and retrieval integration tests.
 */

Bun.env.CREAM_ENV = "PAPER";

import { describe, expect, mock, test } from "bun:test";
import { type CBRMarketSnapshot, retainCase, retrieveSimilarCases, updateCaseOutcome } from "./cbr";
import type { EmbeddingClient } from "./embeddings";
import type { TradeDecision } from "./index";

interface HelixClient {
	query<T = unknown>(
		queryName: string,
		params?: Record<string, unknown>,
	): Promise<{ data: T; executionTimeMs: number }>;
}

function createMockSnapshot(overrides: Partial<CBRMarketSnapshot> = {}): CBRMarketSnapshot {
	return {
		instrumentId: "AAPL",
		regimeLabel: "BULL_TREND",
		sector: "Technology",
		indicators: {
			rsi: 65,
			atr: 3.5,
			volatility: 0.25,
			volumeRatio: 1.2,
		},
		currentPrice: 150,
		positionContext: "No current position",
		...overrides,
	};
}

function createMockDecision(overrides: Partial<TradeDecision> = {}): TradeDecision {
	return {
		decision_id: "dec-123",
		cycle_id: "cycle-1",
		instrument_id: "AAPL",
		underlying_symbol: "AAPL",
		regime_label: "BULL_TREND",
		action: "BUY",
		decision_json: JSON.stringify({ size: 100, direction: "long" }),
		rationale_text: "Strong momentum with RSI at 65 and positive sector sentiment",
		snapshot_reference: "snapshot-123",
		realized_outcome: JSON.stringify({
			pnl: 500,
			return_pct: 0.03,
			holding_hours: 48,
		}),
		created_at: "2025-01-01T10:00:00Z",
		closed_at: "2025-01-03T10:00:00Z",
		environment: "PAPER",
		...overrides,
	};
}

function createMockHelixClient(
	overrides: Partial<{ query: HelixClient["query"] }> = {},
): HelixClient {
	return {
		query: mock(() =>
			Promise.resolve({
				data: [] as unknown,
				executionTimeMs: 10,
			}),
		) as HelixClient["query"],
		...overrides,
	};
}

function createMockEmbeddingClient(): EmbeddingClient {
	return {
		generateEmbedding: mock(() =>
			Promise.resolve({
				values: new Array(768).fill(0.1),
				model: "test-model",
				generatedAt: new Date().toISOString(),
				inputLength: 100,
			}),
		),
		batchGenerateEmbeddings: mock(() =>
			Promise.resolve({
				embeddings: [],
				processingTimeMs: 10,
				apiCalls: 0,
			}),
		),
		getConfig: mock(() => ({
			model: "test-model",
			dimensions: 768,
			batchSize: 100,
			maxTokens: 8192,
			provider: "gemini" as const,
			apiKeyEnvVar: "TEST_API_KEY",
		})),
	} as unknown as EmbeddingClient;
}

describe("retrieveSimilarCases basic", () => {
	test("calls HelixDB with correct parameters", async () => {
		const queryMock = mock(() =>
			Promise.resolve({
				data: [
					{
						decision_id: "dec-1",
						instrument_id: "AAPL",
						regime_label: "BULL_TREND",
						action: "BUY",
						rationale_text: "Test rationale",
						environment: "PAPER",
						similarity_score: 0.85,
					},
				],
				executionTimeMs: 15,
			}),
		) as HelixClient["query"];
		const client = createMockHelixClient({ query: queryMock });
		const embedder = createMockEmbeddingClient();
		const snapshot = createMockSnapshot();
		const result = await retrieveSimilarCases(client, embedder, snapshot);
		expect(queryMock).toHaveBeenCalled();
		expect(result.cases).toHaveLength(1);
		expect(result.cases[0]?.caseId).toBe("dec-1");
	});
});

describe("retrieveSimilarCases filtering", () => {
	test("applies minimum similarity filter", async () => {
		const queryMock = mock(() =>
			Promise.resolve({
				data: [
					{
						decision_id: "dec-1",
						instrument_id: "AAPL",
						regime_label: "BULL_TREND",
						action: "BUY",
						rationale_text: "High similarity",
						environment: "PAPER",
						similarity_score: 0.9,
					},
					{
						decision_id: "dec-2",
						instrument_id: "AAPL",
						regime_label: "BULL_TREND",
						action: "BUY",
						rationale_text: "Low similarity",
						environment: "PAPER",
						similarity_score: 0.3,
					},
				],
				executionTimeMs: 15,
			}),
		) as HelixClient["query"];
		const client = createMockHelixClient({ query: queryMock });
		const embedder = createMockEmbeddingClient();
		const snapshot = createMockSnapshot();
		const result = await retrieveSimilarCases(client, embedder, snapshot, {
			minSimilarity: 0.5,
		});
		expect(result.cases).toHaveLength(1);
		expect(result.cases[0]?.caseId).toBe("dec-1");
	});
});

describe("retrieveSimilarCases failures", () => {
	test("handles HelixDB errors gracefully", async () => {
		const queryMock = mock(() => Promise.reject(new Error("Connection failed")));
		const client = createMockHelixClient({ query: queryMock });
		const embedder = createMockEmbeddingClient();
		const snapshot = createMockSnapshot();
		const result = await retrieveSimilarCases(client, embedder, snapshot);
		expect(result.cases).toHaveLength(0);
	});
});

describe("retainCase", () => {
	test("calls InsertTradeDecision with correct parameters", async () => {
		const queryMock = mock(() =>
			Promise.resolve({
				data: { decision_id: "dec-new" },
				executionTimeMs: 20,
			}),
		) as HelixClient["query"];
		const client = createMockHelixClient({ query: queryMock });
		const decision = createMockDecision({ decision_id: "dec-new" });
		const result = await retainCase(client, decision);
		expect(result.success).toBe(true);
		expect(result.decisionId).toBe("dec-new");
		expect(queryMock).toHaveBeenCalledWith(
			"InsertTradeDecision",
			expect.objectContaining({
				decision_id: "dec-new",
				instrument_id: "AAPL",
				regime_label: "BULL_TREND",
			}),
		);
	});

	test("returns failure on HelixDB error", async () => {
		const queryMock = mock(() => Promise.reject(new Error("Insert failed")));
		const client = createMockHelixClient({ query: queryMock });
		const decision = createMockDecision();
		const result = await retainCase(client, decision);
		expect(result.success).toBe(false);
		expect(result.error).toContain("Insert failed");
	});
});

describe("updateCaseOutcome", () => {
	test("calls UpdateDecisionOutcome with serialized outcome", async () => {
		const queryMock = mock(() =>
			Promise.resolve({
				data: { decision_id: "dec-123" },
				executionTimeMs: 10,
			}),
		) as HelixClient["query"];
		const client = createMockHelixClient({ query: queryMock });
		const success = await updateCaseOutcome(client, "dec-123", {
			pnl: 500,
			returnPct: 0.03,
			holdingHours: 48,
		});
		expect(success).toBe(true);
		expect(queryMock).toHaveBeenCalledWith(
			"UpdateDecisionOutcome",
			expect.objectContaining({
				decision_id: "dec-123",
			}),
		);
	});

	test("returns false on update failure", async () => {
		const queryMock = mock(() => Promise.reject(new Error("Update failed")));
		const client = createMockHelixClient({ query: queryMock });
		const success = await updateCaseOutcome(client, "dec-123", {
			pnl: 500,
			returnPct: 0.03,
			holdingHours: 48,
		});
		expect(success).toBe(false);
	});
});
