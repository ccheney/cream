/**
 * Gemini Embedding Integration Tests
 *
 * These tests require GEMINI_API_KEY to run and make real API calls.
 * Run with: GEMINI_API_KEY=xxx bun test embeddings.integration.test.ts
 *
 * In CI, these are skipped unless GEMINI_API_KEY secret is configured.
 */

import { describe, expect, it } from "bun:test";
import { batchEmbedWithProgress, createEmbeddingClient } from "../src/embeddings";

// ============================================
// Environment Check
// ============================================

const GEMINI_API_KEY = Bun.env.GEMINI_API_KEY;

// ============================================
// Integration Tests
// ============================================

describe.skipIf(!GEMINI_API_KEY)("EmbeddingClient API Integration", () => {
	it("generates single embedding", async () => {
		const client = createEmbeddingClient();
		const result = await client.generateEmbedding("Hello, world!");

		expect(result.values).toBeDefined();
		expect(result.values.length).toBe(3072);
		expect(result.model).toBe("gemini-embedding-001");
		expect(result.generatedAt).toBeDefined();
		expect(result.inputLength).toBe(13);
	});

	it("generates batch embeddings", async () => {
		const client = createEmbeddingClient();
		const texts = ["First text to embed", "Second text to embed", "Third text to embed"];

		const result = await client.batchGenerateEmbeddings(texts);

		expect(result.embeddings.length).toBe(3);
		expect(result.apiCalls).toBe(1);
		expect(result.processingTimeMs).toBeGreaterThan(0);

		for (const embedding of result.embeddings) {
			expect(embedding.values.length).toBe(3072);
		}
	});

	it("handles empty batch", async () => {
		const client = createEmbeddingClient();
		const result = await client.batchGenerateEmbeddings([]);

		expect(result.embeddings.length).toBe(0);
		expect(result.apiCalls).toBe(0);
	});

	it("batchEmbedWithProgress reports progress", async () => {
		const client = createEmbeddingClient();
		const texts = ["Text 1", "Text 2", "Text 3"];
		const progressUpdates: { processed: number; total: number }[] = [];

		const result = await batchEmbedWithProgress(client, texts, {
			onProgress: (processed, total) => {
				progressUpdates.push({ processed, total });
			},
		});

		expect(result.embeddings.length).toBe(3);
		expect(progressUpdates.length).toBeGreaterThan(0);
		expect(progressUpdates.at(-1)?.processed).toBe(3);
	});
});
