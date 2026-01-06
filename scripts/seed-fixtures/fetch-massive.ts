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
  console.error("❌ Missing required environment variable: POLYGON_KEY");
  console.error("\nCreate .env.local with your Polygon/Massive.com API key.");
  console.error("Sign up at: https://dashboard.massive.com/signup");
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
  console.log(`→ Fetching ${description}...`);

  try {
    const res = await fetch(url);

    if (!res.ok) {
      const body = await res.text();
      console.error(`  ✗ HTTP ${res.status}: ${body.slice(0, 200)}`);

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
        console.log(`  ⚠ Saved error response to ${filename}`);
      }
      return false;
    }

    const data = await res.json();
    const filepath = join(FIXTURES_DIR, filename);
    await Bun.write(filepath, JSON.stringify(data, null, 2));
    console.log(`  ✓ Saved to ${filename}`);
    return true;
  } catch (err) {
    console.error(`  ✗ Error: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

// ============================================
// Main
// ============================================

async function main(): Promise<void> {
  console.log("\n🟣 Massive.com (Polygon.io) Fixture Generator\n");
  console.log(`Using API: ${BASE_URL}`);
  console.log(`Output: ${FIXTURES_DIR}`);
  console.log(`Rate limit: ${RATE_LIMIT_DELAY_MS / 1000}s between requests\n`);

  // Ensure fixtures directory exists
  await ensureDirectory(FIXTURES_DIR);

  const { from, to } = getDateRange();
  console.log(`Date range: ${from} to ${to}\n`);

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

  console.log(`  (waiting ${RATE_LIMIT_DELAY_MS / 1000}s for rate limit...)`);
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

  console.log(`  (waiting ${RATE_LIMIT_DELAY_MS / 1000}s for rate limit...)`);
  await sleep(RATE_LIMIT_DELAY_MS);

  // 3. Fetch latest quote for AAPL
  if (await fetchAndSave("/v3/quotes/AAPL?limit=1", "quote-AAPL.json", "Latest quote AAPL")) {
    success++;
  } else {
    failed++;
  }

  console.log(`  (waiting ${RATE_LIMIT_DELAY_MS / 1000}s for rate limit...)`);
  await sleep(RATE_LIMIT_DELAY_MS);

  // 4. Fetch trades for AAPL
  if (await fetchAndSave("/v3/trades/AAPL?limit=100", "trades-AAPL.json", "Trades AAPL")) {
    success++;
  } else {
    failed++;
  }

  console.log(`  (waiting ${RATE_LIMIT_DELAY_MS / 1000}s for rate limit...)`);
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
  console.log("\n" + "─".repeat(40));
  console.log(`✓ Massive fixtures complete: ${success} succeeded, ${failed} failed`);

  if (failed > 0) {
    console.log("\n⚠️  Some fetches failed. This may be expected for free tier limitations.");
    console.log("   Option chain endpoints require a paid subscription.");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
