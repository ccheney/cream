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

  console.log(`Environment: ${environment}`);

  const client = useInMemory ? await createInMemoryClient() : await createTursoClient(ctx);

  try {
    if (isStatus) {
      const status = await getMigrationStatus(client);
      console.log("\nMigration Status:");
      console.log(`  Current version: ${status.currentVersion}`);
      console.log(`  Applied: ${status.applied.length}`);
      console.log(`  Pending: ${status.pending.length}`);

      if (status.applied.length > 0) {
        console.log("\nApplied migrations:");
        for (const m of status.applied) {
          console.log(`  [${m.version}] ${m.name} (applied: ${m.applied_at})`);
        }
      }

      if (status.pending.length > 0) {
        console.log("\nPending migrations:");
        for (const m of status.pending) {
          console.log(`  [${m.version}] ${m.name}`);
        }
      }
    } else if (isRollback) {
      const targetVersion = parseInt(args.find((a) => a.match(/^\d+$/)) || "0", 10);
      console.log(`\nRolling back to version ${targetVersion}...`);
      const result = await rollbackMigrations(client, { dryRun: isDryRun, targetVersion });
      console.log(`\nRolled back ${result.rolledBack.length} migration(s)`);
      console.log(`Current version: ${result.currentVersion}`);
      console.log(`Duration: ${result.durationMs}ms`);
    } else {
      console.log("\nRunning migrations...");
      const result = await runMigrations(client, { dryRun: isDryRun });
      console.log(`\nApplied ${result.applied.length} migration(s)`);
      console.log(`Current version: ${result.currentVersion}`);
      console.log(`Duration: ${result.durationMs}ms`);

      // Verify schema after migration
      if (!isDryRun && result.applied.length > 0) {
        console.log("\nVerifying schema...");
        const tables = await client.execute<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        );
        console.log("Tables:", tables.map((t) => t.name).join(", "));
      }
    }
  } finally {
    if (client.close) {
      await client.close();
    }
  }
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
