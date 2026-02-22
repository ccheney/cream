import { afterEach, expect, test } from "bun:test";
import type { ScannerAlert } from "@cream/domain/grpc";
import { createAlertBatcher } from "./alert-batcher.js";

type ScannerAlertOverrides = Omit<Partial<ScannerAlert>, "$typeName">;

function createAlert(symbol: string, overrides: ScannerAlertOverrides = {}): ScannerAlert {
	return {
		$typeName: "cream.v1.ScannerAlert",
		symbol,
		signals: [],
		price: 100,
		volume: 1000n,
		avgVolume: 100n,
		volumeRatio: 2,
		priceChangePct: 1,
		gapPct: 0,
		approxAtr: 1,
		...overrides,
	};
}

const createdBatchers: ReturnType<typeof createAlertBatcher>[] = [];

afterEach(() => {
	for (const batcher of createdBatchers) {
		batcher.stop();
	}
	createdBatchers.length = 0;
});

test("deduplicates alerts by symbol and keeps strongest signal", async () => {
	const batches: string[][] = [];
	const batcher = createAlertBatcher({
		quietWindowMs: 15,
		maxWindowMs: 50,
		onBatch: (symbols) => {
			batches.push(symbols);
		},
	});
	createdBatchers.push(batcher);

	batcher.addAlert(createAlert("AAPL", { volumeRatio: 2 }));
	batcher.addAlert(createAlert("AAPL", { volumeRatio: 6 }));
	batcher.addAlert(createAlert("MSFT", { volumeRatio: 3 }));

	await Bun.sleep(30);

	expect(batches).toHaveLength(1);
	expect(batches[0]).toEqual(["AAPL", "MSFT"]);
});

test("batches alerts that arrive inside the quiet window", async () => {
	const batches: string[][] = [];
	const batcher = createAlertBatcher({
		quietWindowMs: 20,
		maxWindowMs: 80,
		onBatch: (symbols) => {
			batches.push(symbols);
		},
	});
	createdBatchers.push(batcher);

	batcher.addAlert(createAlert("AAPL"));
	await Bun.sleep(10);
	batcher.addAlert(createAlert("TSLA"));
	await Bun.sleep(15);

	expect(batches).toHaveLength(0);

	await Bun.sleep(15);

	expect(batches).toHaveLength(1);
	expect(new Set(batches[0])).toEqual(new Set(["AAPL", "TSLA"]));
});

test("enforces maxCandidates when flushing", async () => {
	const batches: string[][] = [];
	const batcher = createAlertBatcher({
		quietWindowMs: 10,
		maxWindowMs: 40,
		maxCandidates: 2,
		onBatch: (symbols) => {
			batches.push(symbols);
		},
	});
	createdBatchers.push(batcher);

	batcher.addAlert(createAlert("AAPL", { volumeRatio: 9 }));
	batcher.addAlert(createAlert("MSFT", { volumeRatio: 8 }));
	batcher.addAlert(createAlert("NVDA", { volumeRatio: 7 }));

	await Bun.sleep(25);

	expect(batches).toHaveLength(1);
	expect(batches[0]).toEqual(["AAPL", "MSFT"]);
});
