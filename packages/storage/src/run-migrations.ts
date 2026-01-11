#!/usr/bin/env bun
/**
 * Migration Runner Script
 *
 * Run database migrations for the Turso database.
 *
 * Usage:
 *   bun run src/run-migrations.ts              # Run migrations
 *   bun run src/run-migrations.ts --status     # Show status
 *   bun run src/run-migrations.ts --dry-run    # Preview changes
 *   bun run src/run-migrations.ts --rollback   # Rollback last migration
 */

import { createContext, requireEnv } from "@cream/domain";
import { log } from "./logger.js";
import { getMigrationStatus, rollbackMigrations, runMigrations } from "./migrations.js";
import { createInMemoryClient, createTursoClient } from "./turso.js";

async function main() {
  const args = process.argv.slice(2);
  const isStatus = args.includes("--status");
  const isDryRun = args.includes("--dry-run");
  const isRollback = args.includes("--rollback");
  const useInMemory = args.includes("--in-memory");

  // Create ExecutionContext from environment (CLI is a system boundary)
  const environment = requireEnv();
  const ctx = createContext(environment, "manual");

  log.info({ environment }, "Starting migration runner");

  const client = useInMemory ? await createInMemoryClient() : await createTursoClient(ctx);

  try {
    if (isStatus) {
      const status = await getMigrationStatus(client);
      log.info(
        {
          currentVersion: status.currentVersion,
          appliedCount: status.applied.length,
          pendingCount: status.pending.length,
        },
        "Migration status"
      );

      if (status.applied.length > 0) {
        for (const m of status.applied) {
          log.info(
            { version: m.version, name: m.name, appliedAt: m.applied_at },
            "Applied migration"
          );
        }
      }

      if (status.pending.length > 0) {
        for (const m of status.pending) {
          log.info({ version: m.version, name: m.name }, "Pending migration");
        }
      }
    } else if (isRollback) {
      const targetVersion = parseInt(args.find((a) => a.match(/^\d+$/)) || "0", 10);
      log.info({ targetVersion }, "Rolling back migrations");
      const result = await rollbackMigrations(client, { dryRun: isDryRun, targetVersion });
      log.info(
        {
          rolledBackCount: result.rolledBack.length,
          currentVersion: result.currentVersion,
          durationMs: result.durationMs,
        },
        "Rollback complete"
      );
    } else {
      log.info({}, "Running migrations");
      const result = await runMigrations(client, { dryRun: isDryRun });
      log.info(
        {
          appliedCount: result.applied.length,
          currentVersion: result.currentVersion,
          durationMs: result.durationMs,
        },
        "Migrations complete"
      );

      if (!isDryRun && result.applied.length > 0) {
        log.info({}, "Verifying schema");
        const tables = await client.execute<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        );
        log.info({ tables: tables.map((t) => t.name) }, "Schema verified");
      }
    }
  } finally {
    if (client.close) {
      await client.close();
    }
  }
}

main().catch((error) => {
  log.error({ error: error instanceof Error ? error.message : String(error) }, "Migration failed");
  process.exit(1);
});
