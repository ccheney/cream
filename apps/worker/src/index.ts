/**
 * @cream/worker - Hourly Scheduler
 *
 * Triggers the trading cycle workflow every hour, aligned to candle closes.
 * Runs the OODA loop: Observe -> Orient -> Decide -> Act
 *
 * Also runs the prediction markets workflow every 15 minutes.
 *
 * Configuration MUST be loaded from the database via RuntimeConfigService.
 * Run 'bun run db:seed' to initialize configuration before starting.
 *
 * Supports config reload on SIGHUP signal.
 */

import { predictionMarketsWorkflow, tradingCycleWorkflow } from "@cream/api";
import type { FullRuntimeConfig, RuntimeEnvironment } from "@cream/config";
import {
  type CreamEnvironment,
  createContext,
  isBacktest,
  validateEnvironmentOrExit,
} from "@cream/domain";
import { getRuntimeConfigService, resetRuntimeConfigService } from "./db";

// ============================================
// Worker State
// ============================================

interface WorkerState {
  /** Current runtime config (required) */
  config: FullRuntimeConfig;
  /** Environment */
  environment: RuntimeEnvironment;
  /** Whether to run on startup */
  runOnStartup: boolean;
  /** Active timer handles */
  timers: {
    tradingCycle: ReturnType<typeof setTimeout> | null;
    predictionMarkets: ReturnType<typeof setTimeout> | null;
  };
  /** Last run timestamps */
  lastRun: {
    tradingCycle: Date | null;
    predictionMarkets: Date | null;
  };
  /** Startup time */
  startedAt: Date;
  /** Whether currently running a cycle */
  running: {
    tradingCycle: boolean;
    predictionMarkets: boolean;
  };
}

// State is initialized in main() after config is loaded
let state: WorkerState;

// ============================================
// Config Accessors
// ============================================

function getIntervals(): {
  tradingCycleIntervalMs: number;
  predictionMarketsIntervalMs: number;
} {
  return {
    tradingCycleIntervalMs: state.config.trading.tradingCycleIntervalMs,
    predictionMarketsIntervalMs: state.config.trading.predictionMarketsIntervalMs,
  };
}

function getInstruments(): string[] {
  const symbols = state.config.universe.staticSymbols;
  if (!symbols || symbols.length === 0) {
    throw new Error("No instruments configured in universe.staticSymbols");
  }
  return symbols;
}

// ============================================
// Config Loading
// ============================================

/**
 * Load configuration from database.
 * Throws if config is not found - DB seeding is required.
 */
async function loadConfig(environment: RuntimeEnvironment): Promise<FullRuntimeConfig> {
  const configService = await getRuntimeConfigService();
  const config = await configService.getActiveConfig(environment);
  return config;
}

/**
 * Reload configuration (called on SIGHUP)
 */
async function reloadConfig(): Promise<void> {
  // biome-ignore lint/suspicious/noConsole: Config reload notification is intentional
  console.log("🔄 Reloading configuration...");

  // Reset the service to force fresh load
  resetRuntimeConfigService();

  const oldIntervals = getIntervals();
  state.config = await loadConfig(state.environment);
  const newIntervals = getIntervals();

  // Check if intervals changed
  const tradingIntervalChanged =
    oldIntervals.tradingCycleIntervalMs !== newIntervals.tradingCycleIntervalMs;
  const predictionIntervalChanged =
    oldIntervals.predictionMarketsIntervalMs !== newIntervals.predictionMarketsIntervalMs;

  if (tradingIntervalChanged || predictionIntervalChanged) {
    // biome-ignore lint/suspicious/noConsole: Interval change notification is intentional
    console.log("📊 Intervals changed, rescheduling...");

    // Cancel existing timers and reschedule
    stopScheduler();
    startScheduler();
  }

  // biome-ignore lint/suspicious/noConsole: Config reload confirmation is intentional
  console.log("✅ Configuration reloaded");
}

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
  if (state.running.tradingCycle) {
    // biome-ignore lint/suspicious/noConsole: Skip notification is intentional
    console.log("⏭️  Skipping trading cycle - previous run still in progress");
    return;
  }

  state.running.tradingCycle = true;
  const cycleId = generateCycleId();
  state.lastRun.tradingCycle = new Date();

  try {
    const instruments = getInstruments();

    // Create ExecutionContext at scheduler boundary
    // Source is "scheduled" for automated runs
    // configId is the trading config version for traceability
    const ctx = createContext(state.environment, "scheduled", state.config.trading.id);

    await tradingCycleWorkflow.execute({
      triggerData: {
        cycleId,
        context: ctx,
        instruments,
      },
    });
  } catch (_error) {
    // Error handling done in workflow
  } finally {
    state.running.tradingCycle = false;
  }
}

/**
 * Run the prediction markets workflow.
 * Fetches data from Kalshi/Polymarket and stores computed signals.
 */
async function runPredictionMarkets(): Promise<void> {
  if (state.running.predictionMarkets) {
    // biome-ignore lint/suspicious/noConsole: Skip notification is intentional
    console.log("⏭️  Skipping prediction markets - previous run still in progress");
    return;
  }

  state.running.predictionMarkets = true;
  state.lastRun.predictionMarkets = new Date();

  try {
    const run = await predictionMarketsWorkflow.createRun();
    await run.start({
      inputData: {
        marketTypes: ["FED_RATE", "ECONOMIC_DATA", "RECESSION"] as const,
      },
    });
  } catch (_error) {
    // Error handling done in workflow
  } finally {
    state.running.predictionMarkets = false;
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

function scheduleTradingCycle(): void {
  const intervals = getIntervals();

  // Schedule at next hour boundary, then repeat at configured interval
  const msUntilNextHour = calculateNextHourMs();
  state.timers.tradingCycle = setTimeout(() => {
    runTradingCycle();
    state.timers.tradingCycle = setInterval(runTradingCycle, intervals.tradingCycleIntervalMs);
  }, msUntilNextHour);
}

function schedulePredictionMarkets(): void {
  const intervals = getIntervals();

  // Schedule at next 15-minute boundary, then repeat at configured interval
  const msUntilNext15Min = calculateNext15MinMs();
  state.timers.predictionMarkets = setTimeout(() => {
    runPredictionMarkets();
    state.timers.predictionMarkets = setInterval(
      runPredictionMarkets,
      intervals.predictionMarketsIntervalMs
    );
  }, msUntilNext15Min);
}

function startScheduler(): void {
  scheduleTradingCycle();
  schedulePredictionMarkets();
}

function stopScheduler(): void {
  if (state.timers.tradingCycle) {
    clearTimeout(state.timers.tradingCycle);
    clearInterval(state.timers.tradingCycle);
    state.timers.tradingCycle = null;
  }
  if (state.timers.predictionMarkets) {
    clearTimeout(state.timers.predictionMarkets);
    clearInterval(state.timers.predictionMarkets);
    state.timers.predictionMarkets = null;
  }
}

// ============================================
// Health Endpoint
// ============================================

const HEALTH_PORT = Number(Bun.env.HEALTH_PORT ?? 3002);

function startHealthServer(): void {
  Bun.serve({
    port: HEALTH_PORT,
    fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === "/health" || url.pathname === "/") {
        const intervals = getIntervals();
        const uptime = Date.now() - state.startedAt.getTime();

        const health = {
          status: "ok",
          uptime_ms: uptime,
          environment: state.environment,
          config_id: state.config.trading.id,
          intervals: {
            trading_cycle_ms: intervals.tradingCycleIntervalMs,
            prediction_markets_ms: intervals.predictionMarketsIntervalMs,
          },
          instruments: getInstruments(),
          last_run: {
            trading_cycle: state.lastRun.tradingCycle?.toISOString() ?? null,
            prediction_markets: state.lastRun.predictionMarkets?.toISOString() ?? null,
          },
          running: {
            trading_cycle: state.running.tradingCycle,
            prediction_markets: state.running.predictionMarkets,
          },
          started_at: state.startedAt.toISOString(),
        };

        return new Response(JSON.stringify(health, null, 2), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.pathname === "/reload") {
        if (req.method === "POST") {
          reloadConfig().catch(() => {});
          return new Response(JSON.stringify({ status: "reloading" }), {
            status: 202,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("Method not allowed", { status: 405 });
      }

      return new Response("Not found", { status: 404 });
    },
  });
}

// ============================================
// Main
// ============================================

async function main() {
  const environment = (Bun.env.CREAM_ENV ?? "PAPER") as RuntimeEnvironment;

  // Validate environment at startup
  // In non-backtest mode, require FMP_KEY for external context and at least one LLM key
  const startupCtx = createContext(environment as CreamEnvironment, "scheduled");
  if (!isBacktest(startupCtx)) {
    validateEnvironmentOrExit(startupCtx, "worker", ["FMP_KEY"]);

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

  // Load configuration from database - REQUIRED
  let config: FullRuntimeConfig;
  try {
    config = await loadConfig(environment);
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: Fatal error is intentional
    console.error(
      `❌ Failed to load config from database: ${error instanceof Error ? error.message : "Unknown error"}`
    );
    // biome-ignore lint/suspicious/noConsole: Fatal error is intentional
    console.error("   Run 'bun run db:seed' to initialize the database configuration.");
    process.exit(1);
  }

  // Initialize state
  state = {
    config,
    environment,
    runOnStartup: Bun.env.RUN_ON_STARTUP === "true",
    timers: {
      tradingCycle: null,
      predictionMarkets: null,
    },
    lastRun: {
      tradingCycle: null,
      predictionMarkets: null,
    },
    startedAt: new Date(),
    running: {
      tradingCycle: false,
      predictionMarkets: false,
    },
  };

  const intervals = getIntervals();
  // biome-ignore lint/suspicious/noConsole: Startup info is intentional
  console.log(`🚀 Worker starting [env=${environment}, config=${config.trading.id}]`);
  // biome-ignore lint/suspicious/noConsole: Startup info is intentional
  console.log(
    `📊 Intervals: trading=${intervals.tradingCycleIntervalMs}ms, predictions=${intervals.predictionMarketsIntervalMs}ms`
  );
  // biome-ignore lint/suspicious/noConsole: Startup info is intentional
  console.log(`📈 Instruments: ${getInstruments().join(", ")}`);

  // Start health server
  startHealthServer();
  // biome-ignore lint/suspicious/noConsole: Startup info is intentional
  console.log(`🏥 Health endpoint listening on port ${HEALTH_PORT}`);

  // Run immediately if configured
  if (state.runOnStartup) {
    // biome-ignore lint/suspicious/noConsole: Startup run notification is intentional
    console.log("▶️  Running cycles on startup...");
    await Promise.all([runTradingCycle(), runPredictionMarkets()]);
  }

  // Start the schedulers
  startScheduler();

  // Handle config reload on SIGHUP
  process.on("SIGHUP", () => {
    reloadConfig().catch((error) => {
      // biome-ignore lint/suspicious/noConsole: Error is intentional
      console.error("❌ Config reload failed:", error);
    });
  });

  // Handle shutdown
  process.on("SIGINT", () => {
    stopScheduler();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    stopScheduler();
    process.exit(0);
  });
}

main().catch((_error) => {
  process.exit(1);
});
