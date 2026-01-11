/**
 * Backtest Executor Service
 *
 * Spawns Python subprocess to run VectorBT backtests.
 * Streams progress events to WebSocket and updates database.
 *
 * @see docs/plans/28-backtest-execution-pipeline.md Phase 2.1
 */

import type { BacktestsRepository } from "@cream/storage";
import log from "../logger.js";

// ============================================
// Types
// ============================================

/**
 * Configuration for backtest execution.
 */
export interface BacktestConfig {
  /** Unique backtest identifier */
  backtestId: string;

  /** Path to OHLCV Parquet data file */
  dataPath: string;

  /** Path to entry/exit signals Parquet file */
  signalsPath: string;

  /** Initial capital for simulation */
  initialCapital: number;

  /** Slippage in basis points */
  slippageBps: number;

  /** Commission per share (default 0) */
  commissionPerShare?: number;

  /** Symbol being backtested */
  symbol?: string;
}

/**
 * Event types emitted by the Python backtest runner.
 */
export type BacktestEventType = "progress" | "trade" | "equity" | "completed" | "error";

/**
 * Base backtest event with type discriminator.
 */
export interface BacktestEventBase {
  type: BacktestEventType;
}

/**
 * Progress event during backtest execution.
 */
export interface ProgressEvent extends BacktestEventBase {
  type: "progress";
  pct: number;
  phase: string;
}

/**
 * Trade event for each simulated trade.
 */
export interface TradeEvent extends BacktestEventBase {
  type: "trade";
  timestamp: string;
  exitTimestamp?: string;
  symbol: string;
  action: "BUY" | "SELL" | "SHORT" | "COVER";
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  returnPct?: number;
}

/**
 * Equity point event for equity curve.
 */
export interface EquityEvent extends BacktestEventBase {
  type: "equity";
  timestamp: string;
  nav: number;
  drawdownPct: number;
}

/**
 * Completion event with final metrics.
 */
export interface CompletedEvent extends BacktestEventBase {
  type: "completed";
  metrics: {
    totalReturn: number;
    sharpeRatio: number;
    sortinoRatio: number;
    maxDrawdown: number;
    winRate: number;
    profitFactor: number;
    totalTrades: number;
    totalFeesPaid?: number;
    startValue?: number;
    endValue?: number;
  };
}

/**
 * Error event when backtest fails.
 */
export interface ErrorEvent extends BacktestEventBase {
  type: "error";
  message: string;
}

/**
 * Union type for all backtest events.
 */
export type BacktestEvent = ProgressEvent | TradeEvent | EquityEvent | CompletedEvent | ErrorEvent;

/**
 * Broadcast function type for WebSocket messages.
 */
export type BroadcastFn = (backtestId: string, message: unknown) => void;

/**
 * Execution options for backtest.
 */
export interface ExecuteOptions {
  /** Timeout in milliseconds (default 10 minutes) */
  timeoutMs?: number;

  /** Working directory for Python subprocess */
  cwd?: string;
}

// ============================================
// Default Configuration
// ============================================

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Get the path to the research package.
 */
function getResearchPath(): string {
  // Navigate from apps/dashboard-api/src/services to packages/research
  return `${import.meta.dir}/../../../../packages/research`;
}

// ============================================
// Event Handlers
// ============================================

/**
 * Handle a backtest event - update database and optionally broadcast.
 */
async function handleEvent(
  backtestId: string,
  event: BacktestEvent,
  repo: BacktestsRepository,
  broadcast?: BroadcastFn
): Promise<void> {
  switch (event.type) {
    case "progress":
      await repo.updateProgress(backtestId, event.pct);
      broadcast?.(backtestId, {
        type: "backtest:progress",
        payload: { progressPct: event.pct, phase: event.phase },
      });
      break;

    case "trade":
      await repo.addTrade(backtestId, {
        timestamp: event.timestamp,
        symbol: event.symbol,
        action: event.action,
        quantity: event.quantity,
        price: event.entryPrice,
        commission: 0,
        pnl: event.pnl,
        pnlPct: event.returnPct ?? null,
        decisionRationale: null,
      });
      broadcast?.(backtestId, {
        type: "backtest:trade",
        payload: event,
      });
      break;

    case "equity":
      await repo.addEquityPoint(backtestId, {
        timestamp: event.timestamp,
        nav: event.nav,
        cash: 0,
        equity: event.nav,
        drawdown: null,
        drawdownPct: event.drawdownPct,
        dayReturnPct: null,
        cumulativeReturnPct: null,
      });
      // Don't broadcast every equity point - too many events
      break;

    case "completed":
      await repo.complete(backtestId, {
        totalReturn: event.metrics.totalReturn,
        sharpeRatio: event.metrics.sharpeRatio,
        sortinoRatio: event.metrics.sortinoRatio,
        maxDrawdown: event.metrics.maxDrawdown,
        winRate: event.metrics.winRate,
        profitFactor: event.metrics.profitFactor,
        totalTrades: event.metrics.totalTrades,
        additionalMetrics: {
          totalFeesPaid: event.metrics.totalFeesPaid,
          startValue: event.metrics.startValue,
          endValue: event.metrics.endValue,
        },
      });
      broadcast?.(backtestId, {
        type: "backtest:completed",
        payload: event.metrics,
      });
      break;

    case "error":
      await repo.fail(backtestId, event.message);
      broadcast?.(backtestId, {
        type: "backtest:error",
        payload: { message: event.message },
      });
      break;
  }
}

// ============================================
// Main Executor
// ============================================

/**
 * Execute a backtest by spawning the Python runner subprocess.
 *
 * @param config - Backtest configuration
 * @param repo - Backtests repository for database updates
 * @param broadcast - Optional broadcast function for WebSocket updates
 * @param options - Execution options
 */
export async function executeBacktest(
  config: BacktestConfig,
  repo: BacktestsRepository,
  broadcast?: BroadcastFn,
  options?: ExecuteOptions
): Promise<void> {
  const { backtestId } = config;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const cwd = options?.cwd ?? getResearchPath();

  // Mark backtest as started
  await repo.start(backtestId);
  broadcast?.(backtestId, { type: "backtest:started" });

  log.info({ backtestId, cwd, config }, "Executing Python backtest runner");

  try {
    // Spawn Python subprocess
    const proc = Bun.spawn(
      ["uv", "run", "python", "-m", "research.backtest.runner", "--config", JSON.stringify(config)],
      {
        cwd,
        stdout: "pipe",
        stderr: "pipe",
      }
    );

    log.debug({ backtestId, pid: proc.pid }, "Python process spawned");

    // Set up timeout
    const timeoutId = setTimeout(() => {
      proc.kill();
    }, timeoutMs);

    try {
      // Stream events from stdout
      const decoder = new TextDecoder();
      const reader = proc.stdout.getReader();
      let buffer = "";
      let eventCount = 0;

      log.debug({ backtestId }, "Starting to read stdout");

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          log.debug({ backtestId, eventCount }, "Stdout stream ended");
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }

          log.trace({ backtestId, line: line.substring(0, 200) }, "Raw stdout line");

          try {
            const event = JSON.parse(line) as BacktestEvent;
            log.debug({ backtestId, eventType: event.type }, "Backtest event received");
            eventCount++;
            await handleEvent(backtestId, event, repo, broadcast);
          } catch {
            log.warn(
              { backtestId, line: line.substring(0, 100) },
              "Failed to parse backtest event"
            );
          }
        }
      }

      // Process any remaining buffer content
      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer) as BacktestEvent;
          await handleEvent(backtestId, event, repo, broadcast);
        } catch {
          // Ignore incomplete JSON at end
        }
      }

      // Check exit code
      const exitCode = await proc.exited;
      log.info({ backtestId, exitCode }, "Python process exited");

      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        log.error({ backtestId, exitCode, stderr }, "Backtest process failed");
        throw new Error(`Backtest process exited with code ${exitCode}: ${stderr}`);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    // Update database with failure
    const errorMessage = error instanceof Error ? error.message : String(error);
    await repo.fail(backtestId, errorMessage);
    broadcast?.(backtestId, {
      type: "backtest:error",
      payload: { message: errorMessage },
    });
    throw error;
  }
}

// ============================================
// Exports
// ============================================

export { handleEvent };
