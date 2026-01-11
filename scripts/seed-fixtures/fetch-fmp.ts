#!/usr/bin/env bun
/**
 * Fetch Financial Modeling Prep (FMP) Fixtures
 *
 * Captures fundamentals, transcripts, and sentiment for development fixtures.
 *
 * Usage: bun scripts/seed-fixtures/fetch-fmp.ts
 *
 * Note: Free tier is 250 req/day. Run early in the day.
 *
 * @see docs/plans/17-mock-data-layer.md
 */

import { mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createNodeLogger, type LifecycleLogger } from "@cream/logger";

const log: LifecycleLogger = createNodeLogger({
  service: "fetch-fmp-fixtures",
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
const FIXTURES_DIR = join(PROJECT_ROOT, "packages/marketdata/fixtures/fmp");

const BASE_URL = "https://financialmodelingprep.com/api";

// ============================================
// Environment Validation
// ============================================

const FMP_KEY = Bun.env.FMP_KEY;

if (!FMP_KEY) {
  log.error(
    { required: "FMP_KEY" },
    "Missing required environment variable. Create .env.local with your FMP API key. Sign up at: https://site.financialmodelingprep.com/register"
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

async function fetchAndSave(
  endpoint: string,
  filename: string,
  description: string
): Promise<boolean> {
  const url = `${BASE_URL}${endpoint}${endpoint.includes("?") ? "&" : "?"}apikey=${FMP_KEY}`;
  log.info({ description, endpoint }, "Fetching endpoint");

  try {
    const res = await fetch(url);

    if (!res.ok) {
      const body = await res.text();
      log.error({ description, status: res.status, body: body.slice(0, 200) }, "HTTP error");
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
  log.info({ baseUrl: BASE_URL, outputDir: FIXTURES_DIR }, "Financial Modeling Prep Fixture Generator starting");

  // Ensure fixtures directory exists
  await ensureDirectory(FIXTURES_DIR);

  let success = 0;
  let failed = 0;

  // 1. Company profile
  if (await fetchAndSave("/v3/profile/AAPL", "profile-AAPL.json", "Company profile AAPL")) {
    success++;
  } else {
    failed++;
  }

  // 2. Income statement (annual)
  if (
    await fetchAndSave(
      "/v3/income-statement/AAPL?limit=5",
      "income-statement-AAPL.json",
      "Income statement AAPL"
    )
  ) {
    success++;
  } else {
    failed++;
  }

  // 3. Balance sheet (annual)
  if (
    await fetchAndSave(
      "/v3/balance-sheet-statement/AAPL?limit=5",
      "balance-sheet-AAPL.json",
      "Balance sheet AAPL"
    )
  ) {
    success++;
  } else {
    failed++;
  }

  // 4. Cash flow statement
  if (
    await fetchAndSave(
      "/v3/cash-flow-statement/AAPL?limit=5",
      "cash-flow-AAPL.json",
      "Cash flow AAPL"
    )
  ) {
    success++;
  } else {
    failed++;
  }

  // 5. Key metrics
  if (await fetchAndSave("/v3/key-metrics/AAPL?limit=5", "key-metrics-AAPL.json", "Key metrics AAPL")) {
    success++;
  } else {
    failed++;
  }

  // 6. Financial ratios
  if (await fetchAndSave("/v3/ratios/AAPL?limit=5", "ratios-AAPL.json", "Financial ratios AAPL")) {
    success++;
  } else {
    failed++;
  }

  // 7. Earnings calendar
  if (
    await fetchAndSave(
      "/v3/earning_calendar?from=2025-01-01&to=2025-12-31",
      "earnings-calendar.json",
      "Earnings calendar"
    )
  ) {
    success++;
  } else {
    failed++;
  }

  // 8. Stock news
  if (await fetchAndSave("/v3/stock_news?tickers=AAPL&limit=10", "news-AAPL.json", "Stock news AAPL")) {
    success++;
  } else {
    failed++;
  }

  // 9. Press releases
  if (
    await fetchAndSave(
      "/v3/press-releases/AAPL?limit=5",
      "press-releases-AAPL.json",
      "Press releases AAPL"
    )
  ) {
    success++;
  } else {
    failed++;
  }

  // 10. SEC filings
  if (
    await fetchAndSave("/v3/sec_filings/AAPL?limit=10", "sec-filings-AAPL.json", "SEC filings AAPL")
  ) {
    success++;
  } else {
    failed++;
  }

  // Summary
  log.info({ success, failed }, "FMP fixtures complete");

  if (failed > 0) {
    log.warn({}, "Some fetches failed. Check your API key and daily limit.");
  }
}

main().catch((err) => {
  log.error({ error: err instanceof Error ? err.message : String(err) }, "Fatal error");
  process.exit(1);
});
