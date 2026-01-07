/**
 * @cream/worker - Hourly Scheduler
 *
 * Triggers the trading cycle workflow every hour, aligned to candle closes.
 * Runs the OODA loop: Observe -> Orient -> Decide -> Act
 *
 * Also runs the prediction markets workflow every 15 minutes.
 */

import { predictionMarketsWorkflow, tradingCycleWorkflow } from "@cream/api";
import { isBacktest, validateEnvironmentOrExit } from "@cream/domain";

// ============================================
// Configuration
// ============================================

const CONFIG = {
  /** Interval in milliseconds (1 hour) for trading cycle */
  tradingCycleIntervalMs: 60 * 60 * 1000,

  /** Interval in milliseconds (15 minutes) for prediction markets */
  predictionMarketsIntervalMs: 15 * 60 * 1000,

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
    // Execute the trading cycle workflow (custom workflow object)
    const _result = await tradingCycleWorkflow.execute({
      triggerData: {
        cycleId,
        instruments: CONFIG.defaultInstruments,
      },
    });

    const _duration = Date.now() - startTime;
  } catch (_error) {}
}

/**
 * Run the prediction markets workflow.
 * Fetches data from Kalshi/Polymarket and stores computed signals.
 */
async function runPredictionMarkets(): Promise<void> {
  const startTime = Date.now();

  try {
    // Create a run instance and execute the prediction markets workflow
    const run = await predictionMarketsWorkflow.createRun();
    const _result = await run.start({
      inputData: {
        marketTypes: ["FED_RATE", "ECONOMIC_DATA", "RECESSION"] as const,
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

function calculateNext15MinMs(): number {
  const now = new Date();
  const next15Min = new Date(now);
  const minutes = now.getMinutes();
  const nextQuarter = Math.ceil((minutes + 1) / 15) * 15;
  next15Min.setMinutes(nextQuarter % 60);
  if (nextQuarter >= 60) {
    next15Min.setHours(next15Min.getHours() + 1);
  }
  next15Min.setSeconds(0);
  next15Min.setMilliseconds(0);
  return next15Min.getTime() - now.getTime();
}

interface SchedulerIntervals {
  tradingCycle: NodeJS.Timeout;
  predictionMarkets: NodeJS.Timeout;
}

function startScheduler(): SchedulerIntervals {
  // Schedule trading cycle at next hour boundary
  const msUntilNextHour = calculateNextHourMs();
  setTimeout(() => {
    runTradingCycle();
    setInterval(runTradingCycle, CONFIG.tradingCycleIntervalMs);
  }, msUntilNextHour);

  // Schedule prediction markets at next 15-minute boundary
  const msUntilNext15Min = calculateNext15MinMs();
  setTimeout(() => {
    runPredictionMarkets();
    setInterval(runPredictionMarkets, CONFIG.predictionMarketsIntervalMs);
  }, msUntilNext15Min);

  // Return intervals for cleanup (dummy intervals since we use nested setIntervals)
  return {
    tradingCycle: setInterval(() => {}, CONFIG.tradingCycleIntervalMs),
    predictionMarkets: setInterval(() => {}, CONFIG.predictionMarketsIntervalMs),
  };
}

// ============================================
// Main
// ============================================

async function main() {
  // Validate environment at startup
  // In non-backtest mode, require FMP_KEY for external context and at least one LLM key
  if (!isBacktest()) {
    validateEnvironmentOrExit("worker", ["FMP_KEY"]);

    // Warn if no LLM key is set (needed for real agent execution)
    const hasLlmKey = process.env.ANTHROPIC_API_KEY || process.env.GOOGLE_API_KEY;
    if (!hasLlmKey) {
      // biome-ignore lint/suspicious/noConsole: Startup warning is intentional
      console.warn(
        "⚠️  No LLM API key configured (ANTHROPIC_API_KEY or GOOGLE_API_KEY). " +
          "Agent execution will use stub agents."
      );
    }
  }

  // Run immediately if configured
  if (CONFIG.runOnStartup) {
    await Promise.all([runTradingCycle(), runPredictionMarkets()]);
  }

  // Start the schedulers
  const intervals = startScheduler();

  // Handle shutdown
  process.on("SIGINT", () => {
    clearInterval(intervals.tradingCycle);
    clearInterval(intervals.predictionMarkets);
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    clearInterval(intervals.tradingCycle);
    clearInterval(intervals.predictionMarkets);
    process.exit(0);
  });
}

main().catch((_error) => {
  process.exit(1);
});
