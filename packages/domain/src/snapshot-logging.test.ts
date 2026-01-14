/**
 * Tests for Snapshot Logging and Observability
 */

import { describe, expect, test } from "bun:test";
import type { MarketSnapshot, SymbolSnapshot } from "./marketSnapshot";
import type { SnapshotPerformanceMetrics, SnapshotSizeEstimate } from "./snapshot-limits";
import {
	createConsoleLogger,
	createLogEntry,
	createNoOpLogger,
	diffSnapshots,
	extractSnapshotMetrics,
	formatLogEntry,
	formatSnapshotDiff,
	logDataSourceFetch,
	logSnapshotComplete,
	logSnapshotError,
	logSnapshotStart,
	logValidationResult,
	redactObject,
	redactSensitiveData,
	type SnapshotAssemblyMetrics,
	type SnapshotLogEntry,
	type SnapshotLogger,
} from "./snapshot-logging";

// ============================================
// Test Fixtures
// ============================================

function createMockSymbolSnapshot(symbol: string): SymbolSnapshot {
	return {
		symbol,
		quote: {
			symbol,
			bid: 150.0,
			ask: 150.05,
			bidSize: 1000,
			askSize: 800,
			last: 150.02,
			lastSize: 100,
			volume: 5000000,
			timestamp: "2026-01-05T14:30:00Z",
		},
		bars: [
			{
				symbol,
				timestamp: "2026-01-05T14:00:00Z",
				timeframeMinutes: 60,
				open: 149.0,
				high: 151.0,
				low: 148.5,
				close: 150.0,
				volume: 100000,
			},
		],
		dayHigh: 151.0,
		dayLow: 148.5,
		prevClose: 149.0,
		open: 149.5,
		marketStatus: "OPEN",
		asOf: "2026-01-05T14:30:00Z",
	};
}

function createMockMarketSnapshot(symbols: string[] = ["AAPL", "MSFT"]): MarketSnapshot {
	return {
		environment: "PAPER",
		asOf: "2026-01-05T14:30:00Z",
		marketStatus: "OPEN",
		regime: "BULL_TREND",
		symbols: symbols.map(createMockSymbolSnapshot),
	};
}

function createMockLogger(): SnapshotLogger & { entries: SnapshotLogEntry[] } {
	const entries: SnapshotLogEntry[] = [];
	return {
		entries,
		debug(entry) {
			entries.push(entry);
		},
		info(entry) {
			entries.push(entry);
		},
		warn(entry) {
			entries.push(entry);
		},
		error(entry) {
			entries.push(entry);
		},
	};
}

// ============================================
// Redaction Tests
// ============================================

describe("redactSensitiveData", () => {
	test("redacts API keys", () => {
		const input = 'api_key="sk_12345_secret"';
		const result = redactSensitiveData(input);
		expect(result).toContain("[REDACTED]");
		expect(result).not.toContain("sk_12345_secret");
	});

	test("redacts bearer tokens", () => {
		const input = "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
		const result = redactSensitiveData(input);
		expect(result).toContain("[REDACTED]");
		expect(result).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
	});

	test("redacts secret values", () => {
		const input = "secret=my_super_secret_value";
		const result = redactSensitiveData(input);
		expect(result).toContain("[REDACTED]");
		expect(result).not.toContain("my_super_secret_value");
	});

	test("preserves non-sensitive data", () => {
		const input = "symbol=AAPL price=150.00";
		const result = redactSensitiveData(input);
		expect(result).toBe(input);
	});
});

describe("redactObject", () => {
	test("redacts sensitive fields by key name", () => {
		const input = {
			apiKey: "secret123",
			secret: "supersecret",
			token: "bearer_token",
			symbol: "AAPL",
			price: 150.0,
		};

		const result = redactObject(input) as Record<string, unknown>;

		expect(result.apiKey).toBe("[REDACTED]");
		expect(result.secret).toBe("[REDACTED]");
		expect(result.token).toBe("[REDACTED]");
		expect(result.symbol).toBe("AAPL");
		expect(result.price).toBe(150.0);
	});

	test("redacts nested objects", () => {
		const input = {
			broker: {
				apiKey: "secret123",
				name: "Alpaca",
			},
		};

		const result = redactObject(input) as { broker: { apiKey: string; name: string } };

		expect(result.broker.apiKey).toBe("[REDACTED]");
		expect(result.broker.name).toBe("Alpaca");
	});

	test("redacts arrays", () => {
		const input = ["apiKey=secret123", "normal value"];

		const result = redactObject(input) as string[];

		expect(result[0]).toContain("[REDACTED]");
		expect(result[1]).toBe("normal value");
	});

	test("handles null and undefined", () => {
		expect(redactObject(null)).toBeNull();
		expect(redactObject(undefined)).toBeUndefined();
	});

	test("handles primitives", () => {
		expect(redactObject(123)).toBe(123);
		expect(redactObject(true)).toBe(true);
	});
});

// ============================================
// Logging Function Tests
// ============================================

describe("logSnapshotStart", () => {
	test("logs start event with correct fields", () => {
		const logger = createMockLogger();

		logSnapshotStart(logger, "cycle-123", 10, "PAPER");

		expect(logger.entries).toHaveLength(1);
		expect(logger.entries[0].level).toBe("info");
		expect(logger.entries[0].message).toBe("Snapshot assembly started");
		expect(logger.entries[0].cycleId).toBe("cycle-123");
		expect(logger.entries[0].environment).toBe("PAPER");
		expect(logger.entries[0].fields.universeSize).toBe(10);
		expect(logger.entries[0].fields.phase).toBe("start");
	});
});

describe("logSnapshotComplete", () => {
	test("logs complete event with metrics", () => {
		const logger = createMockLogger();
		const metrics: SnapshotAssemblyMetrics = {
			cycleId: "cycle-123",
			environment: "PAPER",
			universeSize: 10,
			positionCount: 5,
			candleCount: 100,
			eventCount: 20,
			assemblyTimeMs: 150,
			snapshotSizeBytes: 50000,
			tokenEstimate: 5000,
			validationErrors: [],
			dataSources: ["polygon", "indicators"],
			warnings: [],
		};

		logSnapshotComplete(logger, metrics);

		expect(logger.entries).toHaveLength(1);
		expect(logger.entries[0].level).toBe("info");
		expect(logger.entries[0].message).toBe("Snapshot assembly completed");
		expect(logger.entries[0].fields.assemblyTimeMs).toBe(150);
		expect(logger.entries[0].fields.snapshotSizeBytes).toBe(50000);
	});

	test("logs warnings separately", () => {
		const logger = createMockLogger();
		const metrics: SnapshotAssemblyMetrics = {
			cycleId: "cycle-123",
			environment: "PAPER",
			universeSize: 10,
			positionCount: 5,
			candleCount: 100,
			eventCount: 20,
			assemblyTimeMs: 150,
			snapshotSizeBytes: 50000,
			tokenEstimate: 5000,
			validationErrors: [],
			dataSources: ["polygon"],
			warnings: ["Missing SPY data", "Slow response"],
		};

		logSnapshotComplete(logger, metrics);

		expect(logger.entries).toHaveLength(3); // 1 complete + 2 warnings
		expect(logger.entries[1].level).toBe("warn");
		expect(logger.entries[1].message).toBe("Missing SPY data");
		expect(logger.entries[2].message).toBe("Slow response");
	});

	test("logs validation errors separately", () => {
		const logger = createMockLogger();
		const metrics: SnapshotAssemblyMetrics = {
			cycleId: "cycle-123",
			environment: "PAPER",
			universeSize: 10,
			positionCount: 5,
			candleCount: 100,
			eventCount: 20,
			assemblyTimeMs: 150,
			snapshotSizeBytes: 50000,
			tokenEstimate: 5000,
			validationErrors: ["Invalid price", "Missing timestamp"],
			dataSources: ["polygon"],
			warnings: [],
		};

		logSnapshotComplete(logger, metrics);

		expect(logger.entries).toHaveLength(3); // 1 complete + 2 errors
		expect(logger.entries[0].level).toBe("warn"); // Complete is warn when errors exist
		expect(logger.entries[1].level).toBe("error");
		expect(logger.entries[2].level).toBe("error");
	});
});

describe("logSnapshotError", () => {
	test("logs error with Error object", () => {
		const logger = createMockLogger();
		const error = new Error("Test error");

		logSnapshotError(logger, "cycle-123", error);

		expect(logger.entries).toHaveLength(1);
		expect(logger.entries[0].level).toBe("error");
		expect(logger.entries[0].message).toContain("Test error");
		expect(logger.entries[0].fields.errorType).toBe("Error");
		expect(logger.entries[0].fields.stack).toBeDefined();
	});

	test("logs error with string", () => {
		const logger = createMockLogger();

		logSnapshotError(logger, "cycle-123", "Something went wrong");

		expect(logger.entries).toHaveLength(1);
		expect(logger.entries[0].message).toContain("Something went wrong");
	});

	test("includes additional context", () => {
		const logger = createMockLogger();

		logSnapshotError(logger, "cycle-123", "Error", { symbol: "AAPL", step: "fetch" });

		expect(logger.entries[0].fields.symbol).toBe("AAPL");
		expect(logger.entries[0].fields.step).toBe("fetch");
	});
});

describe("logDataSourceFetch", () => {
	test("logs successful fetch at debug level", () => {
		const logger = createMockLogger();

		logDataSourceFetch(logger, "cycle-123", "polygon", true, 50, 100);

		expect(logger.entries).toHaveLength(1);
		expect(logger.entries[0].level).toBe("debug");
		expect(logger.entries[0].message).toContain("polygon");
		expect(logger.entries[0].fields.success).toBe(true);
		expect(logger.entries[0].fields.durationMs).toBe(50);
		expect(logger.entries[0].fields.recordCount).toBe(100);
	});

	test("logs failed fetch at warn level", () => {
		const logger = createMockLogger();

		logDataSourceFetch(logger, "cycle-123", "polygon", false, 5000);

		expect(logger.entries).toHaveLength(1);
		expect(logger.entries[0].level).toBe("warn");
		expect(logger.entries[0].fields.success).toBe(false);
	});
});

describe("logValidationResult", () => {
	test("logs successful validation at info level", () => {
		const logger = createMockLogger();

		logValidationResult(logger, "cycle-123", true);

		expect(logger.entries).toHaveLength(1);
		expect(logger.entries[0].level).toBe("info");
		expect(logger.entries[0].message).toContain("passed");
		expect(logger.entries[0].fields.valid).toBe(true);
	});

	test("logs failed validation at error level", () => {
		const logger = createMockLogger();

		logValidationResult(logger, "cycle-123", false, ["Error 1", "Error 2"]);

		expect(logger.entries).toHaveLength(1);
		expect(logger.entries[0].level).toBe("error");
		expect(logger.entries[0].message).toContain("failed");
		expect(logger.entries[0].fields.errorCount).toBe(2);
	});
});

// ============================================
// Metrics Extraction Tests
// ============================================

describe("extractSnapshotMetrics", () => {
	test("extracts metrics from snapshot", () => {
		const snapshot = createMockMarketSnapshot(["AAPL", "MSFT", "GOOGL"]);
		const performanceMetrics: SnapshotPerformanceMetrics = {
			totalMs: 150,
			fetchMs: 80,
			indicatorMs: 30,
			validationMs: 20,
			serializationMs: 10,
			withinTarget: true,
			warnings: ["Slow fetch"],
		};
		const sizeEstimate: SnapshotSizeEstimate = {
			bytes: 50000,
			tokens: 5000,
			breakdown: { symbols: 10000, bars: 30000, quotes: 5000, metadata: 5000 },
			withinTarget: true,
			withinMax: true,
		};

		const metrics = extractSnapshotMetrics(snapshot, "cycle-123", performanceMetrics, sizeEstimate);

		expect(metrics.cycleId).toBe("cycle-123");
		expect(metrics.environment).toBe("PAPER");
		expect(metrics.universeSize).toBe(3);
		expect(metrics.candleCount).toBe(3); // 1 bar per symbol
		expect(metrics.assemblyTimeMs).toBe(150);
		expect(metrics.snapshotSizeBytes).toBe(50000);
		expect(metrics.tokenEstimate).toBe(5000);
		expect(metrics.warnings).toEqual(["Slow fetch"]);
	});
});

// ============================================
// Snapshot Diff Tests
// ============================================

describe("diffSnapshots", () => {
	test("detects identical snapshots", () => {
		const snapshot = createMockMarketSnapshot();
		const result = diffSnapshots(snapshot, snapshot);

		expect(result.identical).toBe(true);
		expect(result.diffCount).toBe(0);
	});

	test("detects regime change", () => {
		const previous = createMockMarketSnapshot();
		const current = { ...previous, regime: "BEAR_TREND" as const };

		const result = diffSnapshots(previous, current);

		expect(result.identical).toBe(false);
		expect(result.summary.regimeChanged).toBe(true);
		expect(result.diffs.some((d) => d.path === "regime")).toBe(true);
	});

	test("detects market status change", () => {
		const previous = createMockMarketSnapshot();
		const current = { ...previous, marketStatus: "CLOSED" as const };

		const result = diffSnapshots(previous, current);

		expect(result.summary.marketStatusChanged).toBe(true);
	});

	test("detects added symbols", () => {
		const previous = createMockMarketSnapshot(["AAPL"]);
		const current = createMockMarketSnapshot(["AAPL", "MSFT"]);

		const result = diffSnapshots(previous, current);

		expect(result.summary.symbolsAdded).toContain("MSFT");
	});

	test("detects removed symbols", () => {
		const previous = createMockMarketSnapshot(["AAPL", "MSFT"]);
		const current = createMockMarketSnapshot(["AAPL"]);

		const result = diffSnapshots(previous, current);

		expect(result.summary.symbolsRemoved).toContain("MSFT");
	});

	test("detects modified symbols", () => {
		const previous = createMockMarketSnapshot(["AAPL"]);
		const current = createMockMarketSnapshot(["AAPL"]);
		if (current.symbols?.[0]) {
			current.symbols[0].dayHigh = 200.0;
		}

		const result = diffSnapshots(previous, current);

		expect(result.summary.symbolsModified).toContain("AAPL");
	});

	test("respects includeQuotes option", () => {
		const previous = createMockMarketSnapshot(["AAPL"]);
		const current = createMockMarketSnapshot(["AAPL"]);
		if (current.symbols?.[0]?.quote) {
			current.symbols[0].quote.last = 200.0;
		}

		const withQuotes = diffSnapshots(previous, current, { includeQuotes: true });
		const withoutQuotes = diffSnapshots(previous, current, { includeQuotes: false });

		expect(withQuotes.diffs.some((d) => d.path.includes("quote.last"))).toBe(true);
		expect(withoutQuotes.diffs.some((d) => d.path.includes("quote.last"))).toBe(false);
	});

	test("respects maxDiffs option", () => {
		const previous = createMockMarketSnapshot(["AAPL", "MSFT", "GOOGL"]);
		const current = createMockMarketSnapshot(["AAPL", "MSFT", "GOOGL"]);

		// Modify all symbols
		if (current.symbols) {
			for (const sym of current.symbols) {
				sym.dayHigh = 200.0;
				sym.dayLow = 100.0;
			}
		}

		const result = diffSnapshots(previous, current, { maxDiffs: 2 });

		expect(result.diffs.length).toBe(2);
		expect(result.diffCount).toBeGreaterThanOrEqual(2);
	});

	test("detects bid price change", () => {
		const previous = createMockMarketSnapshot(["AAPL"]);
		const current = createMockMarketSnapshot(["AAPL"]);
		if (current.symbols?.[0]?.quote) {
			current.symbols[0].quote.bid = 155.0; // Changed from 150.0
		}

		const result = diffSnapshots(previous, current, { includeQuotes: true });

		expect(result.diffs.some((d) => d.path.includes("quote.bid"))).toBe(true);
	});

	test("detects ask price change", () => {
		const previous = createMockMarketSnapshot(["AAPL"]);
		const current = createMockMarketSnapshot(["AAPL"]);
		if (current.symbols?.[0]?.quote) {
			current.symbols[0].quote.ask = 160.0; // Changed from 150.05
		}

		const result = diffSnapshots(previous, current, { includeQuotes: true });

		expect(result.diffs.some((d) => d.path.includes("quote.ask"))).toBe(true);
	});

	test("detects bar count change when includeBars is true", () => {
		const previous = createMockMarketSnapshot(["AAPL"]);
		const current = createMockMarketSnapshot(["AAPL"]);
		// Add an extra bar to current
		if (current.symbols?.[0]?.bars) {
			current.symbols[0].bars.push({
				symbol: "AAPL",
				timestamp: "2026-01-05T15:00:00Z",
				timeframeMinutes: 60,
				open: 152.0,
				high: 153.0,
				low: 151.0,
				close: 152.5,
				volume: 1500000,
			});
		}

		const result = diffSnapshots(previous, current, { includeBars: true });

		expect(result.diffs.some((d) => d.path.includes("bars.length"))).toBe(true);
	});
});

describe("formatSnapshotDiff", () => {
	test("formats identical snapshots", () => {
		const snapshot = createMockMarketSnapshot();
		const result = diffSnapshots(snapshot, snapshot);

		const formatted = formatSnapshotDiff(result);

		expect(formatted).toBe("Snapshots are identical");
	});

	test("formats diff with changes", () => {
		const previous = createMockMarketSnapshot(["AAPL"]);
		const current = createMockMarketSnapshot(["AAPL", "MSFT"]);
		current.regime = "BEAR_TREND";

		const result = diffSnapshots(previous, current);
		const formatted = formatSnapshotDiff(result);

		expect(formatted).toContain("differences found");
		expect(formatted).toContain("Regime changed");
		expect(formatted).toContain("symbols added");
		expect(formatted).toContain("MSFT");
	});

	test("formats market status change", () => {
		const previous = createMockMarketSnapshot(["AAPL"]);
		const current = { ...createMockMarketSnapshot(["AAPL"]), marketStatus: "CLOSED" as const };

		const result = diffSnapshots(previous, current);
		const formatted = formatSnapshotDiff(result);

		expect(formatted).toContain("Market status changed");
	});

	test("formats symbols removed", () => {
		const previous = createMockMarketSnapshot(["AAPL", "MSFT"]);
		const current = createMockMarketSnapshot(["AAPL"]);

		const result = diffSnapshots(previous, current);
		const formatted = formatSnapshotDiff(result);

		expect(formatted).toContain("symbols removed");
		expect(formatted).toContain("MSFT");
	});

	test("formats symbols modified", () => {
		const previous = createMockMarketSnapshot(["AAPL"]);
		const current = createMockMarketSnapshot(["AAPL"]);
		if (current.symbols?.[0]) {
			current.symbols[0].dayHigh = 200.0;
		}

		const result = diffSnapshots(previous, current);
		const formatted = formatSnapshotDiff(result);

		expect(formatted).toContain("symbols modified");
		expect(formatted).toContain("AAPL");
	});
});

// ============================================
// Log Entry Formatting Tests
// ============================================

describe("formatLogEntry", () => {
	test("formats basic entry", () => {
		const entry: SnapshotLogEntry = {
			level: "info",
			message: "Test message",
			timestamp: "2026-01-05T14:30:00Z",
			fields: {},
		};

		const formatted = formatLogEntry(entry);

		expect(formatted).toContain("[2026-01-05T14:30:00Z]");
		expect(formatted).toContain("[INFO]");
		expect(formatted).toContain("Test message");
	});

	test("includes cycleId when present", () => {
		const entry: SnapshotLogEntry = {
			level: "info",
			message: "Test message",
			timestamp: "2026-01-05T14:30:00Z",
			cycleId: "cycle-123",
			fields: {},
		};

		const formatted = formatLogEntry(entry);

		expect(formatted).toContain("[cycle-123]");
	});

	test("includes fields as JSON", () => {
		const entry: SnapshotLogEntry = {
			level: "info",
			message: "Test message",
			timestamp: "2026-01-05T14:30:00Z",
			fields: { count: 5, symbol: "AAPL" },
		};

		const formatted = formatLogEntry(entry);

		expect(formatted).toContain('"count":5');
		expect(formatted).toContain('"symbol":"AAPL"');
	});
});

describe("createLogEntry", () => {
	test("creates entry with all fields", () => {
		const entry = createLogEntry("warn", "Warning message", { key: "value" }, "cycle-123", "PAPER");

		expect(entry.level).toBe("warn");
		expect(entry.message).toBe("Warning message");
		expect(entry.cycleId).toBe("cycle-123");
		expect(entry.environment).toBe("PAPER");
		expect(entry.fields.key).toBe("value");
		expect(entry.timestamp).toBeDefined();
	});

	test("handles optional fields", () => {
		const entry = createLogEntry("info", "Message");

		expect(entry.cycleId).toBeUndefined();
		expect(entry.environment).toBeUndefined();
		expect(entry.fields).toEqual({});
	});
});

// ============================================
// Logger Factory Tests
// ============================================

describe("createConsoleLogger", () => {
	test("creates a logger with all methods", () => {
		const logger = createConsoleLogger();

		expect(typeof logger.debug).toBe("function");
		expect(typeof logger.info).toBe("function");
		expect(typeof logger.warn).toBe("function");
		expect(typeof logger.error).toBe("function");
	});
});

describe("createNoOpLogger", () => {
	test("creates a logger that does nothing", () => {
		const logger = createNoOpLogger();

		// Should not throw
		logger.debug({} as SnapshotLogEntry);
		logger.info({} as SnapshotLogEntry);
		logger.warn({} as SnapshotLogEntry);
		logger.error({} as SnapshotLogEntry);
	});
});

// ============================================
// Edge Cases
// ============================================

describe("edge cases", () => {
	test("diffSnapshots handles empty symbol arrays", () => {
		const previous: MarketSnapshot = {
			environment: "PAPER",
			asOf: "2026-01-05T14:30:00Z",
			marketStatus: "OPEN",
			regime: "BULL_TREND",
			symbols: [],
		};
		const current = { ...previous };

		const result = diffSnapshots(previous, current);

		expect(result.identical).toBe(true);
	});

	test("diffSnapshots handles undefined symbols", () => {
		const previous: MarketSnapshot = {
			environment: "PAPER",
			asOf: "2026-01-05T14:30:00Z",
			marketStatus: "OPEN",
			regime: "BULL_TREND",
			symbols: undefined as unknown as SymbolSnapshot[],
		};
		const current = { ...previous };

		const result = diffSnapshots(previous, current);

		expect(result.identical).toBe(true);
	});

	test("redactObject handles deeply nested structures", () => {
		const input = {
			level1: {
				level2: {
					level3: {
						apiKey: "secret",
						value: "ok",
					},
				},
			},
		};

		const result = redactObject(input) as typeof input;

		expect(result.level1.level2.level3.apiKey).toBe("[REDACTED]");
		expect(result.level1.level2.level3.value).toBe("ok");
	});

	test("extractSnapshotMetrics handles snapshot with no symbols", () => {
		const snapshot: MarketSnapshot = {
			environment: "PAPER",
			asOf: "2026-01-05T14:30:00Z",
			marketStatus: "OPEN",
			regime: "BULL_TREND",
			symbols: [],
		};
		const performanceMetrics: SnapshotPerformanceMetrics = {
			totalMs: 50,
			fetchMs: 20,
			indicatorMs: 10,
			validationMs: 10,
			serializationMs: 5,
			withinTarget: true,
			warnings: [],
		};
		const sizeEstimate: SnapshotSizeEstimate = {
			bytes: 1000,
			tokens: 100,
			breakdown: { symbols: 0, bars: 0, quotes: 0, metadata: 1000 },
			withinTarget: true,
			withinMax: true,
		};

		const metrics = extractSnapshotMetrics(snapshot, "cycle-123", performanceMetrics, sizeEstimate);

		expect(metrics.universeSize).toBe(0);
		expect(metrics.candleCount).toBe(0);
	});
});
