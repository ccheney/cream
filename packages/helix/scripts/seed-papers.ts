#!/usr/bin/env bun
/**
 * Seed Academic Papers into HelixDB
 *
 * Ingests foundational academic papers for the trader agent's
 * research capabilities. Safe to run multiple times (idempotent).
 *
 * Usage:
 *   bun run packages/helix/scripts/seed-papers.ts
 *
 * Environment:
 *   HELIX_HOST (default: localhost)
 *   HELIX_PORT (default: 6969)
 */

import { createHelixClientFromEnv, createPaperIngestionService } from "../src/index.js";

async function main(): Promise<void> {
	console.log("Seeding academic papers into HelixDB...\n");

	const client = createHelixClientFromEnv();

	const health = await client.healthCheck();
	if (!health.healthy) {
		console.error("HelixDB is not healthy:", health);
		process.exit(1);
	}
	console.log("HelixDB connection: OK\n");

	const service = createPaperIngestionService(client);
	const result = await service.ingestSeedPapers();

	console.log("Seed complete:\n");
	console.log(`  Papers ingested:    ${result.papersIngested}`);
	console.log(`  Duplicates skipped: ${result.duplicatesSkipped}`);
	console.log(`  Embeddings created: ${result.embeddingsGenerated}`);
	console.log(`  Execution time:     ${result.executionTimeMs.toFixed(0)}ms`);

	if (result.warnings.length > 0) {
		console.log("\nWarnings:");
		for (const warning of result.warnings) {
			console.log(`  - ${warning}`);
		}
	}

	if (result.errors.length > 0) {
		console.error("\nErrors:");
		for (const error of result.errors) {
			console.error(`  - ${error}`);
		}
		process.exit(1);
	}
}

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
