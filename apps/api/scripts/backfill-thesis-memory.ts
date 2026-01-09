#!/usr/bin/env bun

/* biome-ignore-all lint/suspicious/noConsole: CLI script that outputs to console */
/**
 * Backfill Historical Theses into HelixDB
 *
 * Ingests all closed theses from Turso into HelixDB as ThesisMemory nodes.
 * This enables agents to learn from past thesis outcomes.
 *
 * Usage:
 *   bun apps/api/scripts/backfill-thesis-memory.ts [options]
 *
 * Options:
 *   --dry-run       Show what would be ingested without actually ingesting
 *   --environment   Filter by environment (BACKTEST, PAPER, LIVE)
 *   --limit         Maximum number of theses to process
 *   --since         Only process theses closed after this date (ISO 8601)
 */

import { type CreamEnvironment, createContext } from "@cream/domain";
import { createHelixClientFromEnv, type HelixClient } from "@cream/helix";
import { createEmbeddingClient, type EmbeddingClient } from "@cream/helix-schema";
import { createTursoClient, ThesisStateRepository, type TursoClient } from "@cream/storage";
import {
  batchIngestClosedTheses,
  type ThesisIngestionInput,
} from "../workflows/steps/thesisMemoryIngestion.js";

// ============================================
// CLI Arguments
// ============================================

interface BackfillOptions {
  dryRun: boolean;
  environment?: string;
  limit?: number;
  since?: string;
}

function parseArgs(): BackfillOptions {
  const args = process.argv.slice(2);
  const options: BackfillOptions = {
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--environment" && nextArg) {
      options.environment = nextArg;
      i++;
    } else if (arg === "--limit" && nextArg) {
      options.limit = parseInt(nextArg, 10);
      i++;
    } else if (arg === "--since" && nextArg) {
      options.since = nextArg;
      i++;
    }
  }

  return options;
}

// ============================================
// Regime Lookup
// ============================================

/**
 * Get the market regime for a specific date.
 * Falls back to "UNKNOWN" if no regime data is available.
 */
async function getRegimeForDate(client: TursoClient, date: string): Promise<string> {
  try {
    // Look for the closest regime label before or at the given date
    const row = await client.get<{ regime: string }>(
      `SELECT regime FROM regime_labels
       WHERE symbol = '_MARKET' AND timeframe = '1d'
       AND timestamp <= ?
       ORDER BY timestamp DESC
       LIMIT 1`,
      [date]
    );

    if (row?.regime) {
      return String(row.regime).toUpperCase();
    }
  } catch {
    // Ignore errors - just return UNKNOWN
  }

  return "UNKNOWN";
}

// ============================================
// Main Backfill Logic
// ============================================

async function backfillThesisMemory(options: BackfillOptions): Promise<void> {
  console.log("🔄 Starting thesis memory backfill...\n");

  if (options.dryRun) {
    console.log("📋 DRY RUN MODE - No data will be ingested\n");
  }

  // Create Turso client
  const databaseUrl = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!databaseUrl) {
    console.error("❌ TURSO_DATABASE_URL environment variable not set");
    process.exit(1);
  }

  // Create context for CLI invocation (use environment from options or default to BACKTEST)
  const envValue = (options.environment || "BACKTEST") as CreamEnvironment;
  const ctx = createContext(envValue, "manual");

  const storageClient = await createTursoClient(ctx, {
    syncUrl: databaseUrl,
    authToken,
  });
  const thesisRepo = new ThesisStateRepository(storageClient);

  // Build filters
  const environment = options.environment ?? "BACKTEST";

  console.log(`📊 Fetching closed theses for environment: ${environment}`);
  if (options.since) {
    console.log(`   Since: ${options.since}`);
  }
  if (options.limit) {
    console.log(`   Limit: ${options.limit}`);
  }

  // Get closed theses
  const result = await thesisRepo.findMany(
    {
      state: "CLOSED",
      environment: environment as "BACKTEST" | "PAPER" | "LIVE",
      closedAfter: options.since,
    },
    options.limit ? { page: 1, pageSize: options.limit } : undefined
  );

  const closedTheses = result.data;

  if (closedTheses.length === 0) {
    console.log("\n✅ No closed theses found to backfill.");
    storageClient.close();
    return;
  }

  console.log(`\n📝 Found ${closedTheses.length} closed theses to process\n`);

  // Prepare ingestion inputs
  const inputs: ThesisIngestionInput[] = [];

  for (const thesis of closedTheses) {
    // Get regime at entry and exit
    const entryDate = thesis.entryDate ?? thesis.createdAt;
    const exitDate = thesis.closedAt ?? new Date().toISOString();

    const entryRegime = await getRegimeForDate(storageClient, entryDate);
    const exitRegime = await getRegimeForDate(storageClient, exitDate);

    inputs.push({
      thesis,
      entryRegime,
      exitRegime,
    });

    if (options.dryRun) {
      console.log(`  📄 ${thesis.thesisId}`);
      console.log(`     Instrument: ${thesis.instrumentId}`);
      console.log(`     Entry: ${entryDate} (${entryRegime})`);
      console.log(`     Exit: ${exitDate} (${exitRegime})`);
      console.log(`     P&L: ${thesis.realizedPnlPct?.toFixed(2) ?? "N/A"}%`);
      console.log(`     Reason: ${thesis.closeReason ?? "N/A"}`);
      console.log("");
    }
  }

  if (options.dryRun) {
    console.log(`\n✅ Dry run complete. Would ingest ${inputs.length} theses.`);
    storageClient.close();
    storageClient.close();
    return;
  }

  // Create HelixDB and embedding clients
  let helixClient: HelixClient | null = null;
  let embeddingClient: EmbeddingClient | null = null;

  try {
    helixClient = createHelixClientFromEnv();
    embeddingClient = createEmbeddingClient();
  } catch (error) {
    console.error("❌ Failed to create HelixDB or embedding client:", error);
    console.log("\nSkipping ingestion - ensure HELIX_HOST and GOOGLE_GENAI_API_KEY are set.");
    storageClient.close();
    storageClient.close();
    return;
  }

  // Batch ingest
  console.log("🚀 Starting batch ingestion...\n");

  const batchResult = await batchIngestClosedTheses(inputs, helixClient, embeddingClient);

  // Report results
  console.log("\n📊 Backfill Results:");
  console.log(`   ✅ Successful: ${batchResult.successful.length}`);
  console.log(`   ⏭️  Skipped: ${batchResult.skipped.length}`);
  console.log(`   ❌ Failed: ${batchResult.failed.length}`);
  console.log(`   ⏱️  Total time: ${(batchResult.totalExecutionTimeMs / 1000).toFixed(2)}s`);

  if (batchResult.failed.length > 0) {
    console.log("\n❌ Failed theses:");
    for (const failure of batchResult.failed) {
      console.log(`   - ${failure.thesisId}: ${failure.error}`);
    }
  }

  if (batchResult.skipped.length > 0) {
    console.log("\n⏭️  Skipped theses:");
    for (const skip of batchResult.skipped) {
      console.log(`   - ${skip.thesisId}: ${skip.reason}`);
    }
  }

  // Cleanup
  helixClient.close();
  storageClient.close();
  storageClient.close();

  console.log("\n✅ Backfill complete!");
}

// ============================================
// Entry Point
// ============================================

const options = parseArgs();

backfillThesisMemory(options).catch((error) => {
  console.error("❌ Backfill failed:", error);
  process.exit(1);
});
