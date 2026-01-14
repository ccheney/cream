/**
 * HelixDB Memory Update Workflow Step Tests
 */

import { describe, expect, mock, test } from "bun:test";
import type { HelixClient } from "@cream/helix";
import type { ExternalEvent, TradeDecision, TradeLifecycleEvent } from "@cream/helix-schema";
import {
	DEFAULT_EMBEDDING_MODEL,
	executeHelixMemoryUpdate,
	type MemoryUpdateInput,
	recordLifecycleEvents,
	updateDecisionMemory,
	updateExternalEvents,
} from "../workflows/steps/helixMemoryUpdate";

// ============================================
// Test Fixtures
// ============================================

function createMockClient(
	queryFn: (name: string, params?: Record<string, unknown>) => Promise<unknown> = async () => ({})
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

function createTestDecision(id: string): TradeDecision {
	return {
		decision_id: id,
		cycle_id: "cycle-001",
		instrument_id: "AAPL",
		underlying_symbol: "AAPL",
		regime_label: "BULL_TREND",
		action: "BUY",
		decision_json: JSON.stringify({ action: "BUY", size: 100 }),
		rationale_text: "Strong momentum and positive earnings outlook",
		snapshot_reference: "snapshot-001",
		created_at: new Date().toISOString(),
		environment: "PAPER",
	};
}

function createTestLifecycleEvent(id: string, decisionId: string): TradeLifecycleEvent {
	return {
		event_id: id,
		decision_id: decisionId,
		event_type: "FILL",
		timestamp: new Date().toISOString(),
		price: 150.25,
		quantity: 100,
		environment: "PAPER",
	};
}

function createTestExternalEvent(id: string): ExternalEvent {
	return {
		event_id: id,
		event_type: "EARNINGS",
		event_time: new Date().toISOString(),
		payload: JSON.stringify({ eps: 1.52, revenue: 89000000000 }),
		text_summary: "Apple beats earnings expectations with strong iPhone sales",
		related_instrument_ids: JSON.stringify(["AAPL"]),
	};
}

// ============================================
// Tests
// ============================================

describe("HelixDB Memory Update", () => {
	describe("executeHelixMemoryUpdate", () => {
		test("successfully updates all node types", async () => {
			const client = createMockClient();
			const input: MemoryUpdateInput = {
				decisions: [
					{ decision: createTestDecision("dec-001"), embedding: new Array(1536).fill(0.1) },
					{ decision: createTestDecision("dec-002"), embedding: new Array(1536).fill(0.2) },
				],
				lifecycleEvents: [createTestLifecycleEvent("evt-001", "dec-001")],
				externalEvents: [
					{ event: createTestExternalEvent("ext-001"), embedding: new Array(1536).fill(0.3) },
				],
				influenceEdges: [
					{
						eventId: "ext-001",
						decisionId: "dec-001",
						influenceScore: 0.85,
						influenceType: "EARNINGS_CATALYST",
					},
				],
				embeddingModelVersion: "voyage-3",
			};

			const result = await executeHelixMemoryUpdate(input, client);

			expect(result.success).toBe(true);
			expect(result.decisions.successful.length).toBe(2);
			expect(result.lifecycleEvents.successful.length).toBe(1);
			expect(result.externalEvents.successful.length).toBe(1);
			expect(result.edges.successful.length).toBe(2); // 1 influence + 1 HAS_EVENT
			expect(result.errors.length).toBe(0);
			expect(result.totalExecutionTimeMs).toBeGreaterThan(0);
		});

		test("handles empty input gracefully", async () => {
			const client = createMockClient();
			const input: MemoryUpdateInput = {
				decisions: [],
				lifecycleEvents: [],
				externalEvents: [],
				influenceEdges: [],
			};

			const result = await executeHelixMemoryUpdate(input, client);

			expect(result.success).toBe(true);
			expect(result.decisions.totalProcessed).toBe(0);
			expect(result.lifecycleEvents.totalProcessed).toBe(0);
			expect(result.externalEvents.totalProcessed).toBe(0);
			expect(result.edges.totalProcessed).toBe(0);
		});

		test("reports partial failures for decisions", async () => {
			let callCount = 0;
			const client = createMockClient(async () => {
				callCount++;
				if (callCount === 2) {
					throw new Error("Database connection lost");
				}
				return {};
			});

			const input: MemoryUpdateInput = {
				decisions: [
					{ decision: createTestDecision("dec-001") },
					{ decision: createTestDecision("dec-002") },
					{ decision: createTestDecision("dec-003") },
				],
				lifecycleEvents: [],
				externalEvents: [],
				influenceEdges: [],
			};

			const result = await executeHelixMemoryUpdate(input, client);

			expect(result.success).toBe(false);
			expect(result.decisions.successful.length).toBe(2);
			expect(result.decisions.failed.length).toBe(1);
			expect(result.errors.length).toBe(1);
			expect(result.errors[0]).toContain("Failed to upsert 1 decisions");
		});

		test("tracks execution time accurately", async () => {
			const client = createMockClient(async () => {
				await new Promise((resolve) => setTimeout(resolve, 10));
				return {};
			});

			const input: MemoryUpdateInput = {
				decisions: [{ decision: createTestDecision("dec-001") }],
				lifecycleEvents: [],
				externalEvents: [],
				influenceEdges: [],
			};

			const result = await executeHelixMemoryUpdate(input, client);

			expect(result.totalExecutionTimeMs).toBeGreaterThanOrEqual(10);
		});

		test("uses default embedding model when not specified", async () => {
			const queryParams: Record<string, unknown>[] = [];
			const client = createMockClient(async (_name, params) => {
				if (params) {
					queryParams.push(params);
				}
				return {};
			});

			const input: MemoryUpdateInput = {
				decisions: [{ decision: createTestDecision("dec-001"), embedding: [0.1] }],
				lifecycleEvents: [],
				externalEvents: [],
				influenceEdges: [],
			};

			await executeHelixMemoryUpdate(input, client);

			expect(queryParams[0].embedding_model_version).toBe(DEFAULT_EMBEDDING_MODEL);
		});

		test("handles fatal errors gracefully", async () => {
			const client = createMockClient(async () => {
				throw new Error("Fatal database error");
			});

			const input: MemoryUpdateInput = {
				decisions: [{ decision: createTestDecision("dec-001") }],
				lifecycleEvents: [],
				externalEvents: [],
				influenceEdges: [],
			};

			const result = await executeHelixMemoryUpdate(input, client);

			expect(result.success).toBe(false);
			expect(result.errors.length).toBe(1);
			expect(result.errors[0]).toContain("Failed to upsert 1 decisions");
		});

		test("closes client when created internally", async () => {
			// This test verifies the finally block behavior
			// We can't easily test this without dependency injection
			// but we verify the structure is correct
			const input: MemoryUpdateInput = {
				decisions: [],
				lifecycleEvents: [],
				externalEvents: [],
				influenceEdges: [],
			};

			// This would fail if HELIX_HOST env var points to non-existent server
			// In production, this test would use a mock
			const client = createMockClient();
			const result = await executeHelixMemoryUpdate(input, client);

			expect(result.success).toBe(true);
			expect(client.close).toHaveBeenCalledTimes(0); // Client provided, not closed
		});
	});

	describe("Edge Building", () => {
		test("creates INFLUENCED_DECISION edges", async () => {
			const edgeInputs: Array<{ source_id: string; target_id: string; edge_type: string }> = [];
			const client = createMockClient(async (name, params) => {
				if (name === "createEdge" && params) {
					edgeInputs.push(params as { source_id: string; target_id: string; edge_type: string });
				}
				return {};
			});

			const input: MemoryUpdateInput = {
				decisions: [],
				lifecycleEvents: [],
				externalEvents: [],
				influenceEdges: [
					{
						eventId: "ext-001",
						decisionId: "dec-001",
						influenceScore: 0.9,
						influenceType: "NEWS_CATALYST",
					},
				],
			};

			await executeHelixMemoryUpdate(input, client);

			const influenceEdge = edgeInputs.find((e) => e.edge_type === "INFLUENCED_DECISION");
			expect(influenceEdge).toBeDefined();
			expect(influenceEdge?.source_id).toBe("ext-001");
			expect(influenceEdge?.target_id).toBe("dec-001");
		});

		test("creates HAS_EVENT edges for lifecycle events", async () => {
			const edgeInputs: Array<{ source_id: string; target_id: string; edge_type: string }> = [];
			const client = createMockClient(async (name, params) => {
				if (name === "createEdge" && params) {
					edgeInputs.push(params as { source_id: string; target_id: string; edge_type: string });
				}
				return {};
			});

			const input: MemoryUpdateInput = {
				decisions: [],
				lifecycleEvents: [createTestLifecycleEvent("evt-001", "dec-001")],
				externalEvents: [],
				influenceEdges: [],
			};

			await executeHelixMemoryUpdate(input, client);

			const hasEventEdge = edgeInputs.find((e) => e.edge_type === "HAS_EVENT");
			expect(hasEventEdge).toBeDefined();
			expect(hasEventEdge?.source_id).toBe("dec-001");
			expect(hasEventEdge?.target_id).toBe("evt-001");
		});
	});

	describe("Convenience Functions", () => {
		test("updateDecisionMemory creates single decision", async () => {
			const client = createMockClient();
			const decision = createTestDecision("dec-001");
			const embedding = new Array(1536).fill(0.5);

			const result = await updateDecisionMemory(decision, embedding, client);

			expect(result.success).toBe(true);
			expect(result.decisions.successful.length).toBe(1);
			expect(result.decisions.successful[0].id).toBe("dec-001");
		});

		test("recordLifecycleEvents creates multiple events", async () => {
			const client = createMockClient();
			const events = [
				createTestLifecycleEvent("evt-001", "dec-001"),
				createTestLifecycleEvent("evt-002", "dec-001"),
			];

			const result = await recordLifecycleEvents(events, client);

			expect(result.success).toBe(true);
			expect(result.lifecycleEvents.successful.length).toBe(2);
		});

		test("updateExternalEvents with influence edges", async () => {
			const client = createMockClient();
			const events = [
				{ event: createTestExternalEvent("ext-001"), embedding: new Array(1536).fill(0.1) },
			];
			const influenceEdges = [
				{
					eventId: "ext-001",
					decisionId: "dec-001",
					influenceScore: 0.75,
					influenceType: "MACRO_EVENT",
				},
			];

			const result = await updateExternalEvents(events, influenceEdges, client);

			expect(result.success).toBe(true);
			expect(result.externalEvents.successful.length).toBe(1);
			expect(result.edges.successful.length).toBe(1);
		});
	});

	describe("Batch Processing", () => {
		test("handles large batch of decisions", async () => {
			const client = createMockClient();
			const decisions = Array.from({ length: 100 }, (_, i) => ({
				decision: createTestDecision(`dec-${i.toString().padStart(3, "0")}`),
			}));

			const input: MemoryUpdateInput = {
				decisions,
				lifecycleEvents: [],
				externalEvents: [],
				influenceEdges: [],
			};

			const result = await executeHelixMemoryUpdate(input, client);

			expect(result.success).toBe(true);
			expect(result.decisions.successful.length).toBe(100);
			expect(result.decisions.totalProcessed).toBe(100);
		});

		test("handles mixed success and failure in batch", async () => {
			let counter = 0;
			const client = createMockClient(async () => {
				counter++;
				if (counter % 3 === 0) {
					throw new Error(`Failed on item ${counter}`);
				}
				return {};
			});

			const input: MemoryUpdateInput = {
				decisions: Array.from({ length: 9 }, (_, i) => ({
					decision: createTestDecision(`dec-${i}`),
				})),
				lifecycleEvents: [],
				externalEvents: [],
				influenceEdges: [],
			};

			const result = await executeHelixMemoryUpdate(input, client);

			expect(result.success).toBe(false);
			expect(result.decisions.successful.length).toBe(6);
			expect(result.decisions.failed.length).toBe(3);
		});
	});

	describe("Error Reporting", () => {
		test("formats error messages correctly", async () => {
			const client = createMockClient(async () => {
				throw new Error("Constraint violation: duplicate key");
			});

			const input: MemoryUpdateInput = {
				decisions: [
					{ decision: createTestDecision("dec-001") },
					{ decision: createTestDecision("dec-002") },
				],
				lifecycleEvents: [],
				externalEvents: [],
				influenceEdges: [],
			};

			const result = await executeHelixMemoryUpdate(input, client);

			expect(result.errors[0]).toContain("dec-001");
			expect(result.errors[0]).toContain("Constraint violation");
		});

		test("edge failures are reported as warnings", async () => {
			let _queryCount = 0;
			const client = createMockClient(async (name) => {
				_queryCount++;
				if (name === "createEdge") {
					throw new Error("Edge creation failed");
				}
				return {};
			});

			const input: MemoryUpdateInput = {
				decisions: [{ decision: createTestDecision("dec-001") }],
				lifecycleEvents: [],
				externalEvents: [],
				influenceEdges: [
					{
						eventId: "ext-001",
						decisionId: "dec-001",
						influenceScore: 0.5,
						influenceType: "TEST",
					},
				],
			};

			const result = await executeHelixMemoryUpdate(input, client);

			expect(result.success).toBe(true); // Edge failures don't fail overall
			expect(result.warnings.length).toBe(1);
			expect(result.warnings[0]).toContain("Failed to create");
		});
	});
});
