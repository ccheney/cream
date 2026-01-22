/**
 * Shared fixtures and mock setup for Kalshi client tests
 */

import { mock } from "bun:test";

// ============================================
// Mock Data
// ============================================

export const mockKalshiMarket = {
	ticker: "KXFED-26JAN29-T50",
	event_ticker: "KXFED-26JAN29",
	series_ticker: "KXFED",
	title: "Will the Fed cut rates by 50bps in January 2026?",
	subtitle: "FOMC January 2026 Decision",
	status: "open",
	yes_bid: 55,
	yes_ask: 57,
	no_bid: 43,
	no_ask: 45,
	last_price: 56,
	volume: 100000,
	volume_24h: 15000,
	open_interest: 50000,
	close_time: "2026-01-29T19:00:00Z",
	expiration_time: "2026-01-29T21:00:00Z",
};

export const mockKalshiEvent = {
	event_ticker: "KXFED-26JAN29",
	series_ticker: "KXFED",
	title: "Federal Reserve January 2026 Decision",
	category: "Economics",
	markets: [mockKalshiMarket],
};

// ============================================
// SDK Mock Functions
// ============================================

export const mockGetMarkets = mock(() =>
	Promise.resolve({
		data: { markets: [mockKalshiMarket] },
	}),
);

export const mockGetMarket = mock(() =>
	Promise.resolve({
		data: { market: mockKalshiMarket },
	}),
);

export const mockGetEvent = mock(() =>
	Promise.resolve({
		data: { event: mockKalshiEvent },
	}),
);

// ============================================
// Mock Module Setup
// ============================================

mock.module("kalshi-typescript", () => ({
	Configuration: class Configuration {},
	MarketApi: class MarketApi {
		getMarkets = mockGetMarkets;
		getMarket = mockGetMarket;
	},
	EventsApi: class EventsApi {
		getEvent = mockGetEvent;
	},
}));

// ============================================
// Helper Functions
// ============================================

export function resetMocks(): void {
	mockGetMarkets.mockClear();
	mockGetMarket.mockClear();
	mockGetEvent.mockClear();
}

export function resetToDefaultImplementations(): void {
	mockGetMarkets.mockImplementation(() =>
		Promise.resolve({
			data: { markets: [mockKalshiMarket] },
		}),
	);
	mockGetMarket.mockImplementation(() =>
		Promise.resolve({
			data: { market: mockKalshiMarket },
		}),
	);
	mockGetEvent.mockImplementation(() =>
		Promise.resolve({
			data: { event: mockKalshiEvent },
		}),
	);
}

export function createTestClient(): Promise<
	InstanceType<typeof import("../client.js").KalshiClient>
> {
	return import("../client.js").then(
		({ KalshiClient }) =>
			new KalshiClient({
				apiKeyId: "test-key",
				privateKeyPem: "test-pem",
			}),
	);
}
