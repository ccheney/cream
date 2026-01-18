import { getDb, PredictionMarketsRepository } from "./src/index.js";

async function main() {
	const db = getDb();
	const repo = new PredictionMarketsRepository(db);

	const kalshiSnapshots = await repo.findSnapshots({ platform: "kalshi" }, 5);
	kalshiSnapshots.forEach((_s) => {});

	const polySnapshots = await repo.findSnapshots({ platform: "polymarket" }, 5);
	polySnapshots.forEach((_s) => {});

	process.exit(0);
}

main().catch((_e) => {
	process.exit(1);
});
