import { describe, expect, test } from "bun:test";

import { compareVersionRegistries, type VersionRegistry } from "../parity";

describe("compareVersionRegistries", () => {
	test("returns match when registries are identical", () => {
		const registry: VersionRegistry = {
			createdAt: "2026-01-04T00:00:00Z",
			environment: "PAPER",
			indicators: {
				sma: { id: "sma", version: "1.0.0", introducedAt: "2026-01-01T00:00:00Z" },
				rsi: { id: "rsi", version: "2.1.0", introducedAt: "2026-01-01T00:00:00Z" },
			},
		};

		const result = compareVersionRegistries(registry, {
			...registry,
			environment: "LIVE",
		});

		expect(result.match).toBe(true);
		expect(result.mismatches).toHaveLength(0);
		expect(result.missingFromLive).toHaveLength(0);
		expect(result.missingFromResearch).toHaveLength(0);
	});

	test("detects version mismatches", () => {
		const paper: VersionRegistry = {
			createdAt: "2026-01-04T00:00:00Z",
			environment: "PAPER",
			indicators: {
				sma: { id: "sma", version: "1.0.0", introducedAt: "2026-01-01T00:00:00Z" },
			},
		};

		const live: VersionRegistry = {
			createdAt: "2026-01-04T00:00:00Z",
			environment: "LIVE",
			indicators: {
				sma: { id: "sma", version: "2.0.0", introducedAt: "2026-01-01T00:00:00Z" },
			},
		};

		const result = compareVersionRegistries(paper, live);

		expect(result.match).toBe(false);
		expect(result.mismatches).toHaveLength(1);
		expect(result.mismatches[0]).toEqual({
			indicatorId: "sma",
			researchVersion: "1.0.0",
			liveVersion: "2.0.0",
		});
	});
});

describe("compareVersionRegistries", () => {
	test("detects missing indicators from live", () => {
		const paper: VersionRegistry = {
			createdAt: "2026-01-04T00:00:00Z",
			environment: "PAPER",
			indicators: {
				sma: { id: "sma", version: "1.0.0", introducedAt: "2026-01-01T00:00:00Z" },
				atr: { id: "atr", version: "1.0.0", introducedAt: "2026-01-01T00:00:00Z" },
			},
		};

		const live: VersionRegistry = {
			createdAt: "2026-01-04T00:00:00Z",
			environment: "LIVE",
			indicators: {
				sma: { id: "sma", version: "1.0.0", introducedAt: "2026-01-01T00:00:00Z" },
			},
		};

		const result = compareVersionRegistries(paper, live);

		expect(result.match).toBe(false);
		expect(result.missingFromLive).toContain("atr");
	});

	test("detects indicators missing from paper", () => {
		const paper: VersionRegistry = {
			createdAt: "2026-01-04T00:00:00Z",
			environment: "PAPER",
			indicators: {
				sma: { id: "sma", version: "1.0.0", introducedAt: "2026-01-01T00:00:00Z" },
			},
		};

		const live: VersionRegistry = {
			createdAt: "2026-01-04T00:00:00Z",
			environment: "LIVE",
			indicators: {
				sma: { id: "sma", version: "1.0.0", introducedAt: "2026-01-01T00:00:00Z" },
				macd: { id: "macd", version: "1.0.0", introducedAt: "2026-01-01T00:00:00Z" },
			},
		};

		const result = compareVersionRegistries(paper, live);

		expect(result.match).toBe(false);
		expect(result.missingFromResearch).toContain("macd");
	});
});
