import { describe, expect, test } from "bun:test";

import { type DataSourceMetadata, validateDataConsistency } from "../parity";

function createHistorical(overrides: Partial<DataSourceMetadata> = {}): DataSourceMetadata {
	return {
		provider: "alpaca",
		feedType: "historical",
		adjusted: true,
		startDate: "2025-01-01T00:00:00Z",
		endDate: "2025-12-31T23:59:59Z",
		symbols: ["AAPL", "MSFT", "GOOGL"],
		...overrides,
	};
}

function createRealtime(overrides: Partial<DataSourceMetadata> = {}): DataSourceMetadata {
	return {
		provider: "alpaca",
		feedType: "realtime",
		adjusted: true,
		startDate: "2026-01-01T00:00:00Z",
		endDate: "2026-01-04T00:00:00Z",
		symbols: ["AAPL", "MSFT", "GOOGL"],
		...overrides,
	};
}

describe("validateDataConsistency", () => {
	test("passes for consistent data sources", () => {
		const result = validateDataConsistency(createHistorical(), createRealtime());

		expect(result.consistent).toBe(true);
		expect(result.issues).toHaveLength(0);
	});

	test("warns about provider mismatch", () => {
		const result = validateDataConsistency(
			createHistorical({ provider: "polygon", symbols: ["AAPL"] }),
			createRealtime({ symbols: ["AAPL"] }),
		);

		expect(result.issues.some((issue) => issue.type === "provider_mismatch")).toBe(true);
		expect(result.recommendations.length).toBeGreaterThan(0);
	});
});

describe("validateDataConsistency", () => {
	test("fails on adjustment mismatch", () => {
		const result = validateDataConsistency(
			createHistorical({ adjusted: false, symbols: ["AAPL"] }),
			createRealtime({ symbols: ["AAPL"] }),
		);

		expect(result.consistent).toBe(false);
		expect(result.issues.some((issue) => issue.type === "adjustment_mismatch")).toBe(true);
	});

	test("warns about survivorship bias", () => {
		const result = validateDataConsistency(
			createHistorical({ symbols: ["AAPL", "MSFT"] }),
			createRealtime({ symbols: ["AAPL", "MSFT"] }),
			["LEHM"],
		);

		expect(result.issues.some((issue) => issue.type === "survivorship_bias")).toBe(true);
	});
});
