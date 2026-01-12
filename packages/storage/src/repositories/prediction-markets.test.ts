/**
 * Prediction Markets Repository Tests
 */

// Set required environment variables before imports
process.env.CREAM_ENV = "BACKTEST";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createInMemoryClient, type TursoClient } from "../turso.js";
import { RepositoryError } from "./base.js";
import {
  type CreateArbitrageInput,
  type CreateSignalInput,
  type CreateSnapshotInput,
  PredictionMarketsRepository,
} from "./prediction-markets.js";

async function setupTables(client: TursoClient): Promise<void> {
  await client.run(`
    CREATE TABLE IF NOT EXISTS prediction_market_snapshots (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL CHECK (platform IN ('KALSHI', 'POLYMARKET')),
      market_ticker TEXT NOT NULL,
      market_type TEXT NOT NULL CHECK (market_type IN ('FED_RATE', 'ECONOMIC_DATA', 'RECESSION', 'GEOPOLITICAL', 'REGULATORY', 'ELECTION', 'OTHER')),
      market_question TEXT,
      snapshot_time TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await client.run(`
    CREATE TABLE IF NOT EXISTS prediction_market_signals (
      id TEXT PRIMARY KEY,
      signal_type TEXT NOT NULL CHECK (signal_type IN ('fed_cut_probability', 'fed_hike_probability', 'recession_12m', 'macro_uncertainty', 'policy_event_risk', 'cpi_surprise', 'gdp_surprise', 'shutdown_probability', 'tariff_escalation')),
      signal_value REAL NOT NULL,
      confidence REAL,
      computed_at TEXT NOT NULL,
      inputs TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await client.run(`
    CREATE TABLE IF NOT EXISTS prediction_market_arbitrage (
      id TEXT PRIMARY KEY,
      kalshi_ticker TEXT NOT NULL,
      polymarket_token TEXT NOT NULL,
      kalshi_price REAL NOT NULL,
      polymarket_price REAL NOT NULL,
      divergence_pct REAL NOT NULL,
      market_type TEXT NOT NULL CHECK (market_type IN ('FED_RATE', 'ECONOMIC_DATA', 'RECESSION', 'GEOPOLITICAL', 'REGULATORY', 'ELECTION', 'OTHER')),
      detected_at TEXT NOT NULL,
      resolved_at TEXT,
      resolution_price REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

describe("PredictionMarketsRepository", () => {
  let client: TursoClient;
  let repo: PredictionMarketsRepository;

  beforeEach(async () => {
    client = await createInMemoryClient();
    await setupTables(client);
    repo = new PredictionMarketsRepository(client);
  });

  afterEach(() => {
    client.close();
  });

  // ========================================
  // Snapshot Operations
  // ========================================

  describe("Snapshots", () => {
    test("saves a market snapshot", async () => {
      const input: CreateSnapshotInput = {
        id: "snap-001",
        platform: "KALSHI",
        marketTicker: "FED-24DEC-T4.75",
        marketType: "FED_RATE",
        marketQuestion: "Will the Fed cut rates in December 2024?",
        snapshotTime: "2024-11-15T10:00:00Z",
        data: {
          outcomes: [
            { outcome: "Yes", probability: 0.75, price: 0.75, volume24h: 100000 },
            { outcome: "No", probability: 0.25, price: 0.25, volume24h: 50000 },
          ],
          liquidityScore: 0.85,
          volume24h: 150000,
          openInterest: 500000,
        },
      };

      const result = await repo.saveSnapshot(input);

      expect(result.id).toBe("snap-001");
      expect(result.platform).toBe("KALSHI");
      expect(result.marketTicker).toBe("FED-24DEC-T4.75");
      expect(result.marketType).toBe("FED_RATE");
      expect(result.marketQuestion).toBe("Will the Fed cut rates in December 2024?");
      expect(result.data.outcomes).toHaveLength(2);
      expect(result.data.outcomes[0]!.probability).toBe(0.75);
    });

    test("finds snapshot by ID", async () => {
      await repo.saveSnapshot({
        id: "snap-find",
        platform: "POLYMARKET",
        marketTicker: "recession-2025",
        marketType: "RECESSION",
        snapshotTime: "2024-11-15T10:00:00Z",
        data: { outcomes: [] },
      });

      const found = await repo.findSnapshotById("snap-find");
      expect(found).not.toBeNull();
      expect(found!.platform).toBe("POLYMARKET");
    });

    test("returns null for non-existent snapshot ID", async () => {
      const found = await repo.findSnapshotById("nonexistent");
      expect(found).toBeNull();
    });

    test("gets snapshots for ticker in time range", async () => {
      await repo.saveSnapshot({
        id: "s1",
        platform: "KALSHI",
        marketTicker: "FED-CUT",
        marketType: "FED_RATE",
        snapshotTime: "2024-11-01T10:00:00Z",
        data: { outcomes: [] },
      });
      await repo.saveSnapshot({
        id: "s2",
        platform: "KALSHI",
        marketTicker: "FED-CUT",
        marketType: "FED_RATE",
        snapshotTime: "2024-11-15T10:00:00Z",
        data: { outcomes: [] },
      });
      await repo.saveSnapshot({
        id: "s3",
        platform: "KALSHI",
        marketTicker: "FED-CUT",
        marketType: "FED_RATE",
        snapshotTime: "2024-12-01T10:00:00Z",
        data: { outcomes: [] },
      });
      await repo.saveSnapshot({
        id: "s4",
        platform: "KALSHI",
        marketTicker: "OTHER-MARKET",
        marketType: "OTHER",
        snapshotTime: "2024-11-15T10:00:00Z",
        data: { outcomes: [] },
      });

      const snapshots = await repo.getSnapshots(
        "FED-CUT",
        "2024-11-01T00:00:00Z",
        "2024-11-30T23:59:59Z"
      );
      expect(snapshots).toHaveLength(2);
    });

    test("finds snapshots with filters", async () => {
      await repo.saveSnapshot({
        id: "f1",
        platform: "KALSHI",
        marketTicker: "KALSHI-1",
        marketType: "FED_RATE",
        snapshotTime: "2024-11-15T10:00:00Z",
        data: { outcomes: [] },
      });
      await repo.saveSnapshot({
        id: "f2",
        platform: "KALSHI",
        marketTicker: "KALSHI-2",
        marketType: "RECESSION",
        snapshotTime: "2024-11-15T10:00:00Z",
        data: { outcomes: [] },
      });
      await repo.saveSnapshot({
        id: "f3",
        platform: "POLYMARKET",
        marketTicker: "POLY-1",
        marketType: "FED_RATE",
        snapshotTime: "2024-11-15T10:00:00Z",
        data: { outcomes: [] },
      });

      const kalshiOnly = await repo.findSnapshots({ platform: "KALSHI" });
      expect(kalshiOnly).toHaveLength(2);

      const fedRateOnly = await repo.findSnapshots({ marketType: "FED_RATE" });
      expect(fedRateOnly).toHaveLength(2);

      const combined = await repo.findSnapshots({ platform: "KALSHI", marketType: "FED_RATE" });
      expect(combined).toHaveLength(1);
    });

    test("findSnapshots with time range filters", async () => {
      await repo.saveSnapshot({
        id: "t1",
        platform: "KALSHI",
        marketTicker: "T1",
        marketType: "OTHER",
        snapshotTime: "2024-11-01T10:00:00Z",
        data: { outcomes: [] },
      });
      await repo.saveSnapshot({
        id: "t2",
        platform: "KALSHI",
        marketTicker: "T2",
        marketType: "OTHER",
        snapshotTime: "2024-11-15T10:00:00Z",
        data: { outcomes: [] },
      });
      await repo.saveSnapshot({
        id: "t3",
        platform: "KALSHI",
        marketTicker: "T3",
        marketType: "OTHER",
        snapshotTime: "2024-12-01T10:00:00Z",
        data: { outcomes: [] },
      });

      const filtered = await repo.findSnapshots({
        fromTime: "2024-11-10T00:00:00Z",
        toTime: "2024-11-20T00:00:00Z",
      });
      expect(filtered).toHaveLength(1);
      expect(filtered[0]!.id).toBe("t2");
    });

    test("gets latest snapshots for each ticker", async () => {
      await repo.saveSnapshot({
        id: "l1",
        platform: "KALSHI",
        marketTicker: "MARKET-A",
        marketType: "FED_RATE",
        snapshotTime: "2024-11-01T10:00:00Z",
        data: { outcomes: [] },
      });
      await repo.saveSnapshot({
        id: "l2",
        platform: "KALSHI",
        marketTicker: "MARKET-A",
        marketType: "FED_RATE",
        snapshotTime: "2024-11-15T10:00:00Z",
        data: { outcomes: [] },
      });
      await repo.saveSnapshot({
        id: "l3",
        platform: "POLYMARKET",
        marketTicker: "MARKET-B",
        marketType: "RECESSION",
        snapshotTime: "2024-11-10T10:00:00Z",
        data: { outcomes: [] },
      });

      const latest = await repo.getLatestSnapshots();
      expect(latest).toHaveLength(2);

      const latestKalshi = await repo.getLatestSnapshots("KALSHI");
      expect(latestKalshi).toHaveLength(1);
      expect(latestKalshi[0]!.id).toBe("l2");
    });

    test("handles all platforms", async () => {
      const platforms = ["KALSHI", "POLYMARKET"] as const;

      for (const platform of platforms) {
        await repo.saveSnapshot({
          id: `plat-${platform}`,
          platform,
          marketTicker: `TICKER-${platform}`,
          marketType: "OTHER",
          snapshotTime: "2024-11-15T10:00:00Z",
          data: { outcomes: [] },
        });
      }

      for (const platform of platforms) {
        const found = await repo.findSnapshotById(`plat-${platform}`);
        expect(found!.platform).toBe(platform);
      }
    });

    test("handles all market types", async () => {
      const marketTypes = [
        "FED_RATE",
        "ECONOMIC_DATA",
        "RECESSION",
        "GEOPOLITICAL",
        "REGULATORY",
        "ELECTION",
        "OTHER",
      ] as const;

      for (const marketType of marketTypes) {
        await repo.saveSnapshot({
          id: `type-${marketType}`,
          platform: "KALSHI",
          marketTicker: `TICKER-${marketType}`,
          marketType,
          snapshotTime: "2024-11-15T10:00:00Z",
          data: { outcomes: [] },
        });
      }

      for (const marketType of marketTypes) {
        const found = await repo.findSnapshotById(`type-${marketType}`);
        expect(found!.marketType).toBe(marketType);
      }
    });
  });

  // ========================================
  // Signal Operations
  // ========================================

  describe("Signals", () => {
    test("saves a computed signal", async () => {
      const input: CreateSignalInput = {
        id: "sig-001",
        signalType: "fed_cut_probability",
        signalValue: 0.75,
        confidence: 0.85,
        computedAt: "2024-11-15T10:00:00Z",
        inputs: {
          sources: [
            { platform: "KALSHI", ticker: "FED-CUT", price: 0.74, weight: 0.6 },
            { platform: "POLYMARKET", ticker: "fed-dec-cut", price: 0.76, weight: 0.4 },
          ],
          method: "weighted_average",
        },
      };

      const result = await repo.saveSignal(input);

      expect(result.id).toBe("sig-001");
      expect(result.signalType).toBe("fed_cut_probability");
      expect(result.signalValue).toBe(0.75);
      expect(result.confidence).toBe(0.85);
      expect(result.inputs.sources).toHaveLength(2);
    });

    test("finds signal by ID", async () => {
      await repo.saveSignal({
        id: "sig-find",
        signalType: "recession_12m",
        signalValue: 0.35,
        computedAt: "2024-11-15T10:00:00Z",
        inputs: { sources: [], method: "test" },
      });

      const found = await repo.findSignalById("sig-find");
      expect(found).not.toBeNull();
      expect(found!.signalType).toBe("recession_12m");
    });

    test("returns null for non-existent signal ID", async () => {
      const found = await repo.findSignalById("nonexistent");
      expect(found).toBeNull();
    });

    test("gets signal history for type", async () => {
      await repo.saveSignal({
        id: "h1",
        signalType: "fed_cut_probability",
        signalValue: 0.7,
        computedAt: "2024-11-01T10:00:00Z",
        inputs: { sources: [], method: "test" },
      });
      await repo.saveSignal({
        id: "h2",
        signalType: "fed_cut_probability",
        signalValue: 0.75,
        computedAt: "2024-11-15T10:00:00Z",
        inputs: { sources: [], method: "test" },
      });
      await repo.saveSignal({
        id: "h3",
        signalType: "recession_12m",
        signalValue: 0.35,
        computedAt: "2024-11-15T10:00:00Z",
        inputs: { sources: [], method: "test" },
      });

      const history = await repo.getSignalHistory("fed_cut_probability");
      expect(history).toHaveLength(2);
      // Should be ordered by computed_at DESC
      expect(history[0]!.signalValue).toBe(0.75);
    });

    test("finds signals with filters", async () => {
      await repo.saveSignal({
        id: "flt1",
        signalType: "fed_cut_probability",
        signalValue: 0.3,
        computedAt: "2024-11-15T10:00:00Z",
        inputs: { sources: [], method: "test" },
      });
      await repo.saveSignal({
        id: "flt2",
        signalType: "fed_cut_probability",
        signalValue: 0.5,
        computedAt: "2024-11-15T11:00:00Z",
        inputs: { sources: [], method: "test" },
      });
      await repo.saveSignal({
        id: "flt3",
        signalType: "fed_cut_probability",
        signalValue: 0.8,
        computedAt: "2024-11-15T12:00:00Z",
        inputs: { sources: [], method: "test" },
      });

      const highValue = await repo.findSignals({
        signalType: "fed_cut_probability",
        minValue: 0.5,
      });
      expect(highValue).toHaveLength(2);

      const rangeValue = await repo.findSignals({
        signalType: "fed_cut_probability",
        minValue: 0.4,
        maxValue: 0.6,
      });
      expect(rangeValue).toHaveLength(1);
      expect(rangeValue[0]!.signalValue).toBe(0.5);
    });

    test("gets latest signals for each type", async () => {
      await repo.saveSignal({
        id: "lat1",
        signalType: "fed_cut_probability",
        signalValue: 0.7,
        computedAt: "2024-11-01T10:00:00Z",
        inputs: { sources: [], method: "test" },
      });
      await repo.saveSignal({
        id: "lat2",
        signalType: "fed_cut_probability",
        signalValue: 0.75,
        computedAt: "2024-11-15T10:00:00Z",
        inputs: { sources: [], method: "test" },
      });
      await repo.saveSignal({
        id: "lat3",
        signalType: "recession_12m",
        signalValue: 0.35,
        computedAt: "2024-11-10T10:00:00Z",
        inputs: { sources: [], method: "test" },
      });

      const latest = await repo.getLatestSignals();
      expect(latest).toHaveLength(2);

      const fedCut = latest.find((s) => s.signalType === "fed_cut_probability");
      expect(fedCut!.signalValue).toBe(0.75);
    });

    test("handles all signal types", async () => {
      const signalTypes = [
        "fed_cut_probability",
        "fed_hike_probability",
        "recession_12m",
        "macro_uncertainty",
        "policy_event_risk",
        "cpi_surprise",
        "gdp_surprise",
        "shutdown_probability",
        "tariff_escalation",
      ] as const;

      for (const signalType of signalTypes) {
        await repo.saveSignal({
          id: `sig-${signalType}`,
          signalType,
          signalValue: 0.5,
          computedAt: "2024-11-15T10:00:00Z",
          inputs: { sources: [], method: "test" },
        });
      }

      for (const signalType of signalTypes) {
        const found = await repo.findSignalById(`sig-${signalType}`);
        expect(found!.signalType).toBe(signalType);
      }
    });
  });

  // ========================================
  // Arbitrage Operations
  // ========================================

  describe("Arbitrage", () => {
    test("saves an arbitrage alert", async () => {
      const input: CreateArbitrageInput = {
        id: "arb-001",
        kalshiTicker: "FED-DEC-CUT",
        polymarketToken: "fed-december-rate-cut",
        kalshiPrice: 0.72,
        polymarketPrice: 0.78,
        divergencePct: 8.33,
        marketType: "FED_RATE",
        detectedAt: "2024-11-15T10:00:00Z",
      };

      const result = await repo.saveArbitrageAlert(input);

      expect(result.id).toBe("arb-001");
      expect(result.kalshiTicker).toBe("FED-DEC-CUT");
      expect(result.polymarketToken).toBe("fed-december-rate-cut");
      expect(result.kalshiPrice).toBe(0.72);
      expect(result.polymarketPrice).toBe(0.78);
      expect(result.divergencePct).toBe(8.33);
      expect(result.resolvedAt).toBeNull();
    });

    test("finds arbitrage alert by ID", async () => {
      await repo.saveArbitrageAlert({
        id: "arb-find",
        kalshiTicker: "TEST",
        polymarketToken: "test",
        kalshiPrice: 0.5,
        polymarketPrice: 0.55,
        divergencePct: 10.0,
        marketType: "OTHER",
        detectedAt: "2024-11-15T10:00:00Z",
      });

      const found = await repo.findArbitrageById("arb-find");
      expect(found).not.toBeNull();
      expect(found!.kalshiTicker).toBe("TEST");
    });

    test("returns null for non-existent arbitrage ID", async () => {
      const found = await repo.findArbitrageById("nonexistent");
      expect(found).toBeNull();
    });

    test("gets unresolved arbitrage alerts", async () => {
      await repo.saveArbitrageAlert({
        id: "ur1",
        kalshiTicker: "A",
        polymarketToken: "a",
        kalshiPrice: 0.5,
        polymarketPrice: 0.6,
        divergencePct: 20.0,
        marketType: "OTHER",
        detectedAt: "2024-11-15T10:00:00Z",
      });
      await repo.saveArbitrageAlert({
        id: "ur2",
        kalshiTicker: "B",
        polymarketToken: "b",
        kalshiPrice: 0.5,
        polymarketPrice: 0.55,
        divergencePct: 10.0,
        marketType: "OTHER",
        detectedAt: "2024-11-15T11:00:00Z",
      });

      await repo.resolveArbitrageAlert("ur1", 0.55);

      const unresolved = await repo.getUnresolvedArbitrageAlerts();
      expect(unresolved).toHaveLength(1);
      expect(unresolved[0]!.id).toBe("ur2");
    });

    test("resolves an arbitrage alert", async () => {
      await repo.saveArbitrageAlert({
        id: "res-1",
        kalshiTicker: "RES",
        polymarketToken: "res",
        kalshiPrice: 0.5,
        polymarketPrice: 0.6,
        divergencePct: 20.0,
        marketType: "OTHER",
        detectedAt: "2024-11-15T10:00:00Z",
      });

      const resolved = await repo.resolveArbitrageAlert("res-1", 0.55);

      expect(resolved.resolvedAt).not.toBeNull();
      expect(resolved.resolutionPrice).toBe(0.55);
    });

    test("resolveArbitrageAlert throws for non-existent ID", async () => {
      await expect(repo.resolveArbitrageAlert("nonexistent", 0.5)).rejects.toThrow(RepositoryError);
    });

    test("finds arbitrage alerts with filters", async () => {
      await repo.saveArbitrageAlert({
        id: "fa1",
        kalshiTicker: "A",
        polymarketToken: "a",
        kalshiPrice: 0.5,
        polymarketPrice: 0.55,
        divergencePct: 10.0,
        marketType: "OTHER",
        detectedAt: "2024-11-01T10:00:00Z",
      });
      await repo.saveArbitrageAlert({
        id: "fa2",
        kalshiTicker: "B",
        polymarketToken: "b",
        kalshiPrice: 0.5,
        polymarketPrice: 0.6,
        divergencePct: 20.0,
        marketType: "OTHER",
        detectedAt: "2024-11-15T10:00:00Z",
      });

      await repo.resolveArbitrageAlert("fa1", 0.52);

      const minDivergence = await repo.findArbitrageAlerts({ minDivergence: 15.0 });
      expect(minDivergence).toHaveLength(1);

      const unresolvedOnly = await repo.findArbitrageAlerts({ resolved: false });
      expect(unresolvedOnly).toHaveLength(1);
      expect(unresolvedOnly[0]!.id).toBe("fa2");

      const resolvedOnly = await repo.findArbitrageAlerts({ resolved: true });
      expect(resolvedOnly).toHaveLength(1);
      expect(resolvedOnly[0]!.id).toBe("fa1");
    });

    test("unresolved alerts ordered by divergence DESC", async () => {
      await repo.saveArbitrageAlert({
        id: "ord1",
        kalshiTicker: "A",
        polymarketToken: "a",
        kalshiPrice: 0.5,
        polymarketPrice: 0.55,
        divergencePct: 10.0,
        marketType: "OTHER",
        detectedAt: "2024-11-15T10:00:00Z",
      });
      await repo.saveArbitrageAlert({
        id: "ord2",
        kalshiTicker: "B",
        polymarketToken: "b",
        kalshiPrice: 0.5,
        polymarketPrice: 0.65,
        divergencePct: 30.0,
        marketType: "OTHER",
        detectedAt: "2024-11-15T10:00:00Z",
      });
      await repo.saveArbitrageAlert({
        id: "ord3",
        kalshiTicker: "C",
        polymarketToken: "c",
        kalshiPrice: 0.5,
        polymarketPrice: 0.6,
        divergencePct: 20.0,
        marketType: "OTHER",
        detectedAt: "2024-11-15T10:00:00Z",
      });

      const alerts = await repo.getUnresolvedArbitrageAlerts();
      expect(alerts[0]!.divergencePct).toBe(30.0);
      expect(alerts[1]!.divergencePct).toBe(20.0);
      expect(alerts[2]!.divergencePct).toBe(10.0);
    });
  });

  // ========================================
  // Data Retention and Stats
  // ========================================

  describe("Data Retention", () => {
    test("prunes old data", async () => {
      // Insert old data directly with old created_at timestamps
      // (pruneOldData uses created_at, not the business timestamps)
      const oldTime = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const recentTime = new Date().toISOString();

      // Insert old records directly with old created_at
      await client.run(
        `INSERT INTO prediction_market_snapshots (id, platform, market_ticker, market_type, snapshot_time, data, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ["old-snap", "KALSHI", "OLD", "OTHER", oldTime, '{"outcomes":[]}', oldTime]
      );
      await client.run(
        `INSERT INTO prediction_market_signals (id, signal_type, signal_value, computed_at, inputs, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ["old-sig", "recession_12m", 0.5, oldTime, '{"sources":[],"method":"test"}', oldTime]
      );
      await client.run(
        `INSERT INTO prediction_market_arbitrage (id, kalshi_ticker, polymarket_token, kalshi_price, polymarket_price, divergence_pct, market_type, detected_at, resolved_at, resolution_price, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ["old-arb", "OLD", "old", 0.5, 0.55, 10.0, "OTHER", oldTime, recentTime, 0.52, oldTime]
      );

      // Add recent data normally
      await repo.saveSnapshot({
        id: "new-snap",
        platform: "KALSHI",
        marketTicker: "NEW",
        marketType: "OTHER",
        snapshotTime: recentTime,
        data: { outcomes: [] },
      });
      await repo.saveSignal({
        id: "new-sig",
        signalType: "recession_12m",
        signalValue: 0.5,
        computedAt: recentTime,
        inputs: { sources: [], method: "test" },
      });

      // Prune data older than 1 day
      const result = await repo.pruneOldData(1);

      expect(result.snapshots).toBe(1);
      expect(result.signals).toBe(1);
      expect(result.arbitrage).toBe(1);

      // New data should still exist
      expect(await repo.findSnapshotById("new-snap")).not.toBeNull();
      expect(await repo.findSignalById("new-sig")).not.toBeNull();

      // Old data should be gone
      expect(await repo.findSnapshotById("old-snap")).toBeNull();
      expect(await repo.findSignalById("old-sig")).toBeNull();
    });

    test("pruneOldData does not delete unresolved arbitrage", async () => {
      const oldTime = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

      // Insert old unresolved arbitrage directly with old created_at
      await client.run(
        `INSERT INTO prediction_market_arbitrage (id, kalshi_ticker, polymarket_token, kalshi_price, polymarket_price, divergence_pct, market_type, detected_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ["unres-old", "OLD", "old", 0.5, 0.55, 10.0, "OTHER", oldTime, oldTime]
      );

      const result = await repo.pruneOldData(1);
      expect(result.arbitrage).toBe(0);

      expect(await repo.findArbitrageById("unres-old")).not.toBeNull();
    });

    test("gets storage statistics", async () => {
      await repo.saveSnapshot({
        id: "stat-snap1",
        platform: "KALSHI",
        marketTicker: "STAT",
        marketType: "OTHER",
        snapshotTime: "2024-11-01T10:00:00Z",
        data: { outcomes: [] },
      });
      await repo.saveSnapshot({
        id: "stat-snap2",
        platform: "KALSHI",
        marketTicker: "STAT",
        marketType: "OTHER",
        snapshotTime: "2024-11-15T10:00:00Z",
        data: { outcomes: [] },
      });
      await repo.saveSignal({
        id: "stat-sig",
        signalType: "recession_12m",
        signalValue: 0.5,
        computedAt: "2024-11-15T10:00:00Z",
        inputs: { sources: [], method: "test" },
      });
      await repo.saveArbitrageAlert({
        id: "stat-arb1",
        kalshiTicker: "A",
        polymarketToken: "a",
        kalshiPrice: 0.5,
        polymarketPrice: 0.55,
        divergencePct: 10.0,
        marketType: "OTHER",
        detectedAt: "2024-11-15T10:00:00Z",
      });
      await repo.saveArbitrageAlert({
        id: "stat-arb2",
        kalshiTicker: "B",
        polymarketToken: "b",
        kalshiPrice: 0.5,
        polymarketPrice: 0.6,
        divergencePct: 20.0,
        marketType: "OTHER",
        detectedAt: "2024-11-15T11:00:00Z",
      });
      await repo.resolveArbitrageAlert("stat-arb1", 0.52);

      const stats = await repo.getStats();

      expect(stats.snapshotCount).toBe(2);
      expect(stats.signalCount).toBe(1);
      expect(stats.arbitrageCount).toBe(2);
      expect(stats.unresolvedArbitrageCount).toBe(1);
      expect(stats.oldestSnapshot).toBe("2024-11-01T10:00:00Z");
      expect(stats.newestSnapshot).toBe("2024-11-15T10:00:00Z");
    });

    test("getStats returns zeros when empty", async () => {
      const stats = await repo.getStats();

      expect(stats.snapshotCount).toBe(0);
      expect(stats.signalCount).toBe(0);
      expect(stats.arbitrageCount).toBe(0);
      expect(stats.unresolvedArbitrageCount).toBe(0);
      expect(stats.oldestSnapshot).toBeNull();
      expect(stats.newestSnapshot).toBeNull();
    });
  });
});
