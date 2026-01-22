/**
 * Sentiment Aggregation Batch Job Tests
 *
 * Tests for sentiment data aggregation and processing.
 */

import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { CreateSentimentInput, SentimentRepository } from "@cream/storage";
import {
	aggregateSentimentScores,
	calculateRecencyWeight,
	calculateSentimentMomentum,
	calculateSentimentStrength,
	computeSentimentScore,
	detectEventRisk,
	type ExtractedSentiment,
	SentimentAggregationJob,
	type SentimentDataProvider,
} from "./sentiment-batch.js";

// ============================================
// Test Helpers
// ============================================

function createMockSentiment(overrides: Partial<ExtractedSentiment> = {}): ExtractedSentiment {
	return {
		symbol: "AAPL",
		sourceType: "news",
		sentiment: "bullish",
		confidence: 0.8,
		eventTime: new Date("2024-01-15T12:00:00Z"),
		importance: 3,
		...overrides,
	};
}

function createMockDataProvider(
	sentimentData: ExtractedSentiment[] = [],
	historicalData: Array<{ date: string; score: number }> = [],
): SentimentDataProvider {
	return {
		getSentimentData: mock(() => Promise.resolve(sentimentData)),
		getHistoricalSentiment: mock(() => Promise.resolve(historicalData)),
	};
}

// Mock repository type for testing - extends SentimentRepository with tracking
type MockSentimentRepository = SentimentRepository & {
	upsertCalls: CreateSentimentInput[];
};

function createMockRepository(): MockSentimentRepository {
	const upsertCalls: CreateSentimentInput[] = [];
	const mockRepo = {
		upsertCalls,
		upsert: mock((input: CreateSentimentInput) => {
			upsertCalls.push(input);
			return Promise.resolve({
				id: `sent_${Date.now()}_mock`,
				symbol: input.symbol,
				date: input.date,
				sentimentScore: input.sentimentScore ?? null,
				sentimentStrength: input.sentimentStrength ?? null,
				newsVolume: input.newsVolume ?? null,
				sentimentMomentum: input.sentimentMomentum ?? null,
				eventRiskFlag: input.eventRiskFlag ?? false,
				newsSentiment: input.newsSentiment ?? null,
				socialSentiment: input.socialSentiment ?? null,
				analystSentiment: input.analystSentiment ?? null,
				computedAt: new Date().toISOString(),
			});
		}),
		create: mock(() => Promise.resolve({} as never)),
		bulkUpsert: mock(() => Promise.resolve(0)),
		findById: mock(() => Promise.resolve(null)),
		findBySymbolAndDate: mock(() => Promise.resolve(null)),
		findLatestBySymbol: mock(() => Promise.resolve(null)),
		findBySymbol: mock(() => Promise.resolve([])),
		findWithFilters: mock(() =>
			Promise.resolve({
				data: [],
				total: 0,
				page: 1,
				pageSize: 10,
				totalPages: 0,
				hasNext: false,
				hasPrev: false,
			}),
		),
		findMostPositive: mock(() => Promise.resolve([])),
		findMostNegative: mock(() => Promise.resolve([])),
		findWithEventRisk: mock(() => Promise.resolve([])),
		update: mock(() => Promise.resolve(null)),
		delete: mock(() => Promise.resolve(false)),
		deleteOlderThan: mock(() => Promise.resolve(0)),
		count: mock(() => Promise.resolve(0)),
	};
	// Cast to SentimentRepository to bypass private client property check
	return mockRepo as unknown as MockSentimentRepository;
}

// ============================================
// Calculation Function Tests
// ============================================

describe("computeSentimentScore", () => {
	it("returns positive score for bullish sentiment", () => {
		const result = computeSentimentScore("bullish", 1.0);
		expect(result).toBe(0.8);
	});

	it("returns negative score for bearish sentiment", () => {
		const result = computeSentimentScore("bearish", 1.0);
		expect(result).toBe(-0.8);
	});

	it("returns zero for neutral sentiment", () => {
		const result = computeSentimentScore("neutral", 1.0);
		expect(result).toBe(0);
	});

	it("applies confidence weighting by default", () => {
		const result = computeSentimentScore("bullish", 0.5);
		expect(result).toBe(0.4); // 0.8 * 0.5
	});

	it("can disable confidence weighting", () => {
		const result = computeSentimentScore("bullish", 0.5, { applyConfidence: false });
		expect(result).toBe(0.8);
	});

	it("respects custom base scores", () => {
		const result = computeSentimentScore("bullish", 1.0, { bullishBase: 1.0 });
		expect(result).toBe(1.0);
	});
});

describe("calculateRecencyWeight", () => {
	it("returns 1.0 for same-time events", () => {
		const eventTime = new Date("2024-01-15T12:00:00Z");
		const referenceTime = new Date("2024-01-15T12:00:00Z");
		const result = calculateRecencyWeight(eventTime, referenceTime);
		expect(result).toBe(1.0);
	});

	it("returns 0.5 for events at half-life", () => {
		const eventTime = new Date("2024-01-14T12:00:00Z");
		const referenceTime = new Date("2024-01-15T12:00:00Z");
		const result = calculateRecencyWeight(eventTime, referenceTime, 24);
		expect(result).toBeCloseTo(0.5, 5);
	});

	it("decays exponentially with time", () => {
		const eventTime = new Date("2024-01-13T12:00:00Z"); // 48 hours ago
		const referenceTime = new Date("2024-01-15T12:00:00Z");
		const result = calculateRecencyWeight(eventTime, referenceTime, 24);
		expect(result).toBeCloseTo(0.25, 5); // 0.5^2
	});

	it("approaches zero for very old events", () => {
		const eventTime = new Date("2024-01-01T12:00:00Z"); // 14 days ago
		const referenceTime = new Date("2024-01-15T12:00:00Z");
		const result = calculateRecencyWeight(eventTime, referenceTime, 24);
		expect(result).toBeLessThan(0.001);
	});
});

describe("aggregateSentimentScores", () => {
	it("returns null for empty array", () => {
		const result = aggregateSentimentScores([]);
		expect(result).toBeNull();
	});

	it("returns single score when only one entry", () => {
		const result = aggregateSentimentScores([{ score: 0.5, weight: 1.0 }]);
		expect(result).toBe(0.5);
	});

	it("calculates weighted average correctly", () => {
		const result = aggregateSentimentScores([
			{ score: 0.8, weight: 1.0 },
			{ score: 0.4, weight: 1.0 },
		]);
		expect(result).toBeCloseTo(0.6, 5); // (0.8 + 0.4) / 2
	});

	it("applies weights correctly", () => {
		const result = aggregateSentimentScores([
			{ score: 0.8, weight: 3.0 }, // High weight
			{ score: 0.2, weight: 1.0 }, // Low weight
		]);
		// (0.8 * 3 + 0.2 * 1) / (3 + 1) = 2.6 / 4 = 0.65
		expect(result).toBeCloseTo(0.65, 5);
	});

	it("returns null when total weight is zero", () => {
		const result = aggregateSentimentScores([
			{ score: 0.5, weight: 0 },
			{ score: 0.3, weight: 0 },
		]);
		expect(result).toBeNull();
	});
});

describe("calculateSentimentStrength", () => {
	it("returns null for empty array", () => {
		const result = calculateSentimentStrength([]);
		expect(result).toBeNull();
	});

	it("returns higher strength for high confidence", () => {
		const highConfidence = calculateSentimentStrength([{ confidence: 0.9, weight: 1.0 }]);
		const lowConfidence = calculateSentimentStrength([{ confidence: 0.3, weight: 1.0 }]);
		expect(highConfidence!).toBeGreaterThan(lowConfidence!);
	});

	it("increases with volume (up to a point)", () => {
		const singleEntry = calculateSentimentStrength([{ confidence: 0.8, weight: 1.0 }]);
		const multipleEntries = calculateSentimentStrength([
			{ confidence: 0.8, weight: 1.0 },
			{ confidence: 0.8, weight: 1.0 },
			{ confidence: 0.8, weight: 1.0 },
			{ confidence: 0.8, weight: 1.0 },
			{ confidence: 0.8, weight: 1.0 },
		]);
		expect(multipleEntries!).toBeGreaterThan(singleEntry!);
	});
});

describe("calculateSentimentMomentum", () => {
	it("returns null when short-term is empty", () => {
		const result = calculateSentimentMomentum([], [0.5, 0.4, 0.3]);
		expect(result).toBeNull();
	});

	it("returns null when long-term is empty", () => {
		const result = calculateSentimentMomentum([0.5, 0.4], []);
		expect(result).toBeNull();
	});

	it("returns positive for improving sentiment", () => {
		const shortTerm = [0.6, 0.7, 0.8]; // Avg: 0.7
		const longTerm = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8]; // Avg: 0.55
		const result = calculateSentimentMomentum(shortTerm, longTerm);
		expect(result!).toBeGreaterThan(0);
	});

	it("returns negative for declining sentiment", () => {
		const shortTerm = [0.2, 0.3, 0.4]; // Avg: 0.3
		const longTerm = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0]; // Avg: 0.75
		const result = calculateSentimentMomentum(shortTerm, longTerm);
		expect(result!).toBeLessThan(0);
	});

	it("returns zero for stable sentiment", () => {
		const shortTerm = [0.5, 0.5, 0.5];
		const longTerm = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
		const result = calculateSentimentMomentum(shortTerm, longTerm);
		expect(result).toBe(0);
	});
});

describe("detectEventRisk", () => {
	it("returns false for empty array", () => {
		const result = detectEventRisk([]);
		expect(result).toBe(false);
	});

	it("returns false for low-importance events", () => {
		const result = detectEventRisk([createMockSentiment({ eventType: "earnings", importance: 2 })]);
		expect(result).toBe(false);
	});

	it("returns true for high-importance earnings", () => {
		const result = detectEventRisk([createMockSentiment({ eventType: "earnings", importance: 4 })]);
		expect(result).toBe(true);
	});

	it("returns true for high-importance M&A", () => {
		const result = detectEventRisk([
			createMockSentiment({ eventType: "merger_acquisition", importance: 3 }),
		]);
		expect(result).toBe(true);
	});

	it("returns true for regulatory events", () => {
		const result = detectEventRisk([
			createMockSentiment({ eventType: "regulatory", importance: 5 }),
		]);
		expect(result).toBe(true);
	});

	it("returns false for non-risk event types", () => {
		const result = detectEventRisk([
			createMockSentiment({ eventType: "product_launch", importance: 5 }),
		]);
		expect(result).toBe(false);
	});
});

// ============================================
// SentimentAggregationJob Tests
// ============================================

describe("SentimentAggregationJob", () => {
	let mockProvider: SentimentDataProvider;
	let mockRepo: ReturnType<typeof createMockRepository>;

	beforeEach(() => {
		mockProvider = createMockDataProvider();
		mockRepo = createMockRepository();
	});

	describe("run", () => {
		it("processes symbols and stores sentiment data", async () => {
			const sentimentData = [
				createMockSentiment({ symbol: "AAPL", sentiment: "bullish" }),
				createMockSentiment({ symbol: "MSFT", sentiment: "bearish" }),
			];
			mockProvider = createMockDataProvider(sentimentData);

			const job = new SentimentAggregationJob(mockProvider, mockRepo);
			const result = await job.run(["AAPL", "MSFT"], "2024-01-15");

			expect(result.processed).toBe(2);
			expect(result.failed).toBe(0);
			expect(mockRepo.upsertCalls).toHaveLength(2);
		});

		it("calculates aggregate sentiment score", async () => {
			const sentimentData = [
				createMockSentiment({
					symbol: "AAPL",
					sentiment: "bullish",
					confidence: 0.9,
				}),
				createMockSentiment({
					symbol: "AAPL",
					sentiment: "bullish",
					confidence: 0.7,
				}),
			];
			mockProvider = createMockDataProvider(sentimentData);

			const job = new SentimentAggregationJob(mockProvider, mockRepo);
			await job.run(["AAPL"], "2024-01-15");

			const upserted = mockRepo.upsertCalls[0];
			expect(upserted?.sentimentScore).not.toBeNull();
			expect(upserted!.sentimentScore!).toBeGreaterThan(0); // Bullish = positive
		});

		it("tracks news volume", async () => {
			const sentimentData = [
				createMockSentiment({ symbol: "AAPL" }),
				createMockSentiment({ symbol: "AAPL" }),
				createMockSentiment({ symbol: "AAPL" }),
			];
			mockProvider = createMockDataProvider(sentimentData);

			const job = new SentimentAggregationJob(mockProvider, mockRepo);
			await job.run(["AAPL"], "2024-01-15");

			const upserted = mockRepo.upsertCalls[0];
			expect(upserted?.newsVolume).toBe(3);
		});

		it("detects event risk", async () => {
			const sentimentData = [
				createMockSentiment({
					symbol: "AAPL",
					eventType: "earnings",
					importance: 5,
				}),
			];
			mockProvider = createMockDataProvider(sentimentData);

			const job = new SentimentAggregationJob(mockProvider, mockRepo);
			await job.run(["AAPL"], "2024-01-15");

			const upserted = mockRepo.upsertCalls[0];
			expect(upserted?.eventRiskFlag).toBe(true);
		});

		it("separates news and social sentiment", async () => {
			const sentimentData = [
				createMockSentiment({
					symbol: "AAPL",
					sourceType: "news",
					sentiment: "bullish",
					confidence: 0.9,
				}),
				createMockSentiment({
					symbol: "AAPL",
					sourceType: "social",
					sentiment: "bearish",
					confidence: 0.6,
				}),
			];
			mockProvider = createMockDataProvider(sentimentData);

			const job = new SentimentAggregationJob(mockProvider, mockRepo);
			await job.run(["AAPL"], "2024-01-15");

			const upserted = mockRepo.upsertCalls[0];
			expect(upserted?.newsSentiment).not.toBeNull();
			expect(upserted!.newsSentiment!).toBeGreaterThan(0); // Bullish
			expect(upserted?.socialSentiment).not.toBeNull();
			expect(upserted!.socialSentiment!).toBeLessThan(0); // Bearish
		});

		it("normalizes symbol to uppercase", async () => {
			const sentimentData = [createMockSentiment({ symbol: "aapl" })];
			mockProvider = createMockDataProvider(sentimentData);

			const job = new SentimentAggregationJob(mockProvider, mockRepo);
			await job.run(["aapl"], "2024-01-15");

			const upserted = mockRepo.upsertCalls[0];
			expect(upserted?.symbol).toBe("AAPL");
		});

		it("processes multiple symbols successfully", async () => {
			const sentimentData = [
				createMockSentiment({ symbol: "AAPL" }),
				createMockSentiment({ symbol: "MSFT" }),
			];
			mockProvider = createMockDataProvider(sentimentData);

			const job = new SentimentAggregationJob(mockProvider, mockRepo);
			await job.run(["AAPL", "MSFT"], "2024-01-15");

			const symbols = mockRepo.upsertCalls.map((c: CreateSentimentInput) => c.symbol);
			expect(symbols).toContain("AAPL");
			expect(symbols).toContain("MSFT");
		});
	});

	describe("error handling", () => {
		it("continues on individual symbol errors when configured", async () => {
			mockProvider.getSentimentData = mock(async () => {
				throw new Error("API error");
			});

			const job = new SentimentAggregationJob(mockProvider, mockRepo, {
				continueOnError: true,
				maxRetries: 0,
			});
			const result = await job.run(["AAPL", "MSFT"], "2024-01-15");

			expect(result.processed).toBe(0);
			expect(result.failed).toBe(2);
			expect(result.errors).toHaveLength(2);
		});

		it("stops on error when continueOnError is false", async () => {
			mockProvider.getSentimentData = mock(async () => {
				throw new Error("API error");
			});

			const job = new SentimentAggregationJob(mockProvider, mockRepo, {
				continueOnError: false,
				maxRetries: 0,
			});

			await expect(job.run(["AAPL"], "2024-01-15")).rejects.toThrow("API error");
		});

		it("retries failed API calls", async () => {
			let attempts = 0;
			mockProvider.getSentimentData = mock(async () => {
				attempts++;
				if (attempts < 3) {
					throw new Error("Temporary failure");
				}
				return [createMockSentiment()];
			});

			const job = new SentimentAggregationJob(mockProvider, mockRepo, {
				maxRetries: 3,
				retryDelayMs: 10,
			});
			const result = await job.run(["AAPL"], "2024-01-15");

			expect(attempts).toBe(3);
			expect(result.processed).toBe(1);
		});
	});

	describe("momentum calculation", () => {
		it("calculates momentum from historical data", async () => {
			const sentimentData = [createMockSentiment({ symbol: "AAPL" })];
			const historicalData = [
				{ date: "2024-01-15", score: 0.8 },
				{ date: "2024-01-14", score: 0.7 },
				{ date: "2024-01-13", score: 0.6 },
				{ date: "2024-01-12", score: 0.5 },
				{ date: "2024-01-11", score: 0.4 },
				{ date: "2024-01-10", score: 0.3 },
				{ date: "2024-01-09", score: 0.2 },
				{ date: "2024-01-08", score: 0.1 },
			];
			mockProvider = createMockDataProvider(sentimentData, historicalData);

			const job = new SentimentAggregationJob(mockProvider, mockRepo, {
				shortTermDays: 3,
				longTermDays: 7,
			});
			await job.run(["AAPL"], "2024-01-15");

			const upserted = mockRepo.upsertCalls[0];
			expect(upserted?.sentimentMomentum).not.toBeNull();
			// Short-term avg (last 3) > long-term avg (all 7) = positive momentum
			expect(upserted!.sentimentMomentum!).toBeGreaterThan(0);
		});

		it("returns null momentum when insufficient historical data", async () => {
			const sentimentData = [createMockSentiment({ symbol: "AAPL" })];
			const historicalData = [
				{ date: "2024-01-15", score: 0.5 },
				{ date: "2024-01-14", score: 0.4 },
			];
			mockProvider = createMockDataProvider(sentimentData, historicalData);

			const job = new SentimentAggregationJob(mockProvider, mockRepo, {
				shortTermDays: 7, // Need 7 days but only have 2
			});
			await job.run(["AAPL"], "2024-01-15");

			const upserted = mockRepo.upsertCalls[0];
			expect(upserted?.sentimentMomentum).toBeNull();
		});
	});

	describe("edge cases", () => {
		it("handles empty symbol list", async () => {
			const job = new SentimentAggregationJob(mockProvider, mockRepo);
			const result = await job.run([], "2024-01-15");

			expect(result.processed).toBe(0);
			expect(result.failed).toBe(0);
			expect(mockProvider.getSentimentData).not.toHaveBeenCalled();
		});

		it("handles symbols with no sentiment data", async () => {
			mockProvider = createMockDataProvider([]); // No data

			const job = new SentimentAggregationJob(mockProvider, mockRepo);
			await job.run(["AAPL"], "2024-01-15");

			const upserted = mockRepo.upsertCalls[0];
			expect(upserted?.sentimentScore).toBeNull();
			expect(upserted?.newsVolume).toBe(0);
		});

		it("applies recency weighting to older events", async () => {
			const recentEvent = createMockSentiment({
				symbol: "AAPL",
				sentiment: "bullish",
				confidence: 0.9,
				eventTime: new Date("2024-01-15T20:00:00Z"), // Recent
			});
			const oldEvent = createMockSentiment({
				symbol: "AAPL",
				sentiment: "bearish",
				confidence: 0.9,
				eventTime: new Date("2024-01-01T12:00:00Z"), // 14 days old
			});

			mockProvider = createMockDataProvider([recentEvent, oldEvent]);

			const job = new SentimentAggregationJob(mockProvider, mockRepo);
			await job.run(["AAPL"], "2024-01-15");

			const upserted = mockRepo.upsertCalls[0];
			// Recent bullish event should dominate old bearish event
			expect(upserted!.sentimentScore!).toBeGreaterThan(0);
		});
	});

	describe("result metadata", () => {
		it("returns execution time", async () => {
			mockProvider = createMockDataProvider([createMockSentiment()]);

			const job = new SentimentAggregationJob(mockProvider, mockRepo);
			const result = await job.run(["AAPL"], "2024-01-15");

			expect(result.durationMs).toBeGreaterThanOrEqual(0);
			expect(typeof result.durationMs).toBe("number");
		});

		it("returns error details for failed symbols", async () => {
			mockProvider.getSentimentData = mock(async () => {
				throw new Error("Network error");
			});

			const job = new SentimentAggregationJob(mockProvider, mockRepo, {
				continueOnError: true,
				maxRetries: 0,
			});
			const result = await job.run(["AAPL"], "2024-01-15");

			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]).toEqual({
				symbol: "AAPL",
				error: "Network error",
			});
		});
	});
});
