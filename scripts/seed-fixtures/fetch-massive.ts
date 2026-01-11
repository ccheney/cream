#!/usr/bin/env bun
/**
 * Fetch Massive.com (Polygon.io) Market Data Fixtures
 *
 * Captures candles, quotes, trades, and option chains for development fixtures.
 *
 * Usage: bun scripts/seed-fixtures/fetch-massive.ts
 *
 * Note: Rate limit is 5 req/min on free tier. Script adds delays.
 *
 * @see docs/plans/17-mock-data-layer.md
 */

import { mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createNodeLogger, type LifecycleLogger } from "@cream/logger";

const log: LifecycleLogger = createNodeLogger({
  service: "fetch-massive-fixtures",
  level: "info",
  environment: process.env.CREAM_ENV ?? "BACKTEST",
  pretty: true,
});

// ============================================
// Configuration
// ============================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, "../..");
const FIXTURES_DIR = join(PROJECT_ROOT, "packages/marketdata/fixtures/massive");

const BASE_URL = "https://api.polygon.io";

// Rate limit delay (15 seconds between requests for 5 req/min limit)
const RATE_LIMIT_DELAY_MS = 15000;

// ============================================
// Environment Validation
// ============================================

const POLYGON_KEY = Bun.env.POLYGON_KEY;

if (!POLYGON_KEY) {
  log.error(
    { required: "POLYGON_KEY" },
    "Missing required environment variable. Create .env.local with your Polygon/Massive.com API key. Sign up at: https://dashboard.massive.com/signup"
  );
  process.exit(1);
}

// ============================================
// Utility Functions
// ============================================

async function ensureDirectory(dir: string): Promise<void> {
  try {
    await mkdir(dir, { recursive: true });
  } catch {
    // Directory already exists
  }
}

function getDateRange(): { from: string; to: string } {
  const now = new Date();

  // Yesterday
  const to = new Date(now);
  to.setDate(to.getDate() - 1);

  // 7 days ago
  const from = new Date(now);
  from.setDate(from.getDate() - 7);

  return {
    from: from.toISOString().split("T")[0],
    to: to.toISOString().split("T")[0],
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchAndSave(
  endpoint: string,
  filename: string,
  description: string
): Promise<boolean> {
  const url = `${BASE_URL}${endpoint}${endpoint.includes("?") ? "&" : "?"}apiKey=${POLYGON_KEY}`;
  log.info({ description, endpoint }, "Fetching endpoint");

  try {
    const res = await fetch(url);

    if (!res.ok) {
      const body = await res.text();
      log.error({ description, status: res.status, body: body.slice(0, 200) }, "HTTP error");

      // Save error response for testing purposes
      if (res.status === 403) {
        const filepath = join(FIXTURES_DIR, filename);
        await Bun.write(
          filepath,
          JSON.stringify(
            {
              error: true,
              status: res.status,
              message: "Requires paid tier",
              body: body.slice(0, 500),
            },
            null,
            2
          )
        );
        log.warn({ filename }, "Saved error response (requires paid tier)");
      }
      return false;
    }

    const data = await res.json();
    const filepath = join(FIXTURES_DIR, filename);
    await Bun.write(filepath, JSON.stringify(data, null, 2));
    log.info({ filename }, "Saved fixture");
    return true;
  } catch (err) {
    log.error({ description, error: err instanceof Error ? err.message : String(err) }, "Fetch error");
    return false;
  }
}

// ============================================
// Main
// ============================================

async function main(): Promise<void> {
  const { from, to } = getDateRange();
  log.info(
    { baseUrl: BASE_URL, outputDir: FIXTURES_DIR, rateLimitSeconds: RATE_LIMIT_DELAY_MS / 1000, from, to },
    "Massive.com (Polygon.io) Fixture Generator starting"
  );

  // Ensure fixtures directory exists
  await ensureDirectory(FIXTURES_DIR);

  let success = 0;
  let failed = 0;

  // 1. Fetch 1-hour candles for AAPL
  if (
    await fetchAndSave(
      `/v2/aggs/ticker/AAPL/range/1/hour/${from}/${to}?adjusted=true&sort=asc`,
      "candles-1h-AAPL.json",
      "1-hour candles AAPL"
    )
  ) {
    success++;
  } else {
    failed++;
  }

  log.info({ delaySeconds: RATE_LIMIT_DELAY_MS / 1000 }, "Waiting for rate limit");
  await sleep(RATE_LIMIT_DELAY_MS);

  // 2. Fetch daily candles for SPY
  if (
    await fetchAndSave(
      `/v2/aggs/ticker/SPY/range/1/day/${from}/${to}?adjusted=true&sort=asc`,
      "candles-1d-SPY.json",
      "Daily candles SPY"
    )
  ) {
    success++;
  } else {
    failed++;
  }

  log.info({ delaySeconds: RATE_LIMIT_DELAY_MS / 1000 }, "Waiting for rate limit");
  await sleep(RATE_LIMIT_DELAY_MS);

  // 3. Fetch latest quote for AAPL
  if (await fetchAndSave("/v3/quotes/AAPL?limit=1", "quote-AAPL.json", "Latest quote AAPL")) {
    success++;
  } else {
    failed++;
  }

  log.info({ delaySeconds: RATE_LIMIT_DELAY_MS / 1000 }, "Waiting for rate limit");
  await sleep(RATE_LIMIT_DELAY_MS);

  // 4. Fetch trades for AAPL
  if (await fetchAndSave("/v3/trades/AAPL?limit=100", "trades-AAPL.json", "Trades AAPL")) {
    success++;
  } else {
    failed++;
  }

  log.info({ delaySeconds: RATE_LIMIT_DELAY_MS / 1000 }, "Waiting for rate limit");
  await sleep(RATE_LIMIT_DELAY_MS);

  // 5. Fetch option chain for AAPL (may fail on free tier)
  if (
    await fetchAndSave(
      "/v3/snapshot/options/AAPL?limit=10",
      "option-chain-AAPL.json",
      "Option chain AAPL (may fail on free tier)"
    )
  ) {
    success++;
  } else {
    failed++;
  }

  // Summary
  log.info({ success, failed }, "Massive fixtures complete");

  if (failed > 0) {
    log.warn(
      {},
      "Some fetches failed. This may be expected for free tier limitations. Option chain endpoints require a paid subscription."
    );
  }
}

main().catch((err) => {
  log.error({ error: err instanceof Error ? err.message : String(err) }, "Fatal error");
  process.exit(1);
});
