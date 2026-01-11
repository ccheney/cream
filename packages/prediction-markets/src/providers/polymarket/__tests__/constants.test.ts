/**
 * Tests for Polymarket constants and configuration
 */

import { describe, expect, it } from "bun:test";
import { DEFAULT_SEARCH_QUERIES, POLYMARKET_RATE_LIMITS } from "../client.js";

describe("POLYMARKET_RATE_LIMITS", () => {
  it("should have all endpoints defined", () => {
    expect(POLYMARKET_RATE_LIMITS.general).toBeDefined();
    expect(POLYMARKET_RATE_LIMITS.clob_book_price).toBeDefined();
    expect(POLYMARKET_RATE_LIMITS.data_trades).toBeDefined();
    expect(POLYMARKET_RATE_LIMITS.gamma_markets).toBeDefined();
    expect(POLYMARKET_RATE_LIMITS.gamma_events).toBeDefined();
  });

  it("should have correct rate limit values", () => {
    expect(POLYMARKET_RATE_LIMITS.general).toBe(15000);
    expect(POLYMARKET_RATE_LIMITS.clob_book_price).toBe(1500);
    expect(POLYMARKET_RATE_LIMITS.data_trades).toBe(200);
    expect(POLYMARKET_RATE_LIMITS.gamma_markets).toBe(300);
    expect(POLYMARKET_RATE_LIMITS.gamma_events).toBe(500);
  });
});

describe("DEFAULT_SEARCH_QUERIES", () => {
  it("should have queries for FED_RATE", () => {
    expect(DEFAULT_SEARCH_QUERIES.FED_RATE).toContain("Federal Reserve");
    expect(DEFAULT_SEARCH_QUERIES.FED_RATE).toContain("FOMC");
  });

  it("should have queries for ECONOMIC_DATA", () => {
    expect(DEFAULT_SEARCH_QUERIES.ECONOMIC_DATA).toContain("inflation");
    expect(DEFAULT_SEARCH_QUERIES.ECONOMIC_DATA).toContain("CPI");
    expect(DEFAULT_SEARCH_QUERIES.ECONOMIC_DATA).toContain("GDP");
  });

  it("should have queries for RECESSION", () => {
    expect(DEFAULT_SEARCH_QUERIES.RECESSION).toContain("recession");
  });
});
