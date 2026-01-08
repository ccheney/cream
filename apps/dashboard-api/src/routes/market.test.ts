import { describe, expect, test, mock } from "bun:test";
import marketRoutes from "./market";

// Mock database
mock.module("../db", () => ({
  getRegimeLabelsRepo: async () => ({
    getCurrent: async (symbol: string) => {
      if (symbol === "_MARKET") {
        return {
          symbol: "_MARKET",
          regime: "bull_trend",
          confidence: 0.8,
          timestamp: "2024-01-01T00:00:00Z",
          timeframe: "1d",
        };
      }
      return null;
    },
  }),
}));

// Mock market data
mock.module("@cream/marketdata", () => ({
  PolygonClient: class {
    constructor() {}
     getPreviousClose() {
         return Promise.resolve({ results: [{ c: 20 }] });
     }
  }
}));

describe("Market Routes", () => {
  test("GET /regime returns regime status", async () => {
    const res = await marketRoutes.request("/regime");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({
      label: "BULL_TREND",
      confidence: 0.8,
      vix: 20,
      sectorRotation: {},
      updatedAt: "2024-01-01T00:00:00Z",
    });
  });
});
