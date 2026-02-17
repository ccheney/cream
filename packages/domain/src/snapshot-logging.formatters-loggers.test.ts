import { describe, expect, test } from "bun:test";
import type { MarketSnapshot } from "./marketSnapshot";
import type { SnapshotPerformanceMetrics, SnapshotSizeEstimate } from "./snapshot-limits";
import {
	createConsoleLogger,
	createLogEntry,
	createNoOpLogger,
	extractSnapshotMetrics,
	formatLogEntry,
	redactObject,
	type SnapshotLogEntry,
} from "./snapshot-logging";

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

	test("includes cycleId and fields", () => {
		const entry: SnapshotLogEntry = {
			level: "info",
			message: "Test message",
			timestamp: "2026-01-05T14:30:00Z",
			cycleId: "cycle-123",
			fields: { count: 5, symbol: "AAPL" },
		};
		const formatted = formatLogEntry(entry);
		expect(formatted).toContain("[cycle-123]");
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

describe("logger factories", () => {
	test("createConsoleLogger returns full logger interface", () => {
		const logger = createConsoleLogger();
		expect(typeof logger.debug).toBe("function");
		expect(typeof logger.info).toBe("function");
		expect(typeof logger.warn).toBe("function");
		expect(typeof logger.error).toBe("function");
	});

	test("createNoOpLogger methods do not throw", () => {
		const logger = createNoOpLogger();
		logger.debug({} as SnapshotLogEntry);
		logger.info({} as SnapshotLogEntry);
		logger.warn({} as SnapshotLogEntry);
		logger.error({} as SnapshotLogEntry);
	});
});

describe("additional edge coverage", () => {
	test("redactObject handles deeply nested structures", () => {
		const input = {
			level1: { level2: { level3: { apiKey: "secret", value: "ok" } } },
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
