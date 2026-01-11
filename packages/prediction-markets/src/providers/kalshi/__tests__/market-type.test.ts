/**
 * Tests for KalshiClient market type detection (via fetchMarkets)
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { KalshiClient } from "../client.js";
import { mockGetMarkets, mockKalshiMarket, resetMocks } from "./fixtures.js";

describe("KalshiClient getMarketType", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("should return FED_RATE for KXFED series", async () => {
    mockGetMarkets.mockImplementation((_limit, _cursor, _eventTicker, seriesTicker) => {
      if (seriesTicker === "KXFED") {
        return Promise.resolve({
          data: { markets: [mockKalshiMarket] },
        });
      }
      return Promise.resolve({ data: { markets: [] } });
    });

    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test-pem",
    });

    const events = await client.fetchMarkets(["FED_RATE"]);
    expect(events[0]?.payload.marketType).toBe("FED_RATE");
  });

  it("should return RECESSION for KXREC series", async () => {
    mockGetMarkets.mockImplementation((_limit, _cursor, _eventTicker, seriesTicker) => {
      if (seriesTicker === "KXREC") {
        return Promise.resolve({
          data: { markets: [mockKalshiMarket] },
        });
      }
      return Promise.resolve({ data: { markets: [] } });
    });

    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test-pem",
    });

    const events = await client.fetchMarkets(["RECESSION"]);
    expect(events[0]?.payload.marketType).toBe("RECESSION");
  });

  it("should return ECONOMIC_DATA for KXCPI series", async () => {
    mockGetMarkets.mockImplementation((_limit, _cursor, _eventTicker, seriesTicker) => {
      if (seriesTicker === "KXCPI") {
        return Promise.resolve({
          data: { markets: [mockKalshiMarket] },
        });
      }
      return Promise.resolve({ data: { markets: [] } });
    });

    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test-pem",
    });

    const events = await client.fetchMarkets(["ECONOMIC_DATA"]);
    const cpiEvent = events.find((e) => e.payload.marketType === "ECONOMIC_DATA");
    expect(cpiEvent).toBeDefined();
  });
});
