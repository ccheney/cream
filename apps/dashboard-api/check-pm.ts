import { PredictionMarketsRepository } from "@cream/storage";
import { getDb } from "./src/db.js";

async function main() {
	const db = getDb();
	const repo = new PredictionMarketsRepository(db);

	console.log("=== Prediction Markets Data Check ===\n");

	const stats = await repo.getStats();
	console.log("Stats:", JSON.stringify(stats, null, 2));

	const signals = await repo.getLatestSignals();
	console.log("\nLatest Signals:", signals.length);
	for (const s of signals.slice(0, 5)) {
		console.log(`  - ${s.signalType}: ${s.signalValue} (${s.computedAt})`);
	}

	const snapshots = await repo.findSnapshots({}, 5);
	console.log("\nLatest Snapshots:", snapshots.length);
	for (const s of snapshots) {
		console.log(`  - ${s.platform}/${s.marketTicker} (${s.snapshotTime})`);
	}

	process.exit(0);
}

main().catch((e) => {
	console.error("Error:", e.message);
	process.exit(1);
});
