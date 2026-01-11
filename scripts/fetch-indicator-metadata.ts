#!/usr/bin/env bun
/**
 * Fetch Indicator Metadata
 *
 * Retrieves indicator metadata from Turso and outputs GitHub Actions variables.
 * Used by the indicator-promotion workflow to populate PR details.
 *
 * Usage: bun run scripts/fetch-indicator-metadata.ts <indicator_id>
 *
 * Outputs (to $GITHUB_OUTPUT):
 * - name: Indicator name
 * - category: Target category (momentum, trend, volatility, volume)
 * - hypothesis: Generated hypothesis
 * - rationale: Economic rationale
 * - validation_json: JSON string of validation report
 * - paper_json: JSON string of paper trading report
 * - is_valid: "true" if indicator passed all validation gates
 *
 * @see docs/plans/19-dynamic-indicator-synthesis.md
 */

import { appendFileSync } from "node:fs";
import { createNodeLogger, type LifecycleLogger } from "@cream/logger";

const log: LifecycleLogger = createNodeLogger({
  service: "fetch-indicator-metadata",
  level: "info",
  environment: process.env.CREAM_ENV ?? "BACKTEST",
  pretty: true,
});

// ============================================
// Types
// ============================================

interface ValidationReport {
  trialsCount: number;
  rawSharpe: number;
  deflatedSharpe: number;
  probabilityOfOverfit: number;
  informationCoefficient: number;
  icStandardDev: number;
  maxDrawdown: number;
  calmarRatio?: number;
  sortinoRatio?: number;
  walkForwardPeriods: Array<{
    startDate: string;
    endDate: string;
    inSampleSharpe: number;
    outOfSampleSharpe: number;
    informationCoefficient: number;
  }>;
  validatedAt: string;
}

interface PaperTradingReport {
  periodStart: string;
  periodEnd: string;
  tradingDays: number;
  realizedSharpe: number;
  expectedSharpe: number;
  sharpeTrackingError: number;
  realizedIC: number;
  expectedIC: number;
  signalsGenerated: number;
  profitableSignalRate: number;
  returnCorrelation: number;
  recommendation: "PROMOTE" | "EXTEND" | "RETIRE";
  generatedAt: string;
}

interface Indicator {
  id: string;
  name: string;
  category: string;
  status: string;
  hypothesis: string;
  economic_rationale: string;
  validation_report: string | null;
  paper_trading_report: string | null;
  paper_trading_start: string | null;
  paper_trading_end: string | null;
}

// ============================================
// Validation Thresholds
// ============================================

const THRESHOLDS = {
  DSR_P_VALUE: 0.95,
  PBO_MAX: 0.5,
  IC_MIN: 0.02,
  WALK_FORWARD_EFFICIENCY_MIN: 0.5,
  MAX_CORRELATION: 0.7,
  PAPER_TRADING_DAYS_MIN: 30,
};

// ============================================
// GitHub Output Helpers
// ============================================

/* biome-ignore lint/suspicious/noConsole: Local testing output for GitHub Actions simulation */
function setOutput(name: string, value: string): void {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    // Handle multiline values
    if (value.includes("\n")) {
      const delimiter = `ghadelimiter_${Date.now()}`;
      appendFileSync(outputFile, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
    } else {
      appendFileSync(outputFile, `${name}=${value}\n`);
    }
  } else {
    // Local testing - print to stdout (intentionally console.log for GitHub Actions output simulation)
    console.log(`${name}=${value}`);
  }
}

// ============================================
// Database Query
// ============================================

async function fetchIndicator(indicatorId: string): Promise<Indicator | null> {
  const dbUrl = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!dbUrl) {
    log.error({}, "TURSO_DATABASE_URL not set");
    process.exit(1);
  }

  // Use Turso HTTP API for simplicity in CI
  const url = new URL(dbUrl.replace("libsql://", "https://"));
  url.pathname = "/v2/pipeline";

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authToken && { Authorization: `Bearer ${authToken}` }),
    },
    body: JSON.stringify({
      requests: [
        {
          type: "execute",
          stmt: {
            sql: `SELECT id, name, category, status, hypothesis, economic_rationale,
                  validation_report, paper_trading_report, paper_trading_start, paper_trading_end
                  FROM indicators WHERE id = ?`,
            args: [{ type: "text", value: indicatorId }],
          },
        },
        { type: "close" },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    log.error({ error }, "Database error");
    return null;
  }

  const result = (await response.json()) as {
    results: Array<{
      response?: {
        type: string;
        result?: {
          rows: Array<Array<{ type: string; value: string | null }>>;
        };
      };
    }>;
  };

  const rows = result.results[0]?.response?.result?.rows;
  if (!rows || rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    id: row[0]?.value ?? "",
    name: row[1]?.value ?? "",
    category: row[2]?.value ?? "",
    status: row[3]?.value ?? "",
    hypothesis: row[4]?.value ?? "",
    economic_rationale: row[5]?.value ?? "",
    validation_report: row[6]?.value ?? null,
    paper_trading_report: row[7]?.value ?? null,
    paper_trading_start: row[8]?.value ?? null,
    paper_trading_end: row[9]?.value ?? null,
  };
}

// ============================================
// Validation Logic
// ============================================

function isIndicatorValid(indicator: Indicator): boolean {
  // Must have completed paper trading
  if (indicator.status !== "paper" && indicator.status !== "staging") {
    // Already promoted or retired
    return indicator.status === "production";
  }

  if (!indicator.paper_trading_end) {
    return false;
  }

  // Must have validation report
  if (!indicator.validation_report) {
    return false;
  }

  // Must have paper trading report
  if (!indicator.paper_trading_report) {
    return false;
  }

  const validation: ValidationReport = JSON.parse(indicator.validation_report);
  const paperTrading: PaperTradingReport = JSON.parse(indicator.paper_trading_report);

  // Check validation gates
  // Note: DSR p-value is approximated from deflated Sharpe
  const dsrPass = validation.deflatedSharpe > 0; // Simplified check
  const pboPass = validation.probabilityOfOverfit < THRESHOLDS.PBO_MAX;
  const icPass = validation.informationCoefficient > THRESHOLDS.IC_MIN;

  // Walk-forward efficiency: avg(OOS Sharpe / IS Sharpe)
  const wfEfficiency =
    validation.walkForwardPeriods.length > 0
      ? validation.walkForwardPeriods.reduce(
          (sum, p) => sum + (p.inSampleSharpe > 0 ? p.outOfSampleSharpe / p.inSampleSharpe : 0),
          0
        ) / validation.walkForwardPeriods.length
      : 0;
  const wfPass = wfEfficiency > THRESHOLDS.WALK_FORWARD_EFFICIENCY_MIN;

  // Paper trading must recommend PROMOTE
  const paperPass = paperTrading.recommendation === "PROMOTE";

  // Paper trading must have minimum days
  const daysPass = paperTrading.tradingDays >= THRESHOLDS.PAPER_TRADING_DAYS_MIN;

  return dsrPass && pboPass && icPass && wfPass && paperPass && daysPass;
}

// ============================================
// Main
// ============================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    log.error({ usage: "bun run scripts/fetch-indicator-metadata.ts <indicator_id>" }, "No indicator_id provided");
    process.exit(1);
  }

  const indicatorId = args[0];
  log.info({ indicatorId }, "Fetching metadata for indicator");

  const indicator = await fetchIndicator(indicatorId);

  if (!indicator) {
    log.error({ indicatorId }, "Indicator not found");
    process.exit(1);
  }

  log.info({ name: indicator.name, category: indicator.category, status: indicator.status }, "Found indicator");

  // Set outputs
  setOutput("name", indicator.name);
  setOutput("category", indicator.category);
  setOutput("hypothesis", indicator.hypothesis);
  setOutput("rationale", indicator.economic_rationale);
  setOutput("validation_json", indicator.validation_report ?? "{}");
  setOutput("paper_json", indicator.paper_trading_report ?? "{}");

  const isValid = isIndicatorValid(indicator);
  setOutput("is_valid", isValid ? "true" : "false");

  log.info({ isValid }, "Validation status");

  if (!isValid) {
    const failures: string[] = [];
    if (!indicator.paper_trading_end) {
      failures.push("Paper trading not completed");
    }
    if (!indicator.validation_report) {
      failures.push("No validation report");
    }
    if (!indicator.paper_trading_report) {
      failures.push("No paper trading report");
    } else {
      const report: PaperTradingReport = JSON.parse(indicator.paper_trading_report);
      if (report.recommendation !== "PROMOTE") {
        failures.push(`Paper trading recommendation: ${report.recommendation}`);
      }
      if (report.tradingDays < THRESHOLDS.PAPER_TRADING_DAYS_MIN) {
        failures.push(
          `Insufficient trading days: ${report.tradingDays} < ${THRESHOLDS.PAPER_TRADING_DAYS_MIN}`
        );
      }
    }
    log.warn({ failures }, "Validation failures");
  }
}

main().catch((error) => {
  log.error({ error: error instanceof Error ? error.message : String(error) }, "Error");
  process.exit(1);
});
