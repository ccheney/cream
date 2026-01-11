/**
 * Broker Client Factory Tests
 */

import { describe, expect, test } from "bun:test";
import { createTestContext } from "@cream/domain";
import { createBrokerClient } from "../src/factory.js";

describe("createBrokerClient factory", () => {
  describe("BACKTEST environment", () => {
    test("creates backtest adapter for BACKTEST environment", () => {
      const ctx = createTestContext("BACKTEST");
      const client = createBrokerClient(ctx);
      expect(client.getEnvironment()).toBe("BACKTEST");
    });

    test("creates backtest adapter with configuration", async () => {
      const ctx = createTestContext("BACKTEST");
      const client = createBrokerClient(ctx, {
        backtest: {
          initialCash: 50000,
        },
      });

      const account = await client.getAccount();
      expect(account.cash).toBe(50000);
    });
  });

  describe("PAPER environment", () => {
    test("throws error for PAPER without credentials", () => {
      const savedKey = process.env.ALPACA_KEY;
      const savedSecret = process.env.ALPACA_SECRET;
      delete process.env.ALPACA_KEY;
      delete process.env.ALPACA_SECRET;

      try {
        const ctx = createTestContext("PAPER");
        expect(() => createBrokerClient(ctx)).toThrow("ALPACA_KEY and ALPACA_SECRET are required");
      } finally {
        if (savedKey) {
          process.env.ALPACA_KEY = savedKey;
        }
        if (savedSecret) {
          process.env.ALPACA_SECRET = savedSecret;
        }
      }
    });

    test("creates Alpaca client for PAPER with valid credentials", () => {
      const ctx = createTestContext("PAPER");
      const client = createBrokerClient(ctx, {
        apiKey: "test-key",
        apiSecret: "test-secret",
      });
      expect(client.getEnvironment()).toBe("PAPER");
    });
  });

  describe("LIVE environment", () => {
    test("creates Alpaca client for LIVE with valid credentials", () => {
      const ctx = createTestContext("LIVE");
      const client = createBrokerClient(ctx, {
        apiKey: "test-key",
        apiSecret: "test-secret",
      });
      expect(client.getEnvironment()).toBe("LIVE");
    });
  });

  describe("Error handling", () => {
    test("throws error for unknown environment", () => {
      const ctx = createTestContext("UNKNOWN" as "BACKTEST");
      expect(() => createBrokerClient(ctx)).toThrow("Unknown environment");
    });
  });
});
