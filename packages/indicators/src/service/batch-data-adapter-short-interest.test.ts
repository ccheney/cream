/**
 * Short interest adapter tests for BatchDataAdapter
 */

import { expect, test } from "bun:test";
import { requireValue } from "@cream/test-utils";
import {
	createShortInterestRepositoryAdapter,
	ShortInterestRepositoryAdapter,
	type StorageShortInterestRow,
} from "./batch-data-adapter";
import { createMockShortInterestRepo } from "./batch-data-adapter.test-helpers";

const fullShortInterestRow: StorageShortInterestRow = {
	id: "si-1",
	symbol: "GME",
	settlementDate: "2026-01-08",
	shortInterest: 50000000,
	shortInterestRatio: 5.2,
	daysToCover: 3.5,
	shortPctFloat: 0.25,
	shortInterestChange: 0.05,
	source: "FINRA",
	fetchedAt: "2026-01-10T12:00:00Z",
};

const nullsShortInterestRow: StorageShortInterestRow = {
	id: "si-2",
	symbol: "AMC",
	settlementDate: "2026-01-08",
	shortInterest: 30000000,
	shortInterestRatio: null,
	daysToCover: null,
	shortPctFloat: 0.15,
	shortInterestChange: null,
	source: "FINRA",
	fetchedAt: "2026-01-10T12:00:00Z",
};

test("ShortInterestRepositoryAdapter returns null when no data exists", async () => {
	const mockRepo = createMockShortInterestRepo(new Map());
	const adapter = new ShortInterestRepositoryAdapter(mockRepo);

	const result = await adapter.getLatest("GME");

	expect(result).toBeNull();
});

test("ShortInterestRepositoryAdapter transforms row to indicators", async () => {
	const mockRepo = createMockShortInterestRepo(new Map([["GME", fullShortInterestRow]]));
	const adapter = new ShortInterestRepositoryAdapter(mockRepo);

	const result = await adapter.getLatest("GME");
	const latest = requireValue(result, "result");

	expect(latest.short_interest_ratio).toBe(5.2);
	expect(latest.days_to_cover).toBe(3.5);
	expect(latest.short_pct_float).toBe(0.25);
	expect(latest.short_interest_change).toBe(0.05);
	expect(latest.settlement_date).toBe("2026-01-08");
});

test("ShortInterestRepositoryAdapter handles null values in row", async () => {
	const mockRepo = createMockShortInterestRepo(new Map([["AMC", nullsShortInterestRow]]));
	const adapter = new ShortInterestRepositoryAdapter(mockRepo);

	const result = await adapter.getLatest("AMC");
	const latest = requireValue(result, "result");

	expect(latest.short_interest_ratio).toBeNull();
	expect(latest.days_to_cover).toBeNull();
	expect(latest.short_pct_float).toBe(0.15);
});

test("createShortInterestRepositoryAdapter creates adapter from factory", async () => {
	const mockRepo = createMockShortInterestRepo(new Map());
	const adapter = createShortInterestRepositoryAdapter(mockRepo);

	expect(adapter).toBeInstanceOf(ShortInterestRepositoryAdapter);
	expect(typeof adapter.getLatest).toBe("function");
});
