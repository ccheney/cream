/**
 * Shared test fixtures and mock data for Polymarket client tests
 */

import { mock } from "bun:test";

export const mockPolymarketEvent = {
	id: "event-123",
	title: "Fed Rate Decision",
	slug: "fed-rate-decision",
	description: "Will the Fed cut rates?",
	startDate: "2024-01-01T00:00:00Z",
	endDate: "2024-06-30T00:00:00Z",
	active: true,
	markets: [
		{
			id: "market-456",
			question: "Will the Federal Reserve cut rates in June 2024?",
			slug: "fed-rate-cut-june",
			outcomes: ["Yes", "No"],
			outcomePrices: ["0.65", "0.35"],
			volume: "500000",
			volume24hr: "25000",
			liquidity: "50000",
			active: true,
			closed: false,
			endDate: "2024-06-30T00:00:00Z",
			clobTokenIds: ["token-yes", "token-no"],
		},
	],
};

export const mockPolymarketMarket = {
	id: "market-789",
	question: "Will inflation exceed 3% in Q2?",
	slug: "inflation-q2",
	outcomes: ["Yes", "No"],
	outcomePrices: ["0.45", "0.55"],
	volume: "100000",
	volume24hr: "5000",
	liquidity: "10000",
	active: true,
	closed: false,
	endDate: "2024-07-01T00:00:00Z",
	clobTokenIds: ["token-1", "token-2"],
};

export interface FetchMockContext {
	originalFetch: typeof global.fetch;
	mockFetch: ReturnType<typeof mock>;
}

export function createFetchMock(): FetchMockContext {
	const originalFetch = global.fetch;
	const mockFetch = mock(() =>
		Promise.resolve({
			ok: true,
			json: () => Promise.resolve([]),
		} as Response),
	);
	global.fetch = mockFetch as unknown as typeof fetch;
	return { originalFetch, mockFetch };
}

export function restoreFetch(ctx: FetchMockContext): void {
	global.fetch = ctx.originalFetch;
}
