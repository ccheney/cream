import { describe, expect, test } from "bun:test";
import type { SnapshotPerformanceMetrics, SnapshotSizeEstimate } from "./snapshot-limits";
import {
	extractSnapshotMetrics,
	logDataSourceFetch,
	logSnapshotComplete,
	logSnapshotError,
	logSnapshotStart,
	logValidationResult,
	redactObject,
	redactSensitiveData,
	type SnapshotAssemblyMetrics,
} from "./snapshot-logging";
import { createMockLogger, createMockMarketSnapshot } from "./snapshot-logging/test-fixtures";

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
		expect(redactSensitiveData(input)).toContain("[REDACTED]");
	});

	test("preserves non-sensitive data", () => {
		const input = "symbol=AAPL price=150.00";
		expect(redactSensitiveData(input)).toBe(input);
	});
});

describe("redactObject", () => {
	test("redacts sensitive fields by key name", () => {
		const result = redactObject({
			apiKey: "secret123",
			secret: "supersecret",
			token: "bearer_token",
			symbol: "AAPL",
			price: 150,
		}) as Record<string, unknown>;
		expect(result.apiKey).toBe("[REDACTED]");
		expect(result.secret).toBe("[REDACTED]");
		expect(result.token).toBe("[REDACTED]");
		expect(result.symbol).toBe("AAPL");
		expect(result.price).toBe(150);
	});

	test("redacts nested objects", () => {
		const result = redactObject({ broker: { apiKey: "secret123", name: "Alpaca" } }) as {
			broker: { apiKey: string; name: string };
		};
		expect(result.broker.apiKey).toBe("[REDACTED]");
		expect(result.broker.name).toBe("Alpaca");
	});

	test("redacts arrays and handles primitives", () => {
		const arrayResult = redactObject(["apiKey=secret123", "normal value"]) as string[];
		expect(arrayResult[0]).toContain("[REDACTED]");
		expect(arrayResult[1]).toBe("normal value");
		expect(redactObject(123)).toBe(123);
		expect(redactObject(true)).toBe(true);
		expect(redactObject(null)).toBeNull();
		expect(redactObject(undefined)).toBeUndefined();
	});
});

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

function createAssemblyMetrics(
	overrides: Partial<SnapshotAssemblyMetrics> = {},
): SnapshotAssemblyMetrics {
	return {
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
		warnings: [],
		...overrides,
	};
}

describe("logSnapshotComplete primary event", () => {
	test("logs complete event with metrics", () => {
		const logger = createMockLogger();
		logSnapshotComplete(logger, createAssemblyMetrics({ dataSources: ["polygon", "indicators"] }));
		expect(logger.entries).toHaveLength(1);
		expect(logger.entries[0].level).toBe("info");
		expect(logger.entries[0].message).toBe("Snapshot assembly completed");
		expect(logger.entries[0].fields.assemblyTimeMs).toBe(150);
		expect(logger.entries[0].fields.snapshotSizeBytes).toBe(50000);
	});

	test("uses warn for completion when validation errors exist", () => {
		const logger = createMockLogger();
		logSnapshotComplete(logger, createAssemblyMetrics({ validationErrors: ["Invalid price"] }));
		expect(logger.entries[0].level).toBe("warn");
	});
});

describe("logSnapshotComplete secondary entries", () => {
	test("logs warnings separately", () => {
		const logger = createMockLogger();
		logSnapshotComplete(
			logger,
			createAssemblyMetrics({ warnings: ["Missing SPY data", "Slow response"] }),
		);
		expect(logger.entries).toHaveLength(3);
		expect(logger.entries[1].level).toBe("warn");
		expect(logger.entries[1].message).toBe("Missing SPY data");
		expect(logger.entries[2].message).toBe("Slow response");
	});

	test("logs validation errors separately", () => {
		const logger = createMockLogger();
		logSnapshotComplete(
			logger,
			createAssemblyMetrics({ validationErrors: ["Invalid price", "Missing timestamp"] }),
		);
		expect(logger.entries).toHaveLength(3);
		expect(logger.entries[1].level).toBe("error");
		expect(logger.entries[2].level).toBe("error");
	});
});

describe("logSnapshotError", () => {
	test("logs error with Error object", () => {
		const logger = createMockLogger();
		logSnapshotError(logger, "cycle-123", new Error("Test error"));
		expect(logger.entries).toHaveLength(1);
		expect(logger.entries[0].level).toBe("error");
		expect(logger.entries[0].message).toContain("Test error");
		expect(logger.entries[0].fields.errorType).toBe("Error");
		expect(logger.entries[0].fields.stack).toBeDefined();
	});

	test("logs error with string and context", () => {
		const logger = createMockLogger();
		logSnapshotError(logger, "cycle-123", "Error", { symbol: "AAPL", step: "fetch" });
		expect(logger.entries[0].message).toContain("Error");
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
		expect(logger.entries[0].fields.success).toBe(true);
		expect(logger.entries[0].fields.durationMs).toBe(50);
		expect(logger.entries[0].fields.recordCount).toBe(100);
	});

	test("logs failed fetch at warn level", () => {
		const logger = createMockLogger();
		logDataSourceFetch(logger, "cycle-123", "polygon", false, 5000);
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
		expect(logger.entries[0].level).toBe("error");
		expect(logger.entries[0].fields.errorCount).toBe(2);
	});
});

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
		expect(metrics.candleCount).toBe(3);
		expect(metrics.assemblyTimeMs).toBe(150);
		expect(metrics.snapshotSizeBytes).toBe(50000);
		expect(metrics.tokenEstimate).toBe(5000);
		expect(metrics.warnings).toEqual(["Slow fetch"]);
	});
});
