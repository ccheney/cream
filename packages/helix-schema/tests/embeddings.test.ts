/**
 * Gemini Embedding Unit Tests
 *
 * Tests for embedding configuration, utilities, and client setup.
 * API integration tests are in embeddings.integration.test.ts.
 */

import { describe, expect, it } from "bun:test";
import {
  createEmbeddingClient,
  createEmbeddingMetadata,
  DEFAULT_EMBEDDING_CONFIG,
  EMBEDDABLE_FIELDS,
  EMBEDDING_MODELS,
  EmbeddingClient,
  type EmbeddingMetadata,
  extractEmbeddableText,
  isEmbeddingStale,
  needsReembedding,
} from "../src/embeddings";

// ============================================
// Configuration Tests
// ============================================

describe("Embedding Configuration", () => {
  it("has correct default config for gemini-embedding-001", () => {
    expect(DEFAULT_EMBEDDING_CONFIG.provider).toBe("gemini");
    expect(DEFAULT_EMBEDDING_CONFIG.model).toBe("gemini-embedding-001");
    expect(DEFAULT_EMBEDDING_CONFIG.dimensions).toBe(3072);
    expect(DEFAULT_EMBEDDING_CONFIG.batchSize).toBe(100);
    expect(DEFAULT_EMBEDDING_CONFIG.maxTokens).toBe(2048);
    expect(DEFAULT_EMBEDDING_CONFIG.apiKeyEnvVar).toBe("GEMINI_API_KEY");
  });

  it("defines alternative embedding models", () => {
    expect(EMBEDDING_MODELS["gemini-embedding-001"]).toBeDefined();
    expect(EMBEDDING_MODELS["text-embedding-004"]).toBeDefined();
    expect(EMBEDDING_MODELS["text-embedding-3-large"]).toBeDefined();
    expect(EMBEDDING_MODELS["text-embedding-3-small"]).toBeDefined();
  });

  it("text-embedding-004 has 768 dimensions", () => {
    expect(EMBEDDING_MODELS["text-embedding-004"].dimensions).toBe(768);
  });
});

// ============================================
// Embeddable Fields Tests
// ============================================

describe("Embeddable Fields", () => {
  it("TradeDecision has rationale_text", () => {
    expect(EMBEDDABLE_FIELDS.TradeDecision).toEqual(["rationale_text"]);
  });

  it("ExternalEvent has text_summary", () => {
    expect(EMBEDDABLE_FIELDS.ExternalEvent).toEqual(["text_summary"]);
  });

  it("FilingChunk has chunk_text", () => {
    expect(EMBEDDABLE_FIELDS.FilingChunk).toEqual(["chunk_text"]);
  });

  it("TranscriptChunk has chunk_text", () => {
    expect(EMBEDDABLE_FIELDS.TranscriptChunk).toEqual(["chunk_text"]);
  });

  it("NewsItem has headline and body_text", () => {
    expect(EMBEDDABLE_FIELDS.NewsItem).toEqual(["headline", "body_text"]);
  });
});

// ============================================
// Text Extraction Tests
// ============================================

describe("extractEmbeddableText", () => {
  it("extracts single field from TradeDecision", () => {
    const node = {
      decision_id: "td-001",
      rationale_text: "Strong momentum with volume confirmation",
    };

    const text = extractEmbeddableText("TradeDecision", node);
    expect(text).toBe("Strong momentum with volume confirmation");
  });

  it("extracts multiple fields from NewsItem", () => {
    const node = {
      item_id: "ni-001",
      headline: "Apple Announces New Product",
      body_text: "Apple Inc. today announced a new product line...",
    };

    const text = extractEmbeddableText("NewsItem", node);
    expect(text).toBe(
      "Apple Announces New Product\n\nApple Inc. today announced a new product line..."
    );
  });

  it("skips empty fields", () => {
    const node = {
      headline: "Headline Only",
      body_text: "",
    };

    const text = extractEmbeddableText("NewsItem", node);
    expect(text).toBe("Headline Only");
  });

  it("skips whitespace-only fields", () => {
    const node = {
      headline: "Headline Only",
      body_text: "   \n\t   ",
    };

    const text = extractEmbeddableText("NewsItem", node);
    expect(text).toBe("Headline Only");
  });

  it("returns empty string for unknown node type", () => {
    const node = { foo: "bar" };
    const text = extractEmbeddableText("UnknownType", node);
    expect(text).toBe("");
  });

  it("allows custom fields override", () => {
    const node = {
      custom_field: "Custom text",
      rationale_text: "Default text",
    };

    const text = extractEmbeddableText("TradeDecision", node, ["custom_field"]);
    expect(text).toBe("Custom text");
  });
});

// ============================================
// Stale Detection Tests
// ============================================

describe("isEmbeddingStale", () => {
  it("returns false for recent embedding", () => {
    const metadata: EmbeddingMetadata = {
      model: "gemini-embedding-001",
      generatedAt: new Date().toISOString(),
    };

    expect(isEmbeddingStale(metadata)).toBe(false);
  });

  it("returns true for 100-day old embedding", () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 100);

    const metadata: EmbeddingMetadata = {
      model: "gemini-embedding-001",
      generatedAt: oldDate.toISOString(),
    };

    expect(isEmbeddingStale(metadata)).toBe(true);
  });

  it("returns false for 89-day old embedding (default 90 day threshold)", () => {
    const date89DaysAgo = new Date();
    date89DaysAgo.setDate(date89DaysAgo.getDate() - 89);

    const metadata: EmbeddingMetadata = {
      model: "gemini-embedding-001",
      generatedAt: date89DaysAgo.toISOString(),
    };

    expect(isEmbeddingStale(metadata)).toBe(false);
  });

  it("respects custom stale threshold", () => {
    const date30DaysAgo = new Date();
    date30DaysAgo.setDate(date30DaysAgo.getDate() - 30);

    const metadata: EmbeddingMetadata = {
      model: "gemini-embedding-001",
      generatedAt: date30DaysAgo.toISOString(),
    };

    // Not stale at 90 days
    expect(isEmbeddingStale(metadata, 90)).toBe(false);

    // Stale at 25 days
    expect(isEmbeddingStale(metadata, 25)).toBe(true);
  });
});

// ============================================
// Metadata Tests
// ============================================

describe("createEmbeddingMetadata", () => {
  it("creates metadata with model and timestamp", () => {
    const beforeTime = new Date().toISOString();
    const metadata = createEmbeddingMetadata("gemini-embedding-001");
    const afterTime = new Date().toISOString();

    expect(metadata.model).toBe("gemini-embedding-001");
    expect(metadata.generatedAt >= beforeTime).toBe(true);
    expect(metadata.generatedAt <= afterTime).toBe(true);
  });
});

// ============================================
// Re-embedding Logic Tests
// ============================================

describe("needsReembedding", () => {
  it("returns true when no metadata exists", () => {
    expect(needsReembedding(undefined, "gemini-embedding-001")).toBe(true);
  });

  it("returns true when model changed", () => {
    const metadata: EmbeddingMetadata = {
      model: "old-model",
      generatedAt: new Date().toISOString(),
    };

    expect(needsReembedding(metadata, "gemini-embedding-001")).toBe(true);
  });

  it("returns false when model matches and not stale", () => {
    const metadata: EmbeddingMetadata = {
      model: "gemini-embedding-001",
      generatedAt: new Date().toISOString(),
    };

    expect(needsReembedding(metadata, "gemini-embedding-001")).toBe(false);
  });

  it("returns true when embedding is stale", () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 100);

    const metadata: EmbeddingMetadata = {
      model: "gemini-embedding-001",
      generatedAt: oldDate.toISOString(),
    };

    expect(needsReembedding(metadata, "gemini-embedding-001")).toBe(true);
  });

  it("respects custom stale threshold", () => {
    const date30DaysAgo = new Date();
    date30DaysAgo.setDate(date30DaysAgo.getDate() - 30);

    const metadata: EmbeddingMetadata = {
      model: "gemini-embedding-001",
      generatedAt: date30DaysAgo.toISOString(),
    };

    // Not stale at 90 days
    expect(needsReembedding(metadata, "gemini-embedding-001", 90)).toBe(false);

    // Stale at 25 days
    expect(needsReembedding(metadata, "gemini-embedding-001", 25)).toBe(true);
  });
});

// ============================================
// Client Construction Tests
// ============================================

describe("EmbeddingClient construction", () => {
  it("throws when API key is missing", () => {
    // Save current env
    const savedKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    try {
      expect(() => new EmbeddingClient()).toThrow("Missing API key");
    } finally {
      // Restore env
      if (savedKey) {
        process.env.GEMINI_API_KEY = savedKey;
      }
    }
  });

  it("getConfig returns config copy", () => {
    // Skip if no API key
    if (!process.env.GEMINI_API_KEY) {
      return;
    }

    const client = new EmbeddingClient();
    const config = client.getConfig();

    expect(config.model).toBe("gemini-embedding-001");
    expect(config.dimensions).toBe(3072);
  });
});

// ============================================
// Factory Function Tests
// ============================================

describe("createEmbeddingClient", () => {
  it("creates client with default config", () => {
    // Skip if no API key
    if (!process.env.GEMINI_API_KEY) {
      return;
    }

    const client = createEmbeddingClient();
    const config = client.getConfig();
    expect(config.model).toBe("gemini-embedding-001");
  });

  it("creates client with specified model", () => {
    // Skip if no API key
    if (!process.env.GEMINI_API_KEY) {
      return;
    }

    const client = createEmbeddingClient("text-embedding-004");
    const config = client.getConfig();
    expect(config.model).toBe("text-embedding-004");
    expect(config.dimensions).toBe(768);
  });
});

// ============================================
// Integration Tests
// ============================================
// API integration tests are in embeddings.integration.test.ts
// Run with: GEMINI_API_KEY=xxx bun test embeddings.integration.test.ts
