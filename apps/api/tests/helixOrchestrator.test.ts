/**
 * HelixDB Orchestrator Tests
 */

import { describe, expect, mock, test } from "bun:test";
import type { HealthCheckResult, HelixClient } from "@cream/helix";
import type { TradeDecision, TradeLifecycleEvent } from "@cream/helix-schema";
import type { TradeDecisionInput } from "../workflows/steps/helixMemoryUpdate";
import {
	createDisabledOrchestrator,
	createHelixOrchestrator,
	DEFAULT_ORCHESTRATOR_CONFIG,
	HelixOrchestrator,
	type HelixOrchestratorConfig,
	toMemoryUpdateInput,
	toRetrievalInput,
} from "../workflows/steps/helixOrchestrator";
import type { RetrievalInput } from "../workflows/steps/helixRetrieval";

// ============================================
// Test Fixtures
// ============================================

function createMockClient(
	options: {
		queryFn?: (name: string, params?: Record<string, unknown>) => Promise<unknown>;
		healthCheckFn?: () => Promise<HealthCheckResult>;
	} = {},
): HelixClient {
	return {
		query: mock(
			options.queryFn ??
				(async () => ({
					data: [],
					executionTimeMs: 1,
				})),
		),
		isConnected: () => true,
		healthCheck: mock(
			options.healthCheckFn ??
				(async () => ({
					healthy: true,
					latencyMs: 5,
				})),
		),
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

function createTestLifecycleEvent(
	id: string,
	decisionId: string,
	eventType: "FILL" | "CANCEL" | "CLOSE" = "FILL",
): TradeLifecycleEvent {
	return {
		event_id: id,
		decision_id: decisionId,
		event_type: eventType,
		event_data: JSON.stringify({ qty: 100, price: 150.0 }),
		created_at: new Date().toISOString(),
	};
}

function createQueryEmbedding(): number[] {
	return new Array(1536).fill(0.1);
}

// ============================================
// Tests
// ============================================

describe("HelixOrchestrator", () => {
	describe("createHelixOrchestrator", () => {
		test("creates orchestrator with default config", () => {
			const client = createMockClient();
			const orchestrator = createHelixOrchestrator(client);

			expect(orchestrator.isEnabled()).toBe(true);
			expect(orchestrator.getConfig()).toEqual(DEFAULT_ORCHESTRATOR_CONFIG);
		});

		test("creates orchestrator with custom config", () => {
			const client = createMockClient();
			const config: Partial<HelixOrchestratorConfig> = {
				enabled: true,
				retrievalEnabled: false,
				memoryUpdateEnabled: true,
				fallbackOnError: false,
				performanceTargets: {
					retrievalMaxMs: 100,
					updateMaxMs: 200,
					lifecycleMaxMs: 100,
				},
			};

			const orchestrator = createHelixOrchestrator(client, config);
			const resultConfig = orchestrator.getConfig();

			expect(resultConfig.retrievalEnabled).toBe(false);
			expect(resultConfig.memoryUpdateEnabled).toBe(true);
			expect(resultConfig.fallbackOnError).toBe(false);
			expect(resultConfig.performanceTargets.retrievalMaxMs).toBe(100);
		});

		test("merges partial performance targets with defaults", () => {
			const client = createMockClient();
			const config: Partial<HelixOrchestratorConfig> = {
				performanceTargets: {
					retrievalMaxMs: 100,
					updateMaxMs: DEFAULT_ORCHESTRATOR_CONFIG.performanceTargets.updateMaxMs,
					lifecycleMaxMs: DEFAULT_ORCHESTRATOR_CONFIG.performanceTargets.lifecycleMaxMs,
				},
			};

			const orchestrator = createHelixOrchestrator(client, config);
			const resultConfig = orchestrator.getConfig();

			expect(resultConfig.performanceTargets.retrievalMaxMs).toBe(100);
			expect(resultConfig.performanceTargets.updateMaxMs).toBe(
				DEFAULT_ORCHESTRATOR_CONFIG.performanceTargets.updateMaxMs,
			);
		});
	});

	describe("createDisabledOrchestrator", () => {
		test("creates disabled orchestrator", () => {
			const client = createMockClient();
			const orchestrator = createDisabledOrchestrator(client);

			expect(orchestrator.isEnabled()).toBe(false);
			expect(orchestrator.getConfig().enabled).toBe(false);
			expect(orchestrator.getConfig().retrievalEnabled).toBe(false);
			expect(orchestrator.getConfig().memoryUpdateEnabled).toBe(false);
		});
	});

	describe("orient (retrieval)", () => {
		test("returns fallback when retrieval disabled", async () => {
			const client = createMockClient();
			const orchestrator = createHelixOrchestrator(client, {
				retrievalEnabled: false,
			});

			const input: RetrievalInput = {
				queryEmbedding: createQueryEmbedding(),
				instrumentId: "AAPL",
			};

			const result = await orchestrator.orient(input);

			expect(result.success).toBe(true);
			expect(result.usedFallback).toBe(true);
			expect(result.executionMs).toBe(0);
			expect(result.data?.decisions).toEqual([]);
			expect(result.data?.emptyReason).toContain("disabled");
		});

		test("returns fallback when all operations disabled", async () => {
			const client = createMockClient();
			const orchestrator = createHelixOrchestrator(client, {
				enabled: false,
			});

			const input: RetrievalInput = {
				queryEmbedding: createQueryEmbedding(),
			};

			const result = await orchestrator.orient(input);

			expect(result.success).toBe(true);
			expect(result.usedFallback).toBe(true);
		});

		test("executes retrieval and tracks metrics", async () => {
			const decision = createTestDecision("dec-001");
			const client = createMockClient({
				queryFn: async (name) => {
					if (name === "vectorSearch") {
						return {
							data: [
								{
									id: "dec-001",
									type: "TradeDecision",
									properties: decision,
									similarity: 0.9,
								},
							],
							executionTimeMs: 2,
						};
					}
					return { data: [], executionTimeMs: 1 };
				},
			});

			const orchestrator = createHelixOrchestrator(client);

			const input: RetrievalInput = {
				queryEmbedding: createQueryEmbedding(),
				instrumentId: "AAPL",
			};

			const result = await orchestrator.orient(input);

			expect(result.success).toBe(true);
			expect(result.usedFallback).toBe(false);
			expect(result.executionMs).toBeGreaterThan(0);
			expect(result.data?.decisions.length).toBeGreaterThanOrEqual(0);

			const metrics = orchestrator.getMetrics();
			expect(metrics.retrievalCount).toBe(1);
			expect(metrics.retrievalTotalMs).toBeGreaterThan(0);
		});

		test("tracks slow retrievals", async () => {
			const client = createMockClient({
				queryFn: async () => {
					// Simulate slow query
					await new Promise((r) => setTimeout(r, 60));
					return { data: [], executionTimeMs: 60 };
				},
			});

			const orchestrator = createHelixOrchestrator(client, {
				performanceTargets: {
					retrievalMaxMs: 50,
					updateMaxMs: 100,
					lifecycleMaxMs: 50,
				},
			});

			const input: RetrievalInput = {
				queryEmbedding: createQueryEmbedding(),
			};

			const result = await orchestrator.orient(input);

			expect(result.exceededTarget).toBe(true);
			expect(orchestrator.getMetrics().retrievalSlowCount).toBe(1);
		});

		test("uses fallback on error when configured", async () => {
			// The underlying executeHelixRetrieval catches errors and returns success: false
			// So we mock a query that throws, which will result in success: false from retrieval
			const client = createMockClient({
				queryFn: async () => {
					throw new Error("Database connection failed");
				},
			});

			const orchestrator = createHelixOrchestrator(client, {
				fallbackOnError: true,
			});

			const input: RetrievalInput = {
				queryEmbedding: createQueryEmbedding(),
			};

			const result = await orchestrator.orient(input);

			// Orchestrator sees success: false from retrieval and uses fallback
			expect(result.success).toBe(true);
			expect(result.usedFallback).toBe(true);
			expect(orchestrator.getMetrics().fallbackCount).toBe(1);
		});

		test("propagates error when fallback disabled", async () => {
			// The underlying executeHelixRetrieval catches errors and returns success: false
			const client = createMockClient({
				queryFn: async () => {
					throw new Error("Database connection failed");
				},
			});

			const orchestrator = createHelixOrchestrator(client, {
				fallbackOnError: false,
			});

			const input: RetrievalInput = {
				queryEmbedding: createQueryEmbedding(),
			};

			const result = await orchestrator.orient(input);

			// Orchestrator sees success: false and propagates the error
			expect(result.success).toBe(false);
			expect(result.usedFallback).toBe(false);
			// The error message comes from emptyReason in the retrieval result
			expect(result.error).toBeDefined();
			expect(result.error).toContain("Database connection failed");
		});
	});

	describe("act (memory update)", () => {
		test("returns fallback when memory update disabled", async () => {
			const client = createMockClient();
			const orchestrator = createHelixOrchestrator(client, {
				memoryUpdateEnabled: false,
			});

			const result = await orchestrator.act({
				decisions: [],
				lifecycleEvents: [],
				externalEvents: [],
				influenceEdges: [],
			});

			expect(result.success).toBe(true);
			expect(result.usedFallback).toBe(true);
			expect(result.data?.warnings).toContain("HelixDB memory update disabled or in fallback mode");
		});

		test("executes memory update and tracks metrics", async () => {
			const client = createMockClient();
			const orchestrator = createHelixOrchestrator(client);

			const decision = createTestDecision("dec-001");
			const decisionInput: TradeDecisionInput = {
				decision,
				embedding: createQueryEmbedding(),
			};

			const result = await orchestrator.act({
				decisions: [decisionInput],
				lifecycleEvents: [],
				externalEvents: [],
				influenceEdges: [],
			});

			expect(result.success).toBe(true);
			expect(result.usedFallback).toBe(false);
			expect(result.executionMs).toBeGreaterThan(0);

			const metrics = orchestrator.getMetrics();
			expect(metrics.updateCount).toBe(1);
			expect(metrics.updateTotalMs).toBeGreaterThan(0);
		});

		test("uses fallback on error when configured", async () => {
			// The underlying executeHelixMemoryUpdate catches errors and returns success: false
			const client = createMockClient({
				queryFn: async () => {
					throw new Error("Update failed");
				},
			});

			const orchestrator = createHelixOrchestrator(client, {
				fallbackOnError: true,
			});

			// Need to pass actual decision data to trigger the update path that can fail
			const decision = createTestDecision("dec-001");
			const result = await orchestrator.act({
				decisions: [{ decision, embedding: createQueryEmbedding() }],
				lifecycleEvents: [],
				externalEvents: [],
				influenceEdges: [],
			});

			// Orchestrator sees success: false from update and uses fallback
			expect(result.success).toBe(true);
			expect(result.usedFallback).toBe(true);
			expect(orchestrator.getMetrics().fallbackCount).toBe(1);
		});
	});

	describe("recordLifecycle", () => {
		test("returns early for empty events", async () => {
			const client = createMockClient();
			const orchestrator = createHelixOrchestrator(client);

			const result = await orchestrator.recordLifecycle([]);

			expect(result.success).toBe(true);
			expect(result.usedFallback).toBe(false);
			expect(result.executionMs).toBe(0);
			expect(orchestrator.getMetrics().lifecycleCount).toBe(0);
		});

		test("records lifecycle events and tracks metrics", async () => {
			const client = createMockClient();
			const orchestrator = createHelixOrchestrator(client);

			const events = [
				createTestLifecycleEvent("evt-001", "dec-001", "FILL"),
				createTestLifecycleEvent("evt-002", "dec-002", "CLOSE"),
			];

			const result = await orchestrator.recordLifecycle(events);

			expect(result.success).toBe(true);
			expect(result.usedFallback).toBe(false);

			const metrics = orchestrator.getMetrics();
			expect(metrics.lifecycleCount).toBe(1);
			expect(metrics.lifecycleTotalMs).toBeGreaterThan(0);
		});

		test("returns fallback when disabled", async () => {
			const client = createMockClient();
			const orchestrator = createHelixOrchestrator(client, {
				memoryUpdateEnabled: false,
			});

			const events = [createTestLifecycleEvent("evt-001", "dec-001")];

			const result = await orchestrator.recordLifecycle(events);

			expect(result.success).toBe(true);
			expect(result.usedFallback).toBe(true);
		});
	});

	describe("health", () => {
		test("performs health check and updates metrics", async () => {
			const client = createMockClient({
				healthCheckFn: async () => ({
					healthy: true,
					latencyMs: 10,
				}),
			});

			const orchestrator = createHelixOrchestrator(client);

			const result = await orchestrator.health();

			expect(result.healthy).toBe(true);
			expect(result.latencyMs).toBe(10);

			const metrics = orchestrator.getMetrics();
			expect(metrics.lastHealthCheck).not.toBeNull();
			expect(metrics.lastHealthCheck?.healthy).toBe(true);
			expect(metrics.lastHealthCheckAt).not.toBeNull();
		});

		test("reports unhealthy status", async () => {
			const client = createMockClient({
				healthCheckFn: async () => ({
					healthy: false,
					latencyMs: 5000,
					error: "Connection timeout",
				}),
			});

			const orchestrator = createHelixOrchestrator(client);

			const result = await orchestrator.health();

			expect(result.healthy).toBe(false);
			expect(result.error).toContain("Connection timeout");
		});
	});

	describe("metrics and monitoring", () => {
		test("getMetrics returns current metrics", async () => {
			const client = createMockClient();
			const orchestrator = createHelixOrchestrator(client);

			// Perform some operations
			await orchestrator.orient({ queryEmbedding: createQueryEmbedding() });
			await orchestrator.act({
				decisions: [],
				lifecycleEvents: [],
				externalEvents: [],
				influenceEdges: [],
			});

			const metrics = orchestrator.getMetrics();

			expect(metrics.retrievalCount).toBe(1);
			expect(metrics.updateCount).toBe(1);
			expect(metrics.fallbackCount).toBe(0);
		});

		test("getSummary returns aggregated statistics", async () => {
			const client = createMockClient();
			const orchestrator = createHelixOrchestrator(client);

			// Perform operations
			await orchestrator.orient({ queryEmbedding: createQueryEmbedding() });
			await orchestrator.orient({ queryEmbedding: createQueryEmbedding() });
			await orchestrator.act({
				decisions: [],
				lifecycleEvents: [],
				externalEvents: [],
				influenceEdges: [],
			});
			await orchestrator.health();

			const summary = orchestrator.getSummary();

			expect(summary.enabled).toBe(true);
			expect(summary.retrievalEnabled).toBe(true);
			expect(summary.memoryUpdateEnabled).toBe(true);
			expect(summary.retrievalSuccessRate).toBeGreaterThan(0);
			expect(summary.updateSuccessRate).toBeGreaterThan(0);
			expect(summary.avgRetrievalMs).toBeGreaterThanOrEqual(0);
			expect(summary.avgUpdateMs).toBeGreaterThanOrEqual(0);
			expect(summary.fallbackRate).toBe(0);
			expect(summary.healthy).toBe(true);
		});

		test("resetMetrics clears all metrics", async () => {
			const client = createMockClient();
			const orchestrator = createHelixOrchestrator(client);

			// Perform operations
			await orchestrator.orient({ queryEmbedding: createQueryEmbedding() });
			await orchestrator.act({
				decisions: [],
				lifecycleEvents: [],
				externalEvents: [],
				influenceEdges: [],
			});

			// Reset
			orchestrator.resetMetrics();

			const metrics = orchestrator.getMetrics();
			expect(metrics.retrievalCount).toBe(0);
			expect(metrics.updateCount).toBe(0);
			expect(metrics.lastHealthCheck).toBeNull();
		});

		test("isEnabled returns false when all operations disabled", () => {
			const client = createMockClient();

			const disabledOrchestrator = createHelixOrchestrator(client, {
				enabled: true,
				retrievalEnabled: false,
				memoryUpdateEnabled: false,
			});

			expect(disabledOrchestrator.isEnabled()).toBe(false);

			const masterDisabled = createHelixOrchestrator(client, {
				enabled: false,
			});

			expect(masterDisabled.isEnabled()).toBe(false);
		});

		test("isEnabled returns true when at least one operation enabled", () => {
			const client = createMockClient();

			const retrievalOnly = createHelixOrchestrator(client, {
				retrievalEnabled: true,
				memoryUpdateEnabled: false,
			});

			expect(retrievalOnly.isEnabled()).toBe(true);

			const updateOnly = createHelixOrchestrator(client, {
				retrievalEnabled: false,
				memoryUpdateEnabled: true,
			});

			expect(updateOnly.isEnabled()).toBe(true);
		});
	});

	describe("convenience functions", () => {
		test("toRetrievalInput converts OrientContext", () => {
			const ctx = {
				queryEmbedding: createQueryEmbedding(),
				symbol: "AAPL",
				regime: "BULL_TREND",
				topK: 5,
			};

			const input = toRetrievalInput(ctx);

			expect(input.queryEmbedding).toEqual(ctx.queryEmbedding);
			expect(input.instrumentId).toBe("AAPL");
			expect(input.underlyingSymbol).toBe("AAPL");
			expect(input.regime).toBe("BULL_TREND");
		});

		test("toMemoryUpdateInput converts ActContext", () => {
			const decision = createTestDecision("dec-001");
			const ctx = {
				decisions: [{ decision, embedding: createQueryEmbedding() }],
				externalEvents: [],
				influenceEdges: [],
			};

			const input = toMemoryUpdateInput(ctx);

			expect(input.decisions.length).toBe(1);
			expect(input.decisions[0].decision.decision_id).toBe("dec-001");
			expect(input.lifecycleEvents).toEqual([]);
			expect(input.externalEvents).toEqual([]);
		});

		test("toMemoryUpdateInput handles undefined optional fields", () => {
			const decision = createTestDecision("dec-001");
			const ctx = {
				decisions: [{ decision }],
			};

			const input = toMemoryUpdateInput(ctx);

			expect(input.externalEvents).toEqual([]);
			expect(input.influenceEdges).toEqual([]);
		});
	});

	describe("HelixOrchestrator class", () => {
		test("can be instantiated directly", () => {
			const client = createMockClient();
			const orchestrator = new HelixOrchestrator(client);

			expect(orchestrator.isEnabled()).toBe(true);
			expect(orchestrator.getConfig()).toEqual(DEFAULT_ORCHESTRATOR_CONFIG);
		});

		test("accepts custom config in constructor", () => {
			const client = createMockClient();
			const config: HelixOrchestratorConfig = {
				enabled: true,
				retrievalEnabled: false,
				memoryUpdateEnabled: true,
				fallbackOnError: true,
				performanceTargets: {
					retrievalMaxMs: 100,
					updateMaxMs: 200,
					lifecycleMaxMs: 75,
				},
			};

			const orchestrator = new HelixOrchestrator(client, config);

			expect(orchestrator.getConfig()).toEqual(config);
		});
	});

	describe("default config", () => {
		test("DEFAULT_ORCHESTRATOR_CONFIG has expected values", () => {
			expect(DEFAULT_ORCHESTRATOR_CONFIG.enabled).toBe(true);
			expect(DEFAULT_ORCHESTRATOR_CONFIG.retrievalEnabled).toBe(true);
			expect(DEFAULT_ORCHESTRATOR_CONFIG.memoryUpdateEnabled).toBe(true);
			expect(DEFAULT_ORCHESTRATOR_CONFIG.fallbackOnError).toBe(true);
			expect(DEFAULT_ORCHESTRATOR_CONFIG.performanceTargets.retrievalMaxMs).toBe(50);
			expect(DEFAULT_ORCHESTRATOR_CONFIG.performanceTargets.updateMaxMs).toBe(100);
			expect(DEFAULT_ORCHESTRATOR_CONFIG.performanceTargets.lifecycleMaxMs).toBe(50);
		});
	});
});
