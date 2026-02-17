import type { Candle } from "@cream/indicators";
import type { ResolvedInstrument } from "@cream/universe";

import { createMockCandleSource, createMockEventSource, createMockUniverseSource } from "./builder";
import type { ExternalEventSummary, FeatureSnapshot, Timeframe } from "./schema";

function generateCandles(count: number, basePrice: number, baseTime: number): Candle[] {
	const candles: Candle[] = [];
	let price = basePrice;

	for (let i = 0; i < count; i++) {
		const change = (Math.random() - 0.5) * 2;
		const open = price;
		const close = price + change;
		const high = Math.max(open, close) + Math.random() * 0.5;
		const low = Math.min(open, close) - Math.random() * 0.5;
		const volume = 1000000 + Math.random() * 500000;

		candles.push({
			timestamp: baseTime + i * 3600000,
			open,
			high,
			low,
			close,
			volume,
		});

		price = close;
	}

	return candles;
}

function createCandlesForSymbol(basePrice: number, baseTime: number): Map<Timeframe, Candle[]> {
	return new Map<Timeframe, Candle[]>([
		["1h", generateCandles(200, basePrice, baseTime)],
		["4h", generateCandles(50, basePrice, baseTime)],
		["1d", generateCandles(30, basePrice, baseTime)],
	]);
}

function createEventsBySymbol(now: number): Map<string, ExternalEventSummary[]> {
	const aaplEvents: ExternalEventSummary[] = [
		{
			eventId: "event-1",
			eventType: "EARNINGS",
			eventTime: new Date(now - 24 * 3600000).toISOString(),
			summary: "Q4 earnings beat expectations",
			sentimentScore: 0.7,
			importanceScore: 0.9,
		},
		{
			eventId: "event-2",
			eventType: "NEWS",
			eventTime: new Date(now - 48 * 3600000).toISOString(),
			summary: "New product announcement",
			sentimentScore: 0.5,
			importanceScore: 0.6,
		},
	];

	return new Map<string, ExternalEventSummary[]>([
		["AAPL", aaplEvents],
		["MSFT", []],
	]);
}

function createMetadataBySymbol(): Map<string, ResolvedInstrument> {
	const aaplMetadata: ResolvedInstrument = {
		symbol: "AAPL",
		name: "Apple Inc.",
		sector: "Technology",
		industry: "Consumer Electronics",
		marketCap: 3000000000000,
		avgVolume: 50000000,
		price: 150,
		source: "test",
	};

	const msftMetadata: ResolvedInstrument = {
		symbol: "MSFT",
		name: "Microsoft Corporation",
		sector: "Technology",
		industry: "Software",
		marketCap: 2800000000000,
		avgVolume: 25000000,
		price: 350,
		source: "test",
	};

	return new Map<string, ResolvedInstrument>([
		["AAPL", aaplMetadata],
		["MSFT", msftMetadata],
	]);
}

export function createTestSources() {
	const now = Date.now();
	const baseTime = now - 200 * 3600000;

	const candlesBySymbol = new Map<string, Map<Timeframe, Candle[]>>([
		["AAPL", createCandlesForSymbol(150, baseTime)],
		["MSFT", createCandlesForSymbol(350, baseTime)],
	]);

	return {
		candles: createMockCandleSource(candlesBySymbol),
		events: createMockEventSource(createEventsBySymbol(now)),
		universe: createMockUniverseSource(createMetadataBySymbol()),
	};
}

export function createSimpleSnapshot(symbol = "AAPL", timestamp = Date.now()): FeatureSnapshot {
	return {
		symbol,
		timestamp,
		createdAt: new Date().toISOString(),
		candles: {},
		latestPrice: 150,
		latestVolume: 1000000,
		indicators: {},
		normalized: {},
		regime: {
			regime: "BULL_TREND",
			confidence: 0.8,
		},
		recentEvents: [],
		metadata: { symbol },
		config: {
			lookbackWindow: 100,
			timeframes: ["1h"],
			eventLookbackHours: 72,
		},
	};
}
