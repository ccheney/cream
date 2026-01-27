#!/usr/bin/env bun
/**
 * Fix Close Reasons
 *
 * Updates theses that were incorrectly marked as MANUAL to REBALANCE
 * when they exited between stop and target levels.
 */

import { createNodeLogger } from "@cream/logger";
import { ThesisStateRepository } from "@cream/storage";

const log = createNodeLogger({ service: "fix-close-reasons" });

async function main(): Promise<void> {
	const dryRun = process.argv.includes("--dry-run");

	if (dryRun) {
		log.info("Running in DRY RUN mode - no changes will be made");
	}

	const thesisRepo = new ThesisStateRepository();

	// Find all CLOSED theses - we'll filter by MANUAL in the loop
	const allTheses = await thesisRepo.findByStates(["CLOSED"], "PAPER");

	const manualTheses = allTheses.filter((t) => t.closeReason === "MANUAL");

	log.info({ count: manualTheses.length }, "Found theses with MANUAL close reason");

	if (manualTheses.length === 0) {
		log.info("No theses to update");
		return;
	}

	let updated = 0;
	for (const thesis of manualTheses) {
		log.info(
			{ thesisId: thesis.thesisId, symbol: thesis.instrumentId },
			dryRun ? "Would update to REBALANCE" : "Updating to REBALANCE",
		);

		if (!dryRun) {
			await thesisRepo.updateCloseReason(thesis.thesisId, "REBALANCE");
			updated++;
		}
	}

	log.info({ updated: dryRun ? manualTheses.length : updated, dryRun }, "Fix complete");
}

main().catch((error) => {
	log.error({ error: error instanceof Error ? error.message : String(error) }, "Fix failed");
	process.exit(1);
});
