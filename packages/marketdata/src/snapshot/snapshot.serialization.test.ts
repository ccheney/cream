import { describe, expect, it } from "bun:test";

import { buildSnapshot, compactSnapshot, getSnapshotSummary, serializeSnapshot } from "./builder";
import { createTestSources } from "./snapshot.test.fixtures";

describe("serializeSnapshot", () => {
	it("should serialize snapshot to compact JSON", async () => {
		const sources = createTestSources();
		const snapshot = await buildSnapshot("AAPL", Date.now(), sources, {
			useCache: false,
		});

		const json = serializeSnapshot(snapshot);
		expect(typeof json).toBe("string");

		const parsed = JSON.parse(json);
		expect(parsed.symbol).toBe("AAPL");
		expect(parsed.regime.label).toBe(snapshot.regime.regime);
	});
});

describe("compactSnapshot", () => {
	it("should compact snapshot removing nulls", async () => {
		const sources = createTestSources();
		const snapshot = await buildSnapshot("AAPL", Date.now(), sources, {
			useCache: false,
		});

		snapshot.indicators.null_indicator = null;

		const compacted = compactSnapshot(snapshot);
		expect(compacted.symbol).toBe("AAPL");
		expect((compacted.indicators as Record<string, number>).null_indicator).toBeUndefined();
	});

	it("should round numbers to specified precision", async () => {
		const sources = createTestSources();
		const snapshot = await buildSnapshot("AAPL", Date.now(), sources, {
			useCache: false,
		});

		const compacted = compactSnapshot(snapshot, 2);
		const priceStr = String(compacted.price);
		const parts = priceStr.split(".");
		const decimalPlaces = priceStr.includes(".") && parts[1] ? parts[1].length : 0;

		expect(decimalPlaces).toBeLessThanOrEqual(2);
	});
});

describe("getSnapshotSummary", () => {
	it("should generate summary string", async () => {
		const sources = createTestSources();
		const snapshot = await buildSnapshot("AAPL", Date.now(), sources, {
			useCache: false,
		});

		const summary = getSnapshotSummary(snapshot);

		expect(summary).toContain("AAPL");
		expect(summary).toContain("Price:");
		expect(summary).toContain("Regime:");
		expect(summary).toContain("Technology");
	});
});
