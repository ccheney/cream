import { getDb, PredictionMarketsRepository } from "./src/index.js";

async function main() {
	const db = getDb();
	const repo = new PredictionMarketsRepository(db);

	const kalshiSnapshots = await repo.findSnapshots({ platform: "kalshi" }, 5);
	console.log("Kalshi Snapshots:", kalshiSnapshots.length);
	kalshiSnapshots.forEach((s) =>
		console.log("  - " + s.marketTicker + " (" + s.snapshotTime + ")")
	);

	const polySnapshots = await repo.findSnapshots({ platform: "polymarket" }, 5);
	console.log("\nPolymarket Snapshots:", polySnapshots.length);
	polySnapshots.forEach((s) => console.log("  - " + s.marketTicker + " (" + s.snapshotTime + ")"));

	process.exit(0);
}

main().catch((e) => {
	console.error("Error:", e.message);
	process.exit(1);
});
