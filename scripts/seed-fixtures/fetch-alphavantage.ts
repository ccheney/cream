#!/usr/bin/env bun
/**
 * Fetch Alpha Vantage Macro Indicator Fixtures
 *
 * Captures economic indicators (GDP, inflation, unemployment, etc.) for development fixtures.
 *
 * Usage: bun scripts/seed-fixtures/fetch-alphavantage.ts
 *
 * Note: Free tier is 25 req/day. Script fetches 5 endpoints.
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
const FIXTURES_DIR = join(PROJECT_ROOT, "packages/marketdata/fixtures/alphavantage");

const BASE_URL = "https://www.alphavantage.co/query";

// Rate limit delay (5 seconds between requests)
const RATE_LIMIT_DELAY_MS = 5000;

// ============================================
// Environment Validation
// ============================================

const ALPHAVANTAGE_KEY = Bun.env.ALPHAVANTAGE_KEY;

if (!ALPHAVANTAGE_KEY) {
  console.error("❌ Missing required environment variable: ALPHAVANTAGE_KEY");
  console.error("\nCreate .env.local with your Alpha Vantage API key.");
  console.error("Sign up at: https://www.alphavantage.co/support/#api-key");
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

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchAndSave(
  params: Record<string, string>,
  filename: string,
  description: string
): Promise<boolean> {
  const searchParams = new URLSearchParams({
    ...params,
    apikey: ALPHAVANTAGE_KEY,
  });
  const url = `${BASE_URL}?${searchParams}`;
  console.log(`→ Fetching ${description}...`);

  try {
    const res = await fetch(url);

    if (!res.ok) {
      const body = await res.text();
      console.error(`  ✗ HTTP ${res.status}: ${body.slice(0, 200)}`);
      return false;
    }

    const data = await res.json();

    // Check for API error response
    if (data.Note || data["Error Message"]) {
      console.error(`  ✗ API Error: ${data.Note || data["Error Message"]}`);
      return false;
    }

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
  console.log("\n🔵 Alpha Vantage Macro Indicator Fixture Generator\n");
  console.log(`Using API: ${BASE_URL}`);
  console.log(`Output: ${FIXTURES_DIR}`);
  console.log(`Rate limit: ${RATE_LIMIT_DELAY_MS / 1000}s between requests\n`);

  // Ensure fixtures directory exists
  await ensureDirectory(FIXTURES_DIR);

  let success = 0;
  let failed = 0;

  // 1. Real GDP
  if (await fetchAndSave({ function: "REAL_GDP" }, "real-gdp.json", "Real GDP")) {
    success++;
  } else {
    failed++;
  }

  console.log(`  (waiting ${RATE_LIMIT_DELAY_MS / 1000}s for rate limit...)`);
  await sleep(RATE_LIMIT_DELAY_MS);

  // 2. Federal Funds Rate
  if (
    await fetchAndSave(
      { function: "FEDERAL_FUNDS_RATE" },
      "federal-funds-rate.json",
      "Federal Funds Rate"
    )
  ) {
    success++;
  } else {
    failed++;
  }

  console.log(`  (waiting ${RATE_LIMIT_DELAY_MS / 1000}s for rate limit...)`);
  await sleep(RATE_LIMIT_DELAY_MS);

  // 3. CPI (Inflation)
  if (await fetchAndSave({ function: "CPI" }, "cpi.json", "Consumer Price Index")) {
    success++;
  } else {
    failed++;
  }

  console.log(`  (waiting ${RATE_LIMIT_DELAY_MS / 1000}s for rate limit...)`);
  await sleep(RATE_LIMIT_DELAY_MS);

  // 4. Unemployment Rate
  if (await fetchAndSave({ function: "UNEMPLOYMENT" }, "unemployment.json", "Unemployment Rate")) {
    success++;
  } else {
    failed++;
  }

  console.log(`  (waiting ${RATE_LIMIT_DELAY_MS / 1000}s for rate limit...)`);
  await sleep(RATE_LIMIT_DELAY_MS);

  // 5. Treasury Yield (10 year)
  if (
    await fetchAndSave(
      { function: "TREASURY_YIELD", interval: "monthly", maturity: "10year" },
      "treasury-yield-10y.json",
      "10-Year Treasury Yield"
    )
  ) {
    success++;
  } else {
    failed++;
  }

  // Summary
  console.log("\n" + "─".repeat(40));
  console.log(`✓ Alpha Vantage fixtures complete: ${success} succeeded, ${failed} failed`);

  if (failed > 0) {
    console.log("\n⚠️  Some fetches failed. Check your API key and daily limit (25 req/day).");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
