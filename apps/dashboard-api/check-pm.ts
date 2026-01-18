import { PredictionMarketsRepository } from "@cream/storage";
import { getDb } from "./src/db.js";

async function main() {
	const db = getDb();
	const repo = new PredictionMarketsRepository(db);

	const _stats = await repo.getStats();

	const signals = await repo.getLatestSignals();
	for (const _s of signals.slice(0, 5)) {
	}

	const snapshots = await repo.findSnapshots({}, 5);
	for (const _s of snapshots) {
	}

	process.exit(0);
}

main().catch((_e) => {
	process.exit(1);
});
