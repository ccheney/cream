/**
 * Tests for KalshiClient market transformation logic (via fetchMarkets)
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { KalshiClient } from "../client.js";
import { mockGetMarkets, mockKalshiMarket, resetMocks } from "./fixtures.js";

describe("KalshiClient transformMarket", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("should transform market with yes/no prices", async () => {
    const marketWithPrices = {
      ...mockKalshiMarket,
      yes_bid: 55,
      yes_ask: 57,
      no_bid: 43,
      no_ask: 45,
      last_price: 56,
    };

    mockGetMarkets.mockImplementation(() =>
      Promise.resolve({
        data: { markets: [marketWithPrices] },
      })
    );

    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test-pem",
    });

    const events = await client.fetchMarkets(["FED_RATE"]);
    expect(events.length).toBeGreaterThan(0);

    const event = events[0];
    expect(event?.payload.outcomes).toBeDefined();
    const yesOutcome = event?.payload.outcomes.find((o) => o.outcome === "Yes");
    expect(yesOutcome?.probability).toBe(0.56);
    expect(yesOutcome?.price).toBe(0.56);
  });

  it("should handle market with only yes_bid (no last_price)", async () => {
    const marketWithOnlyBid = {
      ...mockKalshiMarket,
      yes_bid: 60,
      yes_ask: 62,
      no_bid: 38,
      no_ask: 40,
      last_price: undefined,
    };

    mockGetMarkets.mockImplementation(() =>
      Promise.resolve({
        data: { markets: [marketWithOnlyBid] },
      })
    );

    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test-pem",
    });

    const events = await client.fetchMarkets(["FED_RATE"]);
    const event = events[0];
    const yesOutcome = event?.payload.outcomes.find((o) => o.outcome === "Yes");
    expect(yesOutcome?.probability).toBe(0.6);
  });

  it("should use expiration_time for eventTime", async () => {
    const marketWithExpiration = {
      ...mockKalshiMarket,
      expiration_time: "2026-01-29T21:00:00Z",
      close_time: "2026-01-29T19:00:00Z",
    };

    mockGetMarkets.mockImplementation(() =>
      Promise.resolve({
        data: { markets: [marketWithExpiration] },
      })
    );

    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test-pem",
    });

    const events = await client.fetchMarkets(["FED_RATE"]);
    expect(events[0]?.eventTime).toBe("2026-01-29T21:00:00Z");
  });

  it("should fall back to close_time when no expiration_time", async () => {
    const marketWithoutExpiration = {
      ...mockKalshiMarket,
      expiration_time: undefined,
      close_time: "2026-01-29T19:00:00Z",
    };

    mockGetMarkets.mockImplementation(() =>
      Promise.resolve({
        data: { markets: [marketWithoutExpiration] },
      })
    );

    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test-pem",
    });

    const events = await client.fetchMarkets(["FED_RATE"]);
    expect(events[0]?.eventTime).toBe("2026-01-29T19:00:00Z");
  });

  it("should use current date when no time fields", async () => {
    const marketWithoutTimes = {
      ...mockKalshiMarket,
      expiration_time: undefined,
      close_time: undefined,
    };

    mockGetMarkets.mockImplementation(() =>
      Promise.resolve({
        data: { markets: [marketWithoutTimes] },
      })
    );

    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test-pem",
    });

    const events = await client.fetchMarkets(["FED_RATE"]);
    expect(events[0]?.eventTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("should include volume24h in Yes outcome", async () => {
    const marketWithVolume = {
      ...mockKalshiMarket,
      volume_24h: 25000,
    };

    mockGetMarkets.mockImplementation(() =>
      Promise.resolve({
        data: { markets: [marketWithVolume] },
      })
    );

    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test-pem",
    });

    const events = await client.fetchMarkets(["FED_RATE"]);
    const yesOutcome = events[0]?.payload.outcomes.find((o) => o.outcome === "Yes");
    expect(yesOutcome?.volume24h).toBe(25000);
  });

  it("should create No outcome with inverse price", async () => {
    const market = {
      ...mockKalshiMarket,
      yes_bid: 70,
      no_bid: 30,
      last_price: 70,
    };

    mockGetMarkets.mockImplementation(() =>
      Promise.resolve({
        data: { markets: [market] },
      })
    );

    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test-pem",
    });

    const events = await client.fetchMarkets(["FED_RATE"]);
    const noOutcome = events[0]?.payload.outcomes.find((o) => o.outcome === "No");
    expect(noOutcome?.probability).toBe(0.3);
  });
});
