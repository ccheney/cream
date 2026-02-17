import { describe, expect, it } from "bun:test";
import {
	CitationNodeSchema,
	CitesEdgeSchema,
	EMBEDDING_DIMENSION,
	EmbeddingSchema,
	InvalidatesEdgeSchema,
	MemoryNodeSchema,
	SupportsEdgeSchema,
	ThesisNodeSchema,
	TransitionsEdgeSchema,
	VectorSearchQuerySchema,
	validateThesisTransition,
} from "./index.js";

describe("EmbeddingSchema", () => {
	it("accepts valid embedding", () => {
		const embedding = new Array(EMBEDDING_DIMENSION).fill(0.1);
		expect(EmbeddingSchema.safeParse(embedding).success).toBe(true);
	});

	it("rejects wrong dimension", () => {
		expect(EmbeddingSchema.safeParse(new Array(100).fill(0.1)).success).toBe(false);
	});

	it("rejects non-numeric values", () => {
		expect(
			EmbeddingSchema.safeParse(new Array(EMBEDDING_DIMENSION).fill("not a number")).success,
		).toBe(false);
	});
});

describe("MemoryNodeSchema", () => {
	const validMemory = {
		id: "550e8400-e29b-41d4-a716-446655440000",
		content: "AAPL showing strong momentum with RSI above 70",
		embedding: new Array(EMBEDDING_DIMENSION).fill(0.1),
		createdAt: "2026-01-04T12:00:00Z",
		agentType: "technical",
		cycleId: "cycle-001",
		symbol: "AAPL",
	};

	it("accepts valid memory node", () => {
		expect(MemoryNodeSchema.safeParse(validMemory).success).toBe(true);
	});

	it("rejects invalid agent type", () => {
		expect(MemoryNodeSchema.safeParse({ ...validMemory, agentType: "invalid_agent" }).success).toBe(
			false,
		);
	});
});

describe("CitationNodeSchema", () => {
	const validCitation = {
		id: "550e8400-e29b-41d4-a716-446655440000",
		url: "https://www.example.com/article",
		title: "Apple Reports Record Earnings",
		contentSnippet: "Apple Inc. reported record quarterly earnings...",
		relevanceScore: 0.85,
		source: "NEWS_API",
		fetchedAt: "2026-01-04T12:00:00Z",
		sentiment: 0.6,
	};

	it("accepts valid citation", () => {
		expect(CitationNodeSchema.safeParse(validCitation).success).toBe(true);
	});

	it("rejects invalid URL", () => {
		expect(CitationNodeSchema.safeParse({ ...validCitation, url: "not-a-url" }).success).toBe(
			false,
		);
	});

	it("rejects invalid source", () => {
		expect(
			CitationNodeSchema.safeParse({ ...validCitation, source: "INVALID_SOURCE" }).success,
		).toBe(false);
	});
});

describe("ThesisNodeSchema", () => {
	const validThesis = {
		id: "550e8400-e29b-41d4-a716-446655440000",
		symbol: "AAPL",
		narrative:
			"Apple is positioned for growth due to strong iPhone sales and services revenue expansion",
		state: "WATCHING",
		createdAt: "2026-01-04T12:00:00Z",
		updatedAt: "2026-01-04T12:00:00Z",
		entryTrigger: "Break above $155 with volume",
		exitTrigger: "Close below $140",
		invalidation: "Revenue miss by > 10%",
		targetPrice: 175.0,
		stopPrice: 140.0,
		timeHorizon: "2-4 weeks",
		confidence: 0.75,
	};

	it("accepts valid thesis", () => {
		expect(ThesisNodeSchema.safeParse(validThesis).success).toBe(true);
	});

	it("rejects invalid state", () => {
		expect(ThesisNodeSchema.safeParse({ ...validThesis, state: "INVALID_STATE" }).success).toBe(
			false,
		);
	});

	it("rejects short narrative", () => {
		expect(ThesisNodeSchema.safeParse({ ...validThesis, narrative: "Too short" }).success).toBe(
			false,
		);
	});
});

describe("Edge schemas", () => {
	const baseEdge = {
		fromId: "550e8400-e29b-41d4-a716-446655440000",
		toId: "550e8400-e29b-41d4-a716-446655440001",
		createdAt: "2026-01-04T12:00:00Z",
	};

	it("validates CitesEdge", () => {
		expect(CitesEdgeSchema.safeParse({ ...baseEdge, relevanceScore: 0.85 }).success).toBe(true);
	});

	it("validates SupportsEdge", () => {
		expect(
			SupportsEdgeSchema.safeParse({
				...baseEdge,
				confidence: 0.9,
				reasoning: "Strong correlation observed",
			}).success,
		).toBe(true);
	});

	it("validates InvalidatesEdge", () => {
		expect(
			InvalidatesEdgeSchema.safeParse({
				...baseEdge,
				reason: "Revenue missed expectations by 15%",
				severity: "major",
			}).success,
		).toBe(true);
	});

	it("validates TransitionsEdge", () => {
		expect(
			TransitionsEdgeSchema.safeParse({
				...baseEdge,
				fromState: "WATCHING",
				toState: "ENTERED",
				timestamp: "2026-01-04T12:00:00Z",
				reason: "Entry trigger hit",
				triggeredBy: "price_action",
			}).success,
		).toBe(true);
	});
});

describe("validateThesisTransition", () => {
	it("allows expected transitions", () => {
		expect(validateThesisTransition("WATCHING", "ENTERED")).toBe(true);
		expect(validateThesisTransition("WATCHING", "CLOSED")).toBe(true);
		expect(validateThesisTransition("ENTERED", "EXITING")).toBe(true);
		expect(validateThesisTransition("INVALIDATED", "CLOSED")).toBe(true);
	});

	it("disallows invalid transitions", () => {
		expect(validateThesisTransition("CLOSED", "WATCHING")).toBe(false);
		expect(validateThesisTransition("CLOSED", "ENTERED")).toBe(false);
		expect(validateThesisTransition("WATCHING", "MANAGING")).toBe(false);
	});
});

describe("VectorSearchQuerySchema", () => {
	it("accepts valid search query", () => {
		const query = {
			embedding: new Array(EMBEDDING_DIMENSION).fill(0.1),
			topK: 10,
			minSimilarity: 0.7,
			filterAgentTypes: ["technical", "trader"],
			filterSymbols: ["AAPL", "GOOGL"],
		};
		expect(VectorSearchQuerySchema.safeParse(query).success).toBe(true);
	});

	it("applies defaults", () => {
		const result = VectorSearchQuerySchema.parse({
			embedding: new Array(EMBEDDING_DIMENSION).fill(0.1),
		});
		expect(result.topK).toBe(10);
		expect(result.minSimilarity).toBe(0.7);
	});

	it("rejects topK out of range", () => {
		expect(
			VectorSearchQuerySchema.safeParse({
				embedding: new Array(EMBEDDING_DIMENSION).fill(0.1),
				topK: 200,
			}).success,
		).toBe(false);
	});
});
