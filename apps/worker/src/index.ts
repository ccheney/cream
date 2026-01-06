/**
 * @cream/worker - Hourly Scheduler
 *
 * Triggers the trading cycle workflow every hour, aligned to candle closes.
 * Runs the OODA loop: Observe -> Orient -> Decide -> Act
 */

import { tradingCycleWorkflow } from "@cream/api";

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

  try {
    // Execute the trading cycle workflow
    const _result = await tradingCycleWorkflow.execute({
      triggerData: {
        cycleId,
        instruments: CONFIG.defaultInstruments,
      },
    });

    const _duration = Date.now() - startTime;
  } catch (_error) {}
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
  // Schedule first run at next hour boundary
  const msUntilNextHour = calculateNextHourMs();

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
  // Run immediately if configured
  if (CONFIG.runOnStartup) {
    await runTradingCycle();
  }

  // Start the hourly scheduler
  const schedulerInterval = startScheduler();

  // Handle shutdown
  process.on("SIGINT", () => {
    clearInterval(schedulerInterval);
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    clearInterval(schedulerInterval);
    process.exit(0);
  });
}

main().catch((_error) => {
  process.exit(1);
});
