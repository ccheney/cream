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
import { createNodeLogger, type LifecycleLogger } from "@cream/logger";

const log: LifecycleLogger = createNodeLogger({
  service: "fetch-alphavantage-fixtures",
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
const FIXTURES_DIR = join(PROJECT_ROOT, "packages/marketdata/fixtures/alphavantage");

const BASE_URL = "https://www.alphavantage.co/query";

// Rate limit delay (5 seconds between requests)
const RATE_LIMIT_DELAY_MS = 5000;

// ============================================
// Environment Validation
// ============================================

const ALPHAVANTAGE_KEY = Bun.env.ALPHAVANTAGE_KEY;

if (!ALPHAVANTAGE_KEY) {
  log.error(
    { required: "ALPHAVANTAGE_KEY" },
    "Missing required environment variable. Create .env.local with your Alpha Vantage API key. Sign up at: https://www.alphavantage.co/support/#api-key"
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
  log.info({ description, function: params.function }, "Fetching endpoint");

  try {
    const res = await fetch(url);

    if (!res.ok) {
      const body = await res.text();
      log.error({ description, status: res.status, body: body.slice(0, 200) }, "HTTP error");
      return false;
    }

    const data = await res.json();

    // Check for API error response
    if (data.Note || data["Error Message"]) {
      log.error({ description, apiError: data.Note || data["Error Message"] }, "API error");
      return false;
    }

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
  log.info(
    { baseUrl: BASE_URL, outputDir: FIXTURES_DIR, rateLimitSeconds: RATE_LIMIT_DELAY_MS / 1000 },
    "Alpha Vantage Macro Indicator Fixture Generator starting"
  );

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

  log.info({ delaySeconds: RATE_LIMIT_DELAY_MS / 1000 }, "Waiting for rate limit");
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

  log.info({ delaySeconds: RATE_LIMIT_DELAY_MS / 1000 }, "Waiting for rate limit");
  await sleep(RATE_LIMIT_DELAY_MS);

  // 3. CPI (Inflation)
  if (await fetchAndSave({ function: "CPI" }, "cpi.json", "Consumer Price Index")) {
    success++;
  } else {
    failed++;
  }

  log.info({ delaySeconds: RATE_LIMIT_DELAY_MS / 1000 }, "Waiting for rate limit");
  await sleep(RATE_LIMIT_DELAY_MS);

  // 4. Unemployment Rate
  if (await fetchAndSave({ function: "UNEMPLOYMENT" }, "unemployment.json", "Unemployment Rate")) {
    success++;
  } else {
    failed++;
  }

  log.info({ delaySeconds: RATE_LIMIT_DELAY_MS / 1000 }, "Waiting for rate limit");
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
  log.info({ success, failed }, "Alpha Vantage fixtures complete");

  if (failed > 0) {
    log.warn({}, "Some fetches failed. Check your API key and daily limit (25 req/day).");
  }
}

main().catch((err) => {
  log.error({ error: err instanceof Error ? err.message : String(err) }, "Fatal error");
  process.exit(1);
});
