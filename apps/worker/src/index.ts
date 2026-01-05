/**
 * @cream/worker - Hourly Scheduler
 *
 * Triggers the trading cycle workflow every hour, aligned to candle closes.
 * Runs the OODA loop: Observe -> Orient -> Decide -> Act
 */

import { mastra, tradingCycleWorkflow } from "@cream/api";

// ============================================
// Configuration
// ============================================

const CONFIG = {
  /** Interval in milliseconds (1 hour) */
  intervalMs: 60 * 60 * 1000,

  /** Trading universe (default instruments) */
  defaultInstruments: ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA"],

  /** Whether to run immediately on startup */
  runOnStartup: Bun.env.RUN_ON_STARTUP === "true",

  /** Environment */
  env: Bun.env.CREAM_ENV ?? "PAPER",
};

// ============================================
// Cycle ID Generation
// ============================================

function generateCycleId(): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const random = Math.random().toString(36).substring(2, 8);
  return `cycle-${timestamp}-${random}`;
}

// ============================================
// Workflow Execution
// ============================================

async function runTradingCycle(): Promise<void> {
  const cycleId = generateCycleId();
  const startTime = Date.now();

  console.log(`\n============================================================`);
  console.log(`[Worker] Starting trading cycle: ${cycleId}`);
  console.log(`[Worker] Timestamp: ${new Date().toISOString()}`);
  console.log(`[Worker] Environment: ${CONFIG.env}`);
  console.log(`============================================================\n`);

  try {
    // Execute the trading cycle workflow
    const result = await tradingCycleWorkflow.execute({
      triggerData: {
        cycleId,
        instruments: CONFIG.defaultInstruments,
      },
    });

    const duration = Date.now() - startTime;

    console.log(`\n[Worker] Cycle ${cycleId} completed`);
    console.log(`[Worker] Duration: ${duration}ms`);
    console.log(`[Worker] Result: ${JSON.stringify(result, null, 2)}`);
  } catch (error) {
    console.error(`[Worker] Cycle ${cycleId} failed:`, error);
  }
}

// ============================================
// Scheduler
// ============================================

function calculateNextHourMs(): number {
  const now = new Date();
  const nextHour = new Date(now);
  nextHour.setHours(nextHour.getHours() + 1);
  nextHour.setMinutes(0);
  nextHour.setSeconds(0);
  nextHour.setMilliseconds(0);
  return nextHour.getTime() - now.getTime();
}

function startScheduler(): NodeJS.Timeout {
  console.log("[Worker] Starting hourly scheduler...");

  // Schedule first run at next hour boundary
  const msUntilNextHour = calculateNextHourMs();
  console.log(`[Worker] Next cycle in ${Math.round(msUntilNextHour / 1000 / 60)} minutes`);

  // Initial aligned trigger
  setTimeout(() => {
    runTradingCycle();

    // Then run every hour
    setInterval(runTradingCycle, CONFIG.intervalMs);
  }, msUntilNextHour);

  // Return a dummy interval for cleanup
  return setInterval(() => {}, CONFIG.intervalMs);
}

// ============================================
// Main
// ============================================

async function main() {
  console.log("[Worker] Cream Trading Worker starting...");
  console.log(`[Worker] Environment: ${CONFIG.env}`);
  console.log(`[Worker] Instruments: ${CONFIG.defaultInstruments.join(", ")}`);
  console.log(`[Worker] Run on startup: ${CONFIG.runOnStartup}`);

  // Run immediately if configured
  if (CONFIG.runOnStartup) {
    console.log("[Worker] Running initial cycle on startup...");
    await runTradingCycle();
  }

  // Start the hourly scheduler
  const schedulerInterval = startScheduler();

  // Handle shutdown
  process.on("SIGINT", () => {
    console.log("\n[Worker] Shutting down...");
    clearInterval(schedulerInterval);
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\n[Worker] Shutting down...");
    clearInterval(schedulerInterval);
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("[Worker] Fatal error:", error);
  process.exit(1);
});
