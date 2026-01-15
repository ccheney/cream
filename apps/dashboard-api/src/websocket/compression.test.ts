/**
 * WebSocket Compression Tests
 */

import { beforeEach, describe, expect, it } from "bun:test";
import {
	type CompressionConfig,
	type CompressionMetrics,
	estimateCompressedSize,
	getBandwidthSavings,
	getBunCompressionOptions,
	getCompressionConfig,
	getCompressionMetrics,
	recordCompressionStats,
	resetCompressionMetrics,
	shouldCompress,
} from "./compression";

// ============================================
// Helper Functions
// ============================================

function resetMetrics() {
	resetCompressionMetrics();
}

// ============================================
// getCompressionConfig Tests
// ============================================

describe("getCompressionConfig", () => {
	const originalEnv = Bun.env.NODE_ENV;
	const originalWsCompression = Bun.env.WS_COMPRESSION_ENABLED;

	beforeEach(() => {
		Bun.env.NODE_ENV = originalEnv;
		Bun.env.WS_COMPRESSION_ENABLED = originalWsCompression;
	});

	it("returns config with required properties", () => {
		const config = getCompressionConfig();

		expect(config).toHaveProperty("enabled");
		expect(config).toHaveProperty("threshold");
		expect(config).toHaveProperty("level");
		expect(config).toHaveProperty("memoryLevel");
		expect(config).toHaveProperty("windowBits");
		expect(config).toHaveProperty("serverNoContextTakeover");
		expect(config).toHaveProperty("clientNoContextTakeover");
	});

	it("returns production config in production", () => {
		Bun.env.NODE_ENV = "production";
		const config = getCompressionConfig();

		expect(config.enabled).toBe(true);
		expect(config.serverNoContextTakeover).toBe(false);
		expect(config.clientNoContextTakeover).toBe(false);
	});

	it("returns development config in development", () => {
		Bun.env.NODE_ENV = "development";
		delete Bun.env.WS_COMPRESSION_ENABLED;
		const config = getCompressionConfig();

		expect(config.enabled).toBe(false);
	});

	it("allows compression override in development", () => {
		Bun.env.NODE_ENV = "development";
		Bun.env.WS_COMPRESSION_ENABLED = "true";
		const config = getCompressionConfig();

		expect(config.enabled).toBe(true);
	});

	it("returns default config for unknown environment", () => {
		Bun.env.NODE_ENV = "staging";
		const config = getCompressionConfig();

		expect(config.enabled).toBe(true);
		expect(config.threshold).toBe(1024);
		expect(config.level).toBe(6);
	});

	it("has sensible compression level (1-9)", () => {
		const config = getCompressionConfig();
		expect(config.level).toBeGreaterThanOrEqual(1);
		expect(config.level).toBeLessThanOrEqual(9);
	});

	it("has sensible memory level (1-9)", () => {
		const config = getCompressionConfig();
		expect(config.memoryLevel).toBeGreaterThanOrEqual(1);
		expect(config.memoryLevel).toBeLessThanOrEqual(9);
	});

	it("has sensible window bits (8-15)", () => {
		const config = getCompressionConfig();
		expect(config.windowBits).toBeGreaterThanOrEqual(8);
		expect(config.windowBits).toBeLessThanOrEqual(15);
	});
});

// ============================================
// getBunCompressionOptions Tests
// ============================================

describe("getBunCompressionOptions", () => {
	const originalEnv = Bun.env.NODE_ENV;

	beforeEach(() => {
		Bun.env.NODE_ENV = originalEnv;
	});

	it("returns 'shared' when compression enabled", () => {
		Bun.env.NODE_ENV = "production";
		const options = getBunCompressionOptions();
		expect(options).toBe("shared");
	});

	it("returns false when compression disabled", () => {
		Bun.env.NODE_ENV = "development";
		delete Bun.env.WS_COMPRESSION_ENABLED;
		const options = getBunCompressionOptions();
		expect(options).toBe(false);
	});
});

// ============================================
// Metrics Recording Tests
// ============================================

describe("recordCompressionStats", () => {
	beforeEach(resetMetrics);

	it("increments totalMessages", () => {
		recordCompressionStats(1000, 400, true);
		const metrics = getCompressionMetrics();
		expect(metrics.totalMessages).toBe(1);

		recordCompressionStats(500, 200, true);
		expect(getCompressionMetrics().totalMessages).toBe(2);
	});

	it("tracks compressed messages", () => {
		recordCompressionStats(1000, 400, true);
		recordCompressionStats(500, 200, true);
		const metrics = getCompressionMetrics();

		expect(metrics.compressedMessages).toBe(2);
		expect(metrics.skippedMessages).toBe(0);
	});

	it("tracks skipped messages", () => {
		recordCompressionStats(100, 100, false);
		recordCompressionStats(50, 50, false);
		const metrics = getCompressionMetrics();

		expect(metrics.compressedMessages).toBe(0);
		expect(metrics.skippedMessages).toBe(2);
	});

	it("tracks uncompressed bytes", () => {
		recordCompressionStats(1000, 400, true);
		recordCompressionStats(500, 200, true);
		const metrics = getCompressionMetrics();

		expect(metrics.totalBytesUncompressed).toBe(1500);
	});

	it("tracks compressed bytes for compressed messages", () => {
		recordCompressionStats(1000, 400, true);
		const metrics = getCompressionMetrics();

		expect(metrics.totalBytesCompressed).toBe(400);
	});

	it("uses original size for skipped messages", () => {
		recordCompressionStats(100, 100, false);
		const metrics = getCompressionMetrics();

		expect(metrics.totalBytesCompressed).toBe(100);
	});

	it("calculates average compression ratio", () => {
		recordCompressionStats(1000, 400, true); // 40% ratio
		const metrics = getCompressionMetrics();

		expect(metrics.averageCompressionRatio).toBe(0.4);
	});

	it("handles mixed compressed and skipped", () => {
		recordCompressionStats(1000, 400, true); // 400 compressed
		recordCompressionStats(100, 100, false); // 100 original (skipped)
		const metrics = getCompressionMetrics();

		expect(metrics.totalBytesUncompressed).toBe(1100);
		expect(metrics.totalBytesCompressed).toBe(500);
		expect(metrics.averageCompressionRatio).toBeCloseTo(0.4545, 3);
	});
});

// ============================================
// getCompressionMetrics Tests
// ============================================

describe("getCompressionMetrics", () => {
	beforeEach(resetMetrics);

	it("returns initial zero values", () => {
		const metrics = getCompressionMetrics();

		expect(metrics.totalMessages).toBe(0);
		expect(metrics.compressedMessages).toBe(0);
		expect(metrics.skippedMessages).toBe(0);
		expect(metrics.totalBytesUncompressed).toBe(0);
		expect(metrics.totalBytesCompressed).toBe(0);
		expect(metrics.averageCompressionRatio).toBe(0);
	});

	it("returns a copy of metrics", () => {
		recordCompressionStats(1000, 400, true);
		const metrics1 = getCompressionMetrics();
		const metrics2 = getCompressionMetrics();

		expect(metrics1).not.toBe(metrics2);
		expect(metrics1).toEqual(metrics2);
	});
});

// ============================================
// resetCompressionMetrics Tests
// ============================================

describe("resetCompressionMetrics", () => {
	it("resets all metrics to zero", () => {
		recordCompressionStats(1000, 400, true);
		recordCompressionStats(500, 200, true);
		resetCompressionMetrics();

		const metrics = getCompressionMetrics();
		expect(metrics.totalMessages).toBe(0);
		expect(metrics.compressedMessages).toBe(0);
		expect(metrics.skippedMessages).toBe(0);
		expect(metrics.totalBytesUncompressed).toBe(0);
		expect(metrics.totalBytesCompressed).toBe(0);
		expect(metrics.averageCompressionRatio).toBe(0);
	});
});

// ============================================
// getBandwidthSavings Tests
// ============================================

describe("getBandwidthSavings", () => {
	beforeEach(resetMetrics);

	it("returns 0 when no messages", () => {
		expect(getBandwidthSavings()).toBe(0);
	});

	it("calculates percentage savings", () => {
		recordCompressionStats(1000, 400, true); // 60% savings
		expect(getBandwidthSavings()).toBe(60);
	});

	it("returns 0 when no compression", () => {
		recordCompressionStats(100, 100, false);
		expect(getBandwidthSavings()).toBe(0);
	});

	it("calculates mixed savings correctly", () => {
		recordCompressionStats(1000, 400, true); // 600 saved
		recordCompressionStats(100, 100, false); // 0 saved
		// Total: 1100 uncompressed, 500 compressed = 600 saved = 54.5%
		expect(getBandwidthSavings()).toBeCloseTo(54.545, 2);
	});
});

// ============================================
// shouldCompress Tests
// ============================================

describe("shouldCompress", () => {
	const _originalEnv = Bun.env.NODE_ENV;
	const _originalWsCompression = Bun.env.WS_COMPRESSION_ENABLED;

	beforeEach(() => {
		Bun.env.NODE_ENV = "production"; // Ensure compression enabled
		delete Bun.env.WS_COMPRESSION_ENABLED;
	});

	// Note: Each test should restore env if it modifies it

	it("returns false for small strings", () => {
		const small = "x".repeat(500);
		expect(shouldCompress(small)).toBe(false);
	});

	it("returns true for strings at threshold", () => {
		const atThreshold = "x".repeat(1024);
		expect(shouldCompress(atThreshold)).toBe(true);
	});

	it("returns true for large strings", () => {
		const large = "x".repeat(5000);
		expect(shouldCompress(large)).toBe(true);
	});

	it("returns false for small buffers", () => {
		const small = Buffer.alloc(500);
		expect(shouldCompress(small)).toBe(false);
	});

	it("returns true for large buffers", () => {
		const large = Buffer.alloc(2000);
		expect(shouldCompress(large)).toBe(true);
	});

	it("returns false when compression disabled", () => {
		Bun.env.NODE_ENV = "development";
		delete Bun.env.WS_COMPRESSION_ENABLED;

		const large = "x".repeat(5000);
		expect(shouldCompress(large)).toBe(false);
	});

	it("handles empty string", () => {
		expect(shouldCompress("")).toBe(false);
	});

	it("handles empty buffer", () => {
		expect(shouldCompress(Buffer.alloc(0))).toBe(false);
	});

	it("considers multi-byte characters in strings", () => {
		// Each emoji is ~4 bytes
		const emojis = "🌍".repeat(300); // ~1200 bytes
		expect(shouldCompress(emojis)).toBe(true);
	});
});

// ============================================
// estimateCompressedSize Tests
// ============================================

describe("estimateCompressedSize", () => {
	it("returns 0 for 0 bytes", () => {
		expect(estimateCompressedSize(0)).toBe(0);
	});

	it("estimates 40% of original size", () => {
		expect(estimateCompressedSize(1000)).toBe(400);
	});

	it("returns integer value", () => {
		expect(estimateCompressedSize(1001)).toBe(400);
	});

	it("handles large values", () => {
		expect(estimateCompressedSize(1000000)).toBe(400000);
	});
});

// ============================================
// Type Tests
// ============================================

describe("CompressionConfig type", () => {
	it("has all required properties", () => {
		const config: CompressionConfig = {
			enabled: true,
			threshold: 1024,
			level: 6,
			memoryLevel: 8,
			windowBits: 15,
			serverNoContextTakeover: true,
			clientNoContextTakeover: true,
		};

		expect(config.enabled).toBe(true);
		expect(config.threshold).toBe(1024);
		expect(config.level).toBe(6);
		expect(config.memoryLevel).toBe(8);
		expect(config.windowBits).toBe(15);
		expect(config.serverNoContextTakeover).toBe(true);
		expect(config.clientNoContextTakeover).toBe(true);
	});
});

describe("CompressionMetrics type", () => {
	it("has all required properties", () => {
		const metrics: CompressionMetrics = {
			totalMessages: 100,
			compressedMessages: 80,
			skippedMessages: 20,
			totalBytesUncompressed: 100000,
			totalBytesCompressed: 40000,
			averageCompressionRatio: 0.4,
		};

		expect(metrics.totalMessages).toBe(100);
		expect(metrics.compressedMessages).toBe(80);
		expect(metrics.skippedMessages).toBe(20);
		expect(metrics.totalBytesUncompressed).toBe(100000);
		expect(metrics.totalBytesCompressed).toBe(40000);
		expect(metrics.averageCompressionRatio).toBe(0.4);
	});
});

// ============================================
// Module Export Tests
// ============================================

describe("module exports", () => {
	it("exports getCompressionConfig", async () => {
		const module = await import("./compression");
		expect(typeof module.getCompressionConfig).toBe("function");
	});

	it("exports getBunCompressionOptions", async () => {
		const module = await import("./compression");
		expect(typeof module.getBunCompressionOptions).toBe("function");
	});

	it("exports recordCompressionStats", async () => {
		const module = await import("./compression");
		expect(typeof module.recordCompressionStats).toBe("function");
	});

	it("exports getCompressionMetrics", async () => {
		const module = await import("./compression");
		expect(typeof module.getCompressionMetrics).toBe("function");
	});

	it("exports resetCompressionMetrics", async () => {
		const module = await import("./compression");
		expect(typeof module.resetCompressionMetrics).toBe("function");
	});

	it("exports getBandwidthSavings", async () => {
		const module = await import("./compression");
		expect(typeof module.getBandwidthSavings).toBe("function");
	});

	it("exports shouldCompress", async () => {
		const module = await import("./compression");
		expect(typeof module.shouldCompress).toBe("function");
	});

	it("exports estimateCompressedSize", async () => {
		const module = await import("./compression");
		expect(typeof module.estimateCompressedSize).toBe("function");
	});

	it("exports logCompressionConfig", async () => {
		const module = await import("./compression");
		expect(typeof module.logCompressionConfig).toBe("function");
	});

	it("exports logCompressionMetrics", async () => {
		const module = await import("./compression");
		expect(typeof module.logCompressionMetrics).toBe("function");
	});

	it("exports default object with all functions", async () => {
		const module = await import("./compression");
		const defaultExport = module.default;

		expect(typeof defaultExport.getCompressionConfig).toBe("function");
		expect(typeof defaultExport.getBunCompressionOptions).toBe("function");
		expect(typeof defaultExport.recordCompressionStats).toBe("function");
		expect(typeof defaultExport.getCompressionMetrics).toBe("function");
		expect(typeof defaultExport.resetCompressionMetrics).toBe("function");
		expect(typeof defaultExport.getBandwidthSavings).toBe("function");
		expect(typeof defaultExport.shouldCompress).toBe("function");
		expect(typeof defaultExport.estimateCompressedSize).toBe("function");
		expect(typeof defaultExport.logCompressionConfig).toBe("function");
		expect(typeof defaultExport.logCompressionMetrics).toBe("function");
	});
});
