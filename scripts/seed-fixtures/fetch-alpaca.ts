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
  console.error("❌ Missing required environment variables:");
  console.error("   - ALPACA_KEY");
  console.error("   - ALPACA_SECRET");
  console.error("\nCreate .env.local with your Alpaca paper trading credentials.");
  console.error("Sign up at: https://app.alpaca.markets/signup");
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
  console.log(`→ Fetching ${endpoint}...`);

  try {
    const res = await fetch(url, { headers: HEADERS });

    if (!res.ok) {
      const body = await res.text();
      console.error(`  ✗ HTTP ${res.status}: ${body.slice(0, 200)}`);
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

async function submitTestOrder(): Promise<{ orderId: string | null; success: boolean }> {
  console.log("→ Submitting test order (will cancel immediately)...");

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
      console.error(`  ✗ HTTP ${res.status}: ${body.slice(0, 200)}`);
      return { orderId: null, success: false };
    }

    const data = await res.json();
    const filepath = join(FIXTURES_DIR, "order-response.json");
    await Bun.write(filepath, JSON.stringify(data, null, 2));
    console.log(`  ✓ Saved order response to order-response.json`);

    return { orderId: data.id, success: true };
  } catch (err) {
    console.error(`  ✗ Error: ${err instanceof Error ? err.message : String(err)}`);
    return { orderId: null, success: false };
  }
}

async function cancelOrder(orderId: string): Promise<boolean> {
  console.log(`→ Canceling test order ${orderId}...`);

  try {
    const res = await fetch(`${BASE_URL}/v2/orders/${orderId}`, {
      method: "DELETE",
      headers: HEADERS,
    });

    if (res.status === 204 || res.ok) {
      console.log("  ✓ Order canceled successfully");
      return true;
    }

    const body = await res.text();
    console.error(`  ✗ HTTP ${res.status}: ${body.slice(0, 200)}`);
    return false;
  } catch (err) {
    console.error(`  ✗ Error: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

// ============================================
// Main
// ============================================

async function main(): Promise<void> {
  console.log("\n🔵 Alpaca Paper Trading Fixture Generator\n");
  console.log(`Using API: ${BASE_URL}`);
  console.log(`Output: ${FIXTURES_DIR}\n`);

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
  console.log("\n" + "─".repeat(40));
  console.log(`✓ Alpaca fixtures complete: ${success} succeeded, ${failed} failed`);

  if (failed > 0) {
    console.log("\n⚠️  Some fetches failed. Check your API credentials and try again.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
