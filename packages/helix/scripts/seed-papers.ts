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
	const client = createHelixClientFromEnv();

	const health = await client.healthCheck();
	if (!health.healthy) {
		process.exit(1);
	}

	const service = createPaperIngestionService(client);
	const result = await service.ingestSeedPapers();

	if (result.warnings.length > 0) {
		for (const _warning of result.warnings) {
		}
	}

	if (result.errors.length > 0) {
		for (const _error of result.errors) {
		}
		process.exit(1);
	}
}

main().catch((_error) => {
	process.exit(1);
});
