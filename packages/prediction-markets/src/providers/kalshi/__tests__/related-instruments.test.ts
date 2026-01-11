/**
 * Tests for KalshiClient related instruments logic (via fetchMarkets)
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { KalshiClient } from "../client.js";
import { resetMocks, resetToDefaultImplementations } from "./fixtures.js";

describe("KalshiClient getRelatedInstruments", () => {
  beforeEach(() => {
    resetMocks();
    resetToDefaultImplementations();
  });

  it("should return FED_RATE related instruments", async () => {
    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test-pem",
    });

    const events = await client.fetchMarkets(["FED_RATE"]);
    expect(events[0]?.relatedInstrumentIds).toContain("XLF");
    expect(events[0]?.relatedInstrumentIds).toContain("TLT");
    expect(events[0]?.relatedInstrumentIds).toContain("IYR");
    expect(events[0]?.relatedInstrumentIds).toContain("SHY");
  });

  it("should return RECESSION related instruments", async () => {
    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test-pem",
    });

    const events = await client.fetchMarkets(["RECESSION"]);
    const recessionEvent = events.find((e) => e.payload.marketType === "RECESSION");
    if (recessionEvent) {
      expect(recessionEvent.relatedInstrumentIds).toContain("SPY");
      expect(recessionEvent.relatedInstrumentIds).toContain("VIX");
      expect(recessionEvent.relatedInstrumentIds).toContain("TLT");
      expect(recessionEvent.relatedInstrumentIds).toContain("GLD");
    }
  });

  it("should return ECONOMIC_DATA related instruments", async () => {
    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test-pem",
    });

    const events = await client.fetchMarkets(["ECONOMIC_DATA"]);
    for (const event of events) {
      expect(event.relatedInstrumentIds).toContain("SPY");
      expect(event.relatedInstrumentIds).toContain("QQQ");
      expect(event.relatedInstrumentIds).toContain("TLT");
    }
  });

  it("should return empty array for unknown market type", async () => {
    const client = new KalshiClient({
      apiKeyId: "test-key",
      privateKeyPem: "test-pem",
    });

    const events = await client.fetchMarkets(["ELECTION"]);
    for (const event of events) {
      expect(event.relatedInstrumentIds).toEqual([]);
    }
  });
});
