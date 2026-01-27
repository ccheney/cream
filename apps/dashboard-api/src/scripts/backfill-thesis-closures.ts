#!/usr/bin/env bun
/**
 * Backfill Thesis Closures
 *
 * Closes theses that have associated positions already closed,
 * but whose thesis state was never updated (before the feature was added).
 *
 * Usage:
 *   bun run apps/dashboard-api/src/scripts/backfill-thesis-closures.ts [--dry-run]
 */

import { createNodeLogger } from "@cream/logger";
import { type Position, PositionsRepository, ThesisStateRepository } from "@cream/storage";
import { closeThesisForPosition } from "../services/thesis-closure.js";

const log = createNodeLogger({ service: "backfill-thesis-closures" });

async function main(): Promise<void> {
	const dryRun = process.argv.includes("--dry-run");

	if (dryRun) {
		log.info("Running in DRY RUN mode - no changes will be made");
	}

	const positionsRepo = new PositionsRepository();
	const thesisRepo = new ThesisStateRepository();

	// Find all closed positions - paginate through all of them
	const allClosedPositions: Position[] = [];
	let offset = 0;
	const limit = 100;

	while (true) {
		const result = await positionsRepo.findMany({ status: "closed" }, { limit, offset });
		allClosedPositions.push(...result.data);
		if (result.data.length < limit) {
			break;
		}
		offset += limit;
	}

	const positionsWithThesis = allClosedPositions.filter((p) => p.thesisId !== null);

	log.info(
		{
			totalClosedPositions: allClosedPositions.length,
			positionsWithThesis: positionsWithThesis.length,
		},
		"Found closed positions with thesis references",
	);

	let updated = 0;
	let skipped = 0;
	let errors = 0;

	for (const position of positionsWithThesis) {
		if (!position.thesisId) {
			continue;
		}

		try {
			// Check if thesis is already closed
			const thesis = await thesisRepo.findById(position.thesisId);
			if (!thesis) {
				log.warn({ thesisId: position.thesisId, positionId: position.id }, "Thesis not found");
				skipped++;
				continue;
			}

			if (thesis.state === "CLOSED") {
				log.debug({ thesisId: position.thesisId }, "Thesis already closed");
				skipped++;
				continue;
			}

			// Calculate realized PnL if not already set on position
			const exitPrice = position.currentPrice ?? position.avgEntryPrice;
			const realizedPnl =
				position.realizedPnl ??
				(position.side === "long"
					? (exitPrice - position.avgEntryPrice) * Math.abs(position.quantity)
					: (position.avgEntryPrice - exitPrice) * Math.abs(position.quantity));

			log.info(
				{
					thesisId: position.thesisId,
					positionId: position.id,
					symbol: position.symbol,
					exitPrice,
					realizedPnl,
					side: position.side,
				},
				dryRun ? "Would close thesis" : "Closing thesis",
			);

			if (!dryRun) {
				await closeThesisForPosition({
					thesisId: position.thesisId,
					exitPrice,
					realizedPnl,
					side: position.side,
				});
			}
			updated++;
		} catch (error) {
			log.error(
				{
					thesisId: position.thesisId,
					positionId: position.id,
					error: error instanceof Error ? error.message : String(error),
				},
				"Failed to close thesis",
			);
			errors++;
		}
	}

	log.info(
		{
			updated,
			skipped,
			errors,
			dryRun,
		},
		"Backfill complete",
	);
}

main().catch((error) => {
	log.error({ error: error instanceof Error ? error.message : String(error) }, "Backfill failed");
	process.exit(1);
});
