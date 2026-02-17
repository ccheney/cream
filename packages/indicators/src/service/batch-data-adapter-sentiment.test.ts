/**
 * Sentiment adapter tests for BatchDataAdapter
 */

import { expect, test } from "bun:test";
import { requireValue } from "@cream/test-utils";
import {
	createSentimentRepositoryAdapter,
	SentimentRepositoryAdapter,
	type StorageSentimentRow,
} from "./batch-data-adapter";
import { createMockSentimentRepo } from "./batch-data-adapter.test-helpers";

type SentimentClassification =
	| "STRONG_BULLISH"
	| "BULLISH"
	| "NEUTRAL"
	| "BEARISH"
	| "STRONG_BEARISH";

const fullSentimentRow: StorageSentimentRow = {
	id: "sent-1",
	symbol: "AAPL",
	date: "2026-01-10",
	sentimentScore: 0.65,
	sentimentStrength: 0.8,
	newsVolume: 150,
	sentimentMomentum: 0.1,
	eventRiskFlag: false,
	newsSentiment: 0.7,
	socialSentiment: 0.6,
	analystSentiment: 0.65,
	computedAt: "2026-01-10T12:00:00Z",
};

const nullSentimentRow: StorageSentimentRow = {
	id: "sent-null",
	symbol: "NULL",
	date: "2026-01-10",
	sentimentScore: null,
	sentimentStrength: null,
	newsVolume: 0,
	sentimentMomentum: null,
	eventRiskFlag: false,
	newsSentiment: null,
	socialSentiment: null,
	analystSentiment: null,
	computedAt: "2026-01-10T12:00:00Z",
};

const classificationCases: Array<{ score: number; expected: SentimentClassification }> = [
	{ score: 0.8, expected: "STRONG_BULLISH" },
	{ score: 0.6, expected: "STRONG_BULLISH" },
	{ score: 0.4, expected: "BULLISH" },
	{ score: 0.2, expected: "BULLISH" },
	{ score: 0.0, expected: "NEUTRAL" },
	{ score: -0.1, expected: "NEUTRAL" },
	{ score: -0.2, expected: "NEUTRAL" },
	{ score: -0.3, expected: "BEARISH" },
	{ score: -0.5, expected: "BEARISH" },
	{ score: -0.6, expected: "BEARISH" },
	{ score: -0.7, expected: "STRONG_BEARISH" },
	{ score: -1.0, expected: "STRONG_BEARISH" },
];

test("SentimentRepositoryAdapter returns null when no data exists", async () => {
	const mockRepo = createMockSentimentRepo(new Map());
	const adapter = new SentimentRepositoryAdapter(mockRepo);

	const result = await adapter.getLatest("AAPL");

	expect(result).toBeNull();
});

test("SentimentRepositoryAdapter transforms row to indicators", async () => {
	const mockRepo = createMockSentimentRepo(new Map([["AAPL", fullSentimentRow]]));
	const adapter = new SentimentRepositoryAdapter(mockRepo);

	const result = await adapter.getLatest("AAPL");
	const latest = requireValue(result, "result");

	expect(latest.overall_score).toBe(0.65);
	expect(latest.sentiment_strength).toBe(0.8);
	expect(latest.news_volume).toBe(150);
	expect(latest.sentiment_momentum).toBe(0.1);
	expect(latest.event_risk).toBe(false);
	expect(latest.classification).toBe("STRONG_BULLISH");
});

test("SentimentRepositoryAdapter classifies score ranges correctly", async () => {
	for (const { score, expected } of classificationCases) {
		const row: StorageSentimentRow = {
			id: "sent-test",
			symbol: "TEST",
			date: "2026-01-10",
			sentimentScore: score,
			sentimentStrength: 0.5,
			newsVolume: 10,
			sentimentMomentum: 0,
			eventRiskFlag: false,
			newsSentiment: null,
			socialSentiment: null,
			analystSentiment: null,
			computedAt: "2026-01-10T12:00:00Z",
		};
		const mockRepo = createMockSentimentRepo(new Map([["TEST", row]]));
		const adapter = new SentimentRepositoryAdapter(mockRepo);
		const result = await adapter.getLatest("TEST");
		expect(requireValue(result, "result").classification).toBe(expected);
	}
});

test("SentimentRepositoryAdapter returns null classification for null score", async () => {
	const mockRepo = createMockSentimentRepo(new Map([["NULL", nullSentimentRow]]));
	const adapter = new SentimentRepositoryAdapter(mockRepo);

	const result = await adapter.getLatest("NULL");
	const latest = requireValue(result, "result");

	expect(latest.overall_score).toBeNull();
	expect(latest.classification).toBeNull();
});

test("createSentimentRepositoryAdapter creates adapter from factory", async () => {
	const mockRepo = createMockSentimentRepo(new Map());
	const adapter = createSentimentRepositoryAdapter(mockRepo);

	expect(adapter).toBeInstanceOf(SentimentRepositoryAdapter);
	expect(typeof adapter.getLatest).toBe("function");
});
