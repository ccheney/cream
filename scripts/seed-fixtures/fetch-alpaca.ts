#!/usr/bin/env bun
/**
 * Fetch Alpaca Paper Trading Fixtures
 *
 * Captures account info, positions, orders, and order submission response
 * from Alpaca paper trading API for development fixtures.
 *
 * Usage: bun scripts/seed-fixtures/fetch-alpaca.ts
 *
 * @see docs/plans/17-mock-data-layer.md
 */

import { mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createNodeLogger, type LifecycleLogger } from "@cream/logger";

const log: LifecycleLogger = createNodeLogger({
  service: "fetch-alpaca-fixtures",
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
const FIXTURES_DIR = join(PROJECT_ROOT, "packages/marketdata/fixtures/alpaca");

const BASE_URL = "https://paper-api.alpaca.markets";

// ============================================
// Environment Validation
// ============================================

const ALPACA_KEY = Bun.env.ALPACA_KEY;
const ALPACA_SECRET = Bun.env.ALPACA_SECRET;

if (!ALPACA_KEY || !ALPACA_SECRET) {
  log.error(
    { required: ["ALPACA_KEY", "ALPACA_SECRET"] },
    "Missing required environment variables. Create .env.local with your Alpaca paper trading credentials. Sign up at: https://app.alpaca.markets/signup"
  );
  process.exit(1);
}

const HEADERS = {
  "APCA-API-KEY-ID": ALPACA_KEY,
  "APCA-API-SECRET-KEY": ALPACA_SECRET,
  "Content-Type": "application/json",
};

// ============================================
// Utility Functions
// ============================================

async function ensureDirectory(dir: string): Promise<void> {
  try {
    await mkdir(dir, { recursive: true });
  } catch (err) {
    // Directory already exists
  }
}

async function fetchAndSave(endpoint: string, filename: string): Promise<boolean> {
  const url = `${BASE_URL}${endpoint}`;
  log.info({ endpoint }, "Fetching endpoint");

  try {
    const res = await fetch(url, { headers: HEADERS });

    if (!res.ok) {
      const body = await res.text();
      log.error({ endpoint, status: res.status, body: body.slice(0, 200) }, "HTTP error");
      return false;
    }

    const data = await res.json();
    const filepath = join(FIXTURES_DIR, filename);
    await Bun.write(filepath, JSON.stringify(data, null, 2));
    log.info({ filename }, "Saved fixture");
    return true;
  } catch (err) {
    log.error({ endpoint, error: err instanceof Error ? err.message : String(err) }, "Fetch error");
    return false;
  }
}

async function submitTestOrder(): Promise<{ orderId: string | null; success: boolean }> {
  log.info({}, "Submitting test order (will cancel immediately)");

  const orderRequest = {
    symbol: "AAPL",
    qty: "1",
    side: "buy",
    type: "limit",
    time_in_force: "day",
    limit_price: "100.00", // Intentionally low to avoid fill
  };

  try {
    const res = await fetch(`${BASE_URL}/v2/orders`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify(orderRequest),
    });

    if (!res.ok) {
      const body = await res.text();
      log.error({ status: res.status, body: body.slice(0, 200) }, "Order submission HTTP error");
      return { orderId: null, success: false };
    }

    const data = await res.json();
    const filepath = join(FIXTURES_DIR, "order-response.json");
    await Bun.write(filepath, JSON.stringify(data, null, 2));
    log.info({ filename: "order-response.json" }, "Saved order response");

    return { orderId: data.id, success: true };
  } catch (err) {
    log.error({ error: err instanceof Error ? err.message : String(err) }, "Order submission error");
    return { orderId: null, success: false };
  }
}

async function cancelOrder(orderId: string): Promise<boolean> {
  log.info({ orderId }, "Canceling test order");

  try {
    const res = await fetch(`${BASE_URL}/v2/orders/${orderId}`, {
      method: "DELETE",
      headers: HEADERS,
    });

    if (res.status === 204 || res.ok) {
      log.info({ orderId }, "Order canceled successfully");
      return true;
    }

    const body = await res.text();
    log.error({ orderId, status: res.status, body: body.slice(0, 200) }, "Order cancellation HTTP error");
    return false;
  } catch (err) {
    log.error({ orderId, error: err instanceof Error ? err.message : String(err) }, "Order cancellation error");
    return false;
  }
}

// ============================================
// Main
// ============================================

async function main(): Promise<void> {
  log.info({ baseUrl: BASE_URL, outputDir: FIXTURES_DIR }, "Alpaca Paper Trading Fixture Generator starting");

  // Ensure fixtures directory exists
  await ensureDirectory(FIXTURES_DIR);

  let success = 0;
  let failed = 0;

  // 1. Fetch account info
  if (await fetchAndSave("/v2/account", "account.json")) {
    success++;
  } else {
    failed++;
  }

  // 2. Fetch positions (may be empty for new accounts)
  if (await fetchAndSave("/v2/positions", "positions.json")) {
    success++;
  } else {
    failed++;
  }

  // 3. Fetch recent orders
  if (await fetchAndSave("/v2/orders?status=all&limit=10", "orders.json")) {
    success++;
  } else {
    failed++;
  }

  // 4. Submit and cancel test order
  const { orderId, success: orderSuccess } = await submitTestOrder();
  if (orderSuccess) {
    success++;
  } else {
    failed++;
  }

  // 5. Cancel test order if it was submitted
  if (orderId) {
    // Small delay to ensure order is registered
    await new Promise((resolve) => setTimeout(resolve, 500));
    await cancelOrder(orderId);
  }

  // Summary
  log.info({ success, failed }, "Alpaca fixtures complete");

  if (failed > 0) {
    log.warn({}, "Some fetches failed. Check your API credentials and try again.");
    process.exit(1);
  }
}

main().catch((err) => {
  log.error({ error: err instanceof Error ? err.message : String(err) }, "Fatal error");
  process.exit(1);
});
