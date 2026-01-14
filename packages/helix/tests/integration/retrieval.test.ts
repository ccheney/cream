/**
 * HelixDB Retrieval Integration Tests
 *
 * Tests node upsert, retrieval, and vector search functionality.
 *
 * @see docs/plans/14-testing.md lines 174-202
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import type { StartedTestContainer } from "testcontainers";

// ============================================
// Types
// ============================================

/**
 * HelixDB client interface.
 * Will be implemented with actual HelixDB client in Phase 7.
 */
interface HelixClient {
	upsertNode(node: HelixNode): Promise<UpsertResult>;
	getNode(id: string): Promise<HelixNode | null>;
	queryNodes(filter: NodeFilter): Promise<HelixNode[]>;
	vectorSearch(query: VectorQuery): Promise<VectorSearchResult[]>;
	deleteNode(id: string): Promise<boolean>;
	clearAll(): Promise<void>;
}

interface HelixNode {
	id: string;
	type: string;
	properties: Record<string, unknown>;
	embedding?: number[];
}

interface UpsertResult {
	id: string;
	created: boolean;
	updated: boolean;
}

interface NodeFilter {
	type?: string;
	properties?: Record<string, unknown>;
	limit?: number;
}

interface VectorQuery {
	embedding: number[];
	type?: string;
	topK?: number;
	minSimilarity?: number;
}

interface VectorSearchResult {
	node: HelixNode;
	similarity: number;
}

// ============================================
// Test Helpers
// ============================================

/**
 * Creates a sample trade decision node.
 */
function createTradeDecisionNode(
	id: string,
	instrument: string,
	action: string,
	regime: string
): HelixNode {
	return {
		id,
		type: "TradeDecision",
		properties: {
			instrument,
			action,
			regime,
			confidence: 0.78,
			timestamp: new Date().toISOString(),
		},
		embedding: generateMockEmbedding(),
	};
}

/**
 * Generates a mock embedding vector.
 */
function generateMockEmbedding(dimensions = 768): number[] {
	return Array.from({ length: dimensions }, () => Math.random() * 2 - 1);
}

/**
 * Calculates cosine similarity between two vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length !== b.length) {
		return 0;
	}

	let dotProduct = 0;
	let normA = 0;
	let normB = 0;

	for (let i = 0; i < a.length; i++) {
		const aVal = a[i];
		const bVal = b[i];
		if (aVal === undefined || bVal === undefined) {
			continue;
		}
		dotProduct += aVal * bVal;
		normA += aVal * aVal;
		normB += bVal * bVal;
	}

	return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Mock HelixDB client for testing.
 * Will be replaced with actual HelixDB client when available.
 */
function createMockClient(): HelixClient {
	const nodes = new Map<string, HelixNode>();

	return {
		async upsertNode(node: HelixNode): Promise<UpsertResult> {
			const existing = nodes.has(node.id);
			nodes.set(node.id, node);

			return {
				id: node.id,
				created: !existing,
				updated: existing,
			};
		},

		async getNode(id: string): Promise<HelixNode | null> {
			return nodes.get(id) ?? null;
		},

		async queryNodes(filter: NodeFilter): Promise<HelixNode[]> {
			let results = Array.from(nodes.values());

			if (filter.type) {
				results = results.filter((n) => n.type === filter.type);
			}

			if (filter.properties) {
				results = results.filter((n) => {
					for (const [key, value] of Object.entries(filter.properties!)) {
						if (n.properties[key] !== value) {
							return false;
						}
					}
					return true;
				});
			}

			if (filter.limit) {
				results = results.slice(0, filter.limit);
			}

			return results;
		},

		async vectorSearch(query: VectorQuery): Promise<VectorSearchResult[]> {
			let candidates = Array.from(nodes.values());

			if (query.type) {
				candidates = candidates.filter((n) => n.type === query.type);
			}

			const results: VectorSearchResult[] = candidates
				.filter((n) => n.embedding)
				.map((node) => ({
					node,
					similarity: cosineSimilarity(query.embedding, node.embedding!),
				}))
				.filter((r) => r.similarity >= (query.minSimilarity ?? 0))
				.sort((a, b) => b.similarity - a.similarity)
				.slice(0, query.topK ?? 10);

			return results;
		},

		async deleteNode(id: string): Promise<boolean> {
			return nodes.delete(id);
		},

		async clearAll(): Promise<void> {
			nodes.clear();
		},
	};
}

// ============================================
// Integration Tests
// ============================================

describe("HelixDB Integration", () => {
	// biome-ignore lint/style/useConst: Intentionally let for future reassignment when container code is enabled
	let container: StartedTestContainer | null = null;
	let client: HelixClient;

	// NOTE: Container-based tests use mock client until HelixDB Docker image is available.

	beforeAll(async () => {
		void container;
		client = createMockClient();
	});

	afterAll(async () => {
		void container;
	});

	afterEach(async () => {
		// Clear all data between tests
		await client.clearAll();
	});

	describe("Node Operations", () => {
		it("upserts a new node", async () => {
			const node = createTradeDecisionNode("decision-1", "AAPL", "BUY", "BULLISH");

			const result = await client.upsertNode(node);

			expect(result.id).toBe("decision-1");
			expect(result.created).toBe(true);
			expect(result.updated).toBe(false);
		});

		it("updates an existing node", async () => {
			const node = createTradeDecisionNode("decision-2", "MSFT", "BUY", "BULLISH");
			await client.upsertNode(node);

			// Update the node
			node.properties.confidence = 0.85;
			const result = await client.upsertNode(node);

			expect(result.updated).toBe(true);
			expect(result.created).toBe(false);
		});

		it("retrieves a node by ID", async () => {
			const node = createTradeDecisionNode("decision-3", "GOOGL", "SELL", "BEARISH");
			await client.upsertNode(node);

			const retrieved = await client.getNode("decision-3");

			expect(retrieved).not.toBeNull();
			expect(retrieved?.id).toBe("decision-3");
			expect(retrieved?.properties.instrument).toBe("GOOGL");
		});

		it("returns null for non-existent node", async () => {
			const retrieved = await client.getNode("non-existent");

			expect(retrieved).toBeNull();
		});

		it("deletes a node", async () => {
			const node = createTradeDecisionNode("decision-4", "AMZN", "HOLD", "NEUTRAL");
			await client.upsertNode(node);

			const deleted = await client.deleteNode("decision-4");
			const retrieved = await client.getNode("decision-4");

			expect(deleted).toBe(true);
			expect(retrieved).toBeNull();
		});
	});

	describe("Filtered Retrieval", () => {
		beforeEach(async () => {
			// Set up test data
			await client.upsertNode(createTradeDecisionNode("d1", "AAPL", "BUY", "BULLISH"));
			await client.upsertNode(createTradeDecisionNode("d2", "AAPL", "SELL", "BEARISH"));
			await client.upsertNode(createTradeDecisionNode("d3", "MSFT", "BUY", "BULLISH"));
			await client.upsertNode(createTradeDecisionNode("d4", "GOOGL", "HOLD", "NEUTRAL"));
		});

		it("filters by node type", async () => {
			const results = await client.queryNodes({ type: "TradeDecision" });

			expect(results).toHaveLength(4);
		});

		it("filters by instrument", async () => {
			const results = await client.queryNodes({
				type: "TradeDecision",
				properties: { instrument: "AAPL" },
			});

			expect(results).toHaveLength(2);
			expect(results.every((n) => n.properties.instrument === "AAPL")).toBe(true);
		});

		it("filters by regime", async () => {
			const results = await client.queryNodes({
				type: "TradeDecision",
				properties: { regime: "BULLISH" },
			});

			expect(results).toHaveLength(2);
		});

		it("limits results", async () => {
			const results = await client.queryNodes({
				type: "TradeDecision",
				limit: 2,
			});

			expect(results).toHaveLength(2);
		});
	});

	describe("Vector Search", () => {
		beforeEach(async () => {
			// Set up test data with known embeddings
			const baseEmbedding = generateMockEmbedding();

			// Create nodes with similar embeddings
			const node1 = createTradeDecisionNode("v1", "AAPL", "BUY", "BULLISH");
			node1.embedding = baseEmbedding;

			const node2 = createTradeDecisionNode("v2", "MSFT", "BUY", "BULLISH");
			node2.embedding = baseEmbedding.map((v) => v + Math.random() * 0.1); // Slightly different

			const node3 = createTradeDecisionNode("v3", "GOOGL", "SELL", "BEARISH");
			node3.embedding = baseEmbedding.map((v) => -v); // Very different

			await client.upsertNode(node1);
			await client.upsertNode(node2);
			await client.upsertNode(node3);
		});

		it("returns similar nodes", async () => {
			const queryEmbedding = generateMockEmbedding();

			const results = await client.vectorSearch({
				embedding: queryEmbedding,
				topK: 3,
			});

			expect(results.length).toBeGreaterThan(0);
			expect(results[0]?.similarity).toBeDefined();
		});

		it("filters by type in vector search", async () => {
			const queryEmbedding = generateMockEmbedding();

			const results = await client.vectorSearch({
				embedding: queryEmbedding,
				type: "TradeDecision",
				topK: 5,
			});

			expect(results.every((r) => r.node.type === "TradeDecision")).toBe(true);
		});

		it("respects minimum similarity threshold", async () => {
			const queryEmbedding = generateMockEmbedding();

			const results = await client.vectorSearch({
				embedding: queryEmbedding,
				minSimilarity: 0.5,
				topK: 10,
			});

			expect(results.every((r) => r.similarity >= 0.5)).toBe(true);
		});

		it("limits results with topK", async () => {
			const queryEmbedding = generateMockEmbedding();

			const results = await client.vectorSearch({
				embedding: queryEmbedding,
				topK: 1,
			});

			expect(results).toHaveLength(1);
		});

		it("orders results by similarity descending", async () => {
			const queryEmbedding = generateMockEmbedding();

			const results = await client.vectorSearch({
				embedding: queryEmbedding,
				topK: 3,
			});

			for (let i = 1; i < results.length; i++) {
				const prev = results[i - 1];
				const curr = results[i];
				if (prev && curr) {
					expect(prev.similarity).toBeGreaterThanOrEqual(curr.similarity);
				}
			}
		});
	});
});

// Container-based integration tests removed. When helixdb/helix Docker image
// becomes available, add proper testcontainers-based integration tests here.
