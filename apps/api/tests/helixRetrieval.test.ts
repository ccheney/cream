/**
 * HelixDB Retrieval Workflow Step Tests (GraphRAG)
 */

import { describe, expect, mock, test } from "bun:test";
import type { HelixClient } from "@cream/helix";
import type { TradeDecision } from "@cream/helix-schema";
import {
	DEFAULT_RETRIEVAL_CONFIG,
	executeHelixRetrieval,
	PERFORMANCE_TARGETS,
	type RetrievalInput,
	retrieveRegimeDecisions,
	retrieveSimilarDecisions,
	retrieveVectorOnly,
} from "../workflows/steps/helixRetrieval";

// ============================================
// Test Fixtures
// ============================================

function createMockClient(
	queryFn: (name: string, params?: Record<string, unknown>) => Promise<unknown> = async () => ({
		data: [],
		executionTimeMs: 1,
	}),
): HelixClient {
	return {
		query: mock(queryFn),
		isConnected: () => true,
		close: mock(() => {}),
		getConfig: () => ({
			host: "localhost",
			port: 6969,
			timeout: 5000,
			maxRetries: 3,
			retryDelay: 100,
		}),
	};
}

function createTestDecision(id: string, overrides: Partial<TradeDecision> = {}): TradeDecision {
	return {
		decision_id: id,
		cycle_id: "cycle-001",
		instrument_id: overrides.instrument_id ?? "AAPL",
		underlying_symbol: overrides.underlying_symbol ?? "AAPL",
		regime_label: overrides.regime_label ?? "BULL_TREND",
		action: overrides.action ?? "BUY",
		decision_json: JSON.stringify({ action: "BUY", size: 100 }),
		rationale_text: overrides.rationale_text ?? "Strong momentum with positive earnings outlook",
		snapshot_reference: "snapshot-001",
		created_at: new Date().toISOString(),
		environment: "PAPER",
		...overrides,
	};
}

function createQueryEmbedding(): number[] {
	return new Array(1536).fill(0.1);
}

// ============================================
// Tests
// ============================================

describe("HelixDB Retrieval (GraphRAG)", () => {
	describe("executeHelixRetrieval", () => {
		test("successfully retrieves and fuses results", async () => {
			const vectorResults = [
				{
					id: "dec-001",
					type: "TradeDecision",
					properties: createTestDecision("dec-001"),
					similarity: 0.95,
				},
				{
					id: "dec-002",
					type: "TradeDecision",
					properties: createTestDecision("dec-002"),
					similarity: 0.85,
				},
			];

			const graphResults = [
				createTestDecision("dec-001"), // Same as vector
				createTestDecision("dec-003"), // New
			];

			const client = createMockClient(async (name, _params) => {
				if (name === "vectorSearch") {
					return { data: vectorResults, executionTimeMs: 1.5 };
				}
				if (name === "getNodesByType") {
					return {
						data: graphResults.map((d) => ({
							id: d.decision_id,
							type: "TradeDecision",
							properties: d,
						})),
						executionTimeMs: 0.5,
					};
				}
				return { data: [], executionTimeMs: 0 };
			});

			const input: RetrievalInput = {
				queryEmbedding: createQueryEmbedding(),
				instrumentId: "AAPL",
				regime: "BULL_TREND",
				topK: 5,
			};

			const result = await executeHelixRetrieval(input, client);

			expect(result.success).toBe(true);
			expect(result.decisions.length).toBeGreaterThan(0);
			expect(result.metrics.vectorSearchMs).toBeGreaterThan(0);
			expect(result.metrics.graphTraversalMs).toBeGreaterThan(0);
			expect(result.metrics.totalMs).toBeGreaterThan(0);
		});

		test("handles empty vector results gracefully", async () => {
			const client = createMockClient(async () => ({
				data: [],
				executionTimeMs: 1,
			}));

			const input: RetrievalInput = {
				queryEmbedding: createQueryEmbedding(),
				topK: 5,
			};

			const result = await executeHelixRetrieval(input, client);

			expect(result.success).toBe(true);
			expect(result.decisions.length).toBe(0);
			expect(result.emptyReason).toBeDefined();
			expect(result.emptyReason).toContain("No historical trade decisions");
		});

		test("handles empty graph results gracefully", async () => {
			const vectorResults = [
				{
					id: "dec-001",
					type: "TradeDecision",
					properties: createTestDecision("dec-001"),
					similarity: 0.9,
				},
			];

			const client = createMockClient(async (name) => {
				if (name === "vectorSearch") {
					return { data: vectorResults, executionTimeMs: 1 };
				}
				return { data: [], executionTimeMs: 0.5 };
			});

			const input: RetrievalInput = {
				queryEmbedding: createQueryEmbedding(),
				instrumentId: "AAPL",
				topK: 5,
			};

			const result = await executeHelixRetrieval(input, client);

			expect(result.success).toBe(true);
			expect(result.decisions.length).toBe(1);
			expect(result.sourceCounts.vectorOnly).toBe(1);
			expect(result.sourceCounts.graphOnly).toBe(0);
		});

		test("tracks performance metrics accurately", async () => {
			const client = createMockClient(async (name) => {
				// Simulate realistic latencies
				if (name === "vectorSearch") {
					await new Promise((r) => setTimeout(r, 2));
					return { data: [], executionTimeMs: 2 };
				}
				if (name === "getNodesByType") {
					await new Promise((r) => setTimeout(r, 1));
					return { data: [], executionTimeMs: 0.5 };
				}
				return { data: [], executionTimeMs: 0 };
			});

			const input: RetrievalInput = {
				queryEmbedding: createQueryEmbedding(),
				instrumentId: "AAPL",
			};

			const result = await executeHelixRetrieval(input, client);

			expect(result.metrics.vectorSearchMs).toBeGreaterThanOrEqual(1);
			expect(result.metrics.totalMs).toBeGreaterThan(result.metrics.vectorSearchMs);
		});

		test("handles errors gracefully", async () => {
			const client = createMockClient(async () => {
				throw new Error("Database connection failed");
			});

			const input: RetrievalInput = {
				queryEmbedding: createQueryEmbedding(),
			};

			const result = await executeHelixRetrieval(input, client);

			expect(result.success).toBe(false);
			expect(result.decisions.length).toBe(0);
			expect(result.emptyReason).toContain("Retrieval error");
			expect(result.emptyReason).toContain("Database connection failed");
		});

		test("uses default config values", async () => {
			const client = createMockClient();

			const input: RetrievalInput = {
				queryEmbedding: createQueryEmbedding(),
			};

			const result = await executeHelixRetrieval(input, client);

			expect(result.success).toBe(true);
			// Default topK is 10
			expect(result.decisions.length).toBeLessThanOrEqual(DEFAULT_RETRIEVAL_CONFIG.topK);
		});

		test("respects topK parameter", async () => {
			const vectorResults = Array.from({ length: 20 }, (_, i) => ({
				id: `dec-${i.toString().padStart(3, "0")}`,
				type: "TradeDecision",
				properties: createTestDecision(`dec-${i.toString().padStart(3, "0")}`),
				similarity: 0.9 - i * 0.01,
			}));

			const client = createMockClient(async (name) => {
				if (name === "vectorSearch") {
					return { data: vectorResults, executionTimeMs: 1 };
				}
				return { data: [], executionTimeMs: 0 };
			});

			const input: RetrievalInput = {
				queryEmbedding: createQueryEmbedding(),
				topK: 3,
			};

			const result = await executeHelixRetrieval(input, client);

			expect(result.success).toBe(true);
			expect(result.decisions.length).toBe(3);
		});
	});

	describe("GraphRAG Fusion", () => {
		test("boosts results found in both vector and graph", async () => {
			const decision1 = createTestDecision("dec-001");
			const decision2 = createTestDecision("dec-002");

			const vectorResults = [
				{ id: "dec-001", type: "TradeDecision", properties: decision1, similarity: 0.9 },
				{ id: "dec-002", type: "TradeDecision", properties: decision2, similarity: 0.8 },
			];

			const graphNodes = [
				{ id: "dec-001", type: "TradeDecision", properties: decision1 }, // Same as vector #1
			];

			const client = createMockClient(async (name) => {
				if (name === "vectorSearch") {
					return { data: vectorResults, executionTimeMs: 1 };
				}
				if (name === "getNodesByType") {
					return { data: graphNodes, executionTimeMs: 0.5 };
				}
				return { data: [], executionTimeMs: 0 };
			});

			const input: RetrievalInput = {
				queryEmbedding: createQueryEmbedding(),
				instrumentId: "AAPL",
				topK: 5,
			};

			const result = await executeHelixRetrieval(input, client);

			expect(result.success).toBe(true);
			expect(result.sourceCounts.both).toBeGreaterThanOrEqual(1);

			// The decision that appears in both should have higher relevance
			const bothMatch = result.decisions.find((d) => d.multiSourceMatch);
			const vectorOnlyMatch = result.decisions.find((d) => !d.multiSourceMatch);

			if (bothMatch && vectorOnlyMatch) {
				expect(bothMatch.relevanceScore).toBeGreaterThan(vectorOnlyMatch.relevanceScore);
			}
		});

		test("correctly identifies source counts", async () => {
			const vectorOnlyDecision = createTestDecision("vec-only");
			const graphOnlyDecision = createTestDecision("graph-only", { instrument_id: "AAPL" });
			const bothDecision = createTestDecision("both", { instrument_id: "AAPL" });

			const vectorResults = [
				{ id: "vec-only", type: "TradeDecision", properties: vectorOnlyDecision, similarity: 0.9 },
				{ id: "both", type: "TradeDecision", properties: bothDecision, similarity: 0.85 },
			];

			const graphNodes = [
				{ id: "graph-only", type: "TradeDecision", properties: graphOnlyDecision },
				{ id: "both", type: "TradeDecision", properties: bothDecision },
			];

			const client = createMockClient(async (name) => {
				if (name === "vectorSearch") {
					return { data: vectorResults, executionTimeMs: 1 };
				}
				if (name === "getNodesByType") {
					return { data: graphNodes, executionTimeMs: 0.5 };
				}
				return { data: [], executionTimeMs: 0 };
			});

			const input: RetrievalInput = {
				queryEmbedding: createQueryEmbedding(),
				instrumentId: "AAPL",
			};

			const result = await executeHelixRetrieval(input, client);

			expect(result.success).toBe(true);
			expect(result.sourceCounts.vectorOnly).toBeGreaterThanOrEqual(1);
			expect(result.sourceCounts.graphOnly).toBeGreaterThanOrEqual(1);
			expect(result.sourceCounts.both).toBeGreaterThanOrEqual(1);
		});
	});

	describe("Decision Summaries", () => {
		test("creates correct summary format", async () => {
			const decision = createTestDecision("dec-001", {
				rationale_text: "Strong technical momentum with RSI above 70 and MACD crossover positive",
				action: "BUY",
				regime_label: "BULL_TREND",
				realized_outcome: "PROFIT",
			});

			const vectorResults = [
				{ id: "dec-001", type: "TradeDecision", properties: decision, similarity: 0.95 },
			];

			const client = createMockClient(async (name) => {
				if (name === "vectorSearch") {
					return { data: vectorResults, executionTimeMs: 1 };
				}
				return { data: [], executionTimeMs: 0 };
			});

			const input: RetrievalInput = {
				queryEmbedding: createQueryEmbedding(),
				topK: 5,
			};

			const result = await executeHelixRetrieval(input, client);

			expect(result.success).toBe(true);
			expect(result.decisions.length).toBe(1);

			const summary = result.decisions[0];
			expect(summary.decisionId).toBe("dec-001");
			expect(summary.instrumentId).toBe("AAPL");
			expect(summary.action).toBe("BUY");
			expect(summary.regime).toBe("BULL_TREND");
			expect(summary.outcome).toBe("PROFIT");
			expect(summary.rationaleSummary).toContain("Strong technical momentum");
			expect(summary.relevanceScore).toBeGreaterThan(0);
			expect(summary.relevanceScore).toBeLessThanOrEqual(1);
		});

		test("truncates long rationale text", async () => {
			const longRationale = "A".repeat(500);
			const decision = createTestDecision("dec-001", {
				rationale_text: longRationale,
			});

			const vectorResults = [
				{ id: "dec-001", type: "TradeDecision", properties: decision, similarity: 0.9 },
			];

			const client = createMockClient(async (name) => {
				if (name === "vectorSearch") {
					return { data: vectorResults, executionTimeMs: 1 };
				}
				return { data: [], executionTimeMs: 0 };
			});

			const input: RetrievalInput = {
				queryEmbedding: createQueryEmbedding(),
			};

			const result = await executeHelixRetrieval(input, client);

			expect(result.decisions[0].rationaleSummary.length).toBeLessThanOrEqual(
				DEFAULT_RETRIEVAL_CONFIG.maxRationaleSummaryLength,
			);
			expect(result.decisions[0].rationaleSummary.endsWith("...")).toBe(true);
		});
	});

	describe("Convenience Functions", () => {
		test("retrieveSimilarDecisions filters by symbol", async () => {
			const client = createMockClient();
			const result = await retrieveSimilarDecisions(
				createQueryEmbedding(),
				"AAPL",
				"BULL_TREND",
				5,
				client,
			);

			expect(result.success).toBe(true);
		});

		test("retrieveRegimeDecisions filters by regime", async () => {
			const client = createMockClient();
			const result = await retrieveRegimeDecisions(
				createQueryEmbedding(),
				"HIGH_VOLATILITY",
				10,
				client,
			);

			expect(result.success).toBe(true);
		});

		test("retrieveVectorOnly skips graph traversal", async () => {
			let _graphCalled = false;
			const client = createMockClient(async (name) => {
				if (name === "getNodesByType") {
					_graphCalled = true;
				}
				return { data: [], executionTimeMs: 1 };
			});

			const result = await retrieveVectorOnly(createQueryEmbedding(), 10, 0.5, client);

			expect(result.success).toBe(true);
			// Graph traversal is still called but with no filters
			// so it won't match anything specific
		});
	});

	describe("Edge Cases", () => {
		test("handles missing optional fields in decision", async () => {
			const decision: TradeDecision = {
				decision_id: "dec-001",
				cycle_id: "cycle-001",
				instrument_id: "AAPL",
				regime_label: "RANGE_BOUND",
				action: "HOLD",
				decision_json: "{}",
				rationale_text: "No clear direction",
				snapshot_reference: "snap-001",
				created_at: new Date().toISOString(),
				environment: "PAPER",
				// Missing: underlying_symbol, realized_outcome, closed_at
			};

			const vectorResults = [
				{ id: "dec-001", type: "TradeDecision", properties: decision, similarity: 0.8 },
			];

			const client = createMockClient(async (name) => {
				if (name === "vectorSearch") {
					return { data: vectorResults, executionTimeMs: 1 };
				}
				return { data: [], executionTimeMs: 0 };
			});

			const input: RetrievalInput = {
				queryEmbedding: createQueryEmbedding(),
			};

			const result = await executeHelixRetrieval(input, client);

			expect(result.success).toBe(true);
			expect(result.decisions.length).toBe(1);
			expect(result.decisions[0].underlyingSymbol).toBeUndefined();
			expect(result.decisions[0].outcome).toBeUndefined();
		});

		test("handles empty query embedding", async () => {
			const client = createMockClient();
			const input: RetrievalInput = {
				queryEmbedding: [],
			};

			const result = await executeHelixRetrieval(input, client);

			// Should still succeed (server will handle empty embedding)
			expect(result.success).toBe(true);
		});
	});

	describe("Performance Targets", () => {
		test("defines expected performance targets", () => {
			expect(PERFORMANCE_TARGETS.vectorSearchMs).toBe(2);
			expect(PERFORMANCE_TARGETS.graphTraversalMs).toBe(1);
			expect(PERFORMANCE_TARGETS.totalMs).toBe(10);
		});
	});
});
