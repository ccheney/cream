/**
 * HNSW Configuration Tests
 */

import { describe, expect, it } from "bun:test";
import {
	adjustEfSearchForRecall,
	DEFAULT_HNSW_CONFIG,
	DISTANCE_METRIC_NOTES,
	DistanceMetric,
	ENVIRONMENT_PROFILE_MAP,
	generateVectorIndexConfig,
	getConfigForEnvironment,
	getTuningProfile,
	type HnswConfig,
	HnswConfigSchema,
	listTuningProfiles,
	TUNING_PROFILES,
	TuningProfileName,
	validateHnswConfig,
} from "../src/hnsw-config";

// ============================================
// Schema Validation Tests
// ============================================

describe("HnswConfigSchema", () => {
	it("validates default config", () => {
		const result = HnswConfigSchema.safeParse(DEFAULT_HNSW_CONFIG);
		expect(result.success).toBe(true);
	});

	it("applies defaults for missing fields", () => {
		const result = HnswConfigSchema.parse({});
		expect(result.m).toBe(16);
		expect(result.efConstruction).toBe(128);
		expect(result.efSearch).toBe(64);
		expect(result.metric).toBe("cosine");
	});

	it("rejects M below minimum", () => {
		const result = HnswConfigSchema.safeParse({ m: 2 });
		expect(result.success).toBe(false);
	});

	it("rejects M above maximum", () => {
		const result = HnswConfigSchema.safeParse({ m: 100 });
		expect(result.success).toBe(false);
	});

	it("rejects efConstruction below minimum", () => {
		const result = HnswConfigSchema.safeParse({ efConstruction: 8 });
		expect(result.success).toBe(false);
	});

	it("rejects efSearch below minimum", () => {
		const result = HnswConfigSchema.safeParse({ efSearch: 8 });
		expect(result.success).toBe(false);
	});

	it("accepts valid custom config", () => {
		const config = {
			m: 24,
			efConstruction: 256,
			efSearch: 128,
			metric: "euclidean" as const,
		};
		const result = HnswConfigSchema.safeParse(config);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.m).toBe(24);
			expect(result.data.metric).toBe("euclidean");
		}
	});
});

// ============================================
// Distance Metric Tests
// ============================================

describe("DistanceMetric", () => {
	it("accepts cosine", () => {
		expect(DistanceMetric.parse("cosine")).toBe("cosine");
	});

	it("accepts euclidean", () => {
		expect(DistanceMetric.parse("euclidean")).toBe("euclidean");
	});

	it("accepts dot_product", () => {
		expect(DistanceMetric.parse("dot_product")).toBe("dot_product");
	});

	it("rejects invalid metric", () => {
		const result = DistanceMetric.safeParse("invalid");
		expect(result.success).toBe(false);
	});

	it("has notes for all metrics", () => {
		expect(DISTANCE_METRIC_NOTES.cosine).toBeDefined();
		expect(DISTANCE_METRIC_NOTES.euclidean).toBeDefined();
		expect(DISTANCE_METRIC_NOTES.dot_product).toBeDefined();
	});
});

// ============================================
// Default Configuration Tests
// ============================================

describe("DEFAULT_HNSW_CONFIG", () => {
	it("has expected default values", () => {
		expect(DEFAULT_HNSW_CONFIG.m).toBe(16);
		expect(DEFAULT_HNSW_CONFIG.efConstruction).toBe(128);
		expect(DEFAULT_HNSW_CONFIG.efSearch).toBe(64);
		expect(DEFAULT_HNSW_CONFIG.metric).toBe("cosine");
	});
});

// ============================================
// Tuning Profile Tests
// ============================================

describe("TUNING_PROFILES", () => {
	it("has four profiles", () => {
		expect(Object.keys(TUNING_PROFILES).length).toBe(4);
	});

	it("balanced profile matches defaults", () => {
		const balanced = TUNING_PROFILES.balanced;
		expect(balanced.config.m).toBe(DEFAULT_HNSW_CONFIG.m);
		expect(balanced.config.efConstruction).toBe(DEFAULT_HNSW_CONFIG.efConstruction);
		expect(balanced.config.efSearch).toBe(DEFAULT_HNSW_CONFIG.efSearch);
	});

	it("max_recall has higher M and efSearch", () => {
		const maxRecall = TUNING_PROFILES.max_recall;
		expect(maxRecall.config.m).toBeGreaterThan(DEFAULT_HNSW_CONFIG.m);
		expect(maxRecall.config.efSearch).toBeGreaterThan(DEFAULT_HNSW_CONFIG.efSearch);
		expect(maxRecall.expectedRecall.min).toBeGreaterThanOrEqual(95);
	});

	it("low_latency has lower efSearch", () => {
		const lowLatency = TUNING_PROFILES.low_latency;
		expect(lowLatency.config.efSearch).toBeLessThan(DEFAULT_HNSW_CONFIG.efSearch);
		expect(lowLatency.expectedLatencyMs.p50).toBeLessThan(1);
	});

	it("memory_constrained has lower M", () => {
		const memConstrained = TUNING_PROFILES.memory_constrained;
		expect(memConstrained.config.m).toBeLessThan(DEFAULT_HNSW_CONFIG.m);
		expect(memConstrained.memoryMultiplier).toBeLessThan(1);
	});

	it("all profiles have valid configurations", () => {
		for (const profile of Object.values(TUNING_PROFILES)) {
			const result = HnswConfigSchema.safeParse(profile.config);
			expect(result.success).toBe(true);
		}
	});

	it("all profiles have expected performance metrics", () => {
		for (const profile of Object.values(TUNING_PROFILES)) {
			expect(profile.expectedRecall.min).toBeGreaterThanOrEqual(0);
			expect(profile.expectedRecall.max).toBeLessThanOrEqual(100);
			expect(profile.memoryMultiplier).toBeGreaterThan(0);
			expect(profile.buildTimeMultiplier).toBeGreaterThan(0);
		}
	});
});

describe("TuningProfileName", () => {
	it("accepts valid profile names", () => {
		expect(TuningProfileName.parse("balanced")).toBe("balanced");
		expect(TuningProfileName.parse("max_recall")).toBe("max_recall");
		expect(TuningProfileName.parse("low_latency")).toBe("low_latency");
		expect(TuningProfileName.parse("memory_constrained")).toBe("memory_constrained");
	});

	it("rejects invalid profile name", () => {
		const result = TuningProfileName.safeParse("invalid");
		expect(result.success).toBe(false);
	});
});

// ============================================
// Profile Selection Tests
// ============================================

describe("getConfigForEnvironment", () => {
	it("returns balanced for production", () => {
		const config = getConfigForEnvironment("production");
		expect(config.m).toBe(TUNING_PROFILES.balanced.config.m);
	});

	it("returns balanced for development", () => {
		const config = getConfigForEnvironment("development");
		expect(config.m).toBe(TUNING_PROFILES.balanced.config.m);
	});

	it("returns memory_constrained for test", () => {
		const config = getConfigForEnvironment("test");
		expect(config.m).toBe(TUNING_PROFILES.memory_constrained.config.m);
	});

	it("returns max_recall for research", () => {
		const config = getConfigForEnvironment("research");
		expect(config.m).toBe(TUNING_PROFILES.max_recall.config.m);
	});

	it("returns low_latency for trading", () => {
		const config = getConfigForEnvironment("trading");
		expect(config.m).toBe(TUNING_PROFILES.low_latency.config.m);
	});

	it("is case-insensitive", () => {
		const config1 = getConfigForEnvironment("PRODUCTION");
		const config2 = getConfigForEnvironment("production");
		expect(config1.m).toBe(config2.m);
	});

	it("returns balanced for unknown environment", () => {
		const config = getConfigForEnvironment("unknown");
		expect(config.m).toBe(TUNING_PROFILES.balanced.config.m);
	});
});

describe("getTuningProfile", () => {
	it("returns correct profile", () => {
		const profile = getTuningProfile("max_recall");
		expect(profile.name).toBe("max_recall");
		expect(profile.config.m).toBe(24);
	});
});

describe("listTuningProfiles", () => {
	it("returns all profiles", () => {
		const profiles = listTuningProfiles();
		expect(profiles.length).toBe(4);
		expect(profiles.map((p) => p.name)).toContain("balanced");
		expect(profiles.map((p) => p.name)).toContain("max_recall");
		expect(profiles.map((p) => p.name)).toContain("low_latency");
		expect(profiles.map((p) => p.name)).toContain("memory_constrained");
	});
});

// ============================================
// Validation Tests
// ============================================

describe("validateHnswConfig", () => {
	it("validates default config without errors", () => {
		const result = validateHnswConfig(DEFAULT_HNSW_CONFIG);
		expect(result.valid).toBe(true);
		expect(result.errors.length).toBe(0);
	});

	it("warns for very low M", () => {
		const config: HnswConfig = { ...DEFAULT_HNSW_CONFIG, m: 6 };
		const result = validateHnswConfig(config);
		expect(result.valid).toBe(true);
		expect(result.warnings.some((w) => w.includes("M < 8"))).toBe(true);
	});

	it("warns for very high M", () => {
		const config: HnswConfig = { ...DEFAULT_HNSW_CONFIG, m: 48 };
		const result = validateHnswConfig(config);
		expect(result.valid).toBe(true);
		expect(result.warnings.some((w) => w.includes("M > 32"))).toBe(true);
	});

	it("errors for efConstruction < M", () => {
		const config: HnswConfig = { ...DEFAULT_HNSW_CONFIG, m: 32, efConstruction: 24 };
		const result = validateHnswConfig(config);
		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.includes("efConstruction should be >= M"))).toBe(true);
	});

	it("warns for low efConstruction", () => {
		const config: HnswConfig = { ...DEFAULT_HNSW_CONFIG, m: 8, efConstruction: 32 };
		const result = validateHnswConfig(config);
		expect(result.warnings.some((w) => w.includes("efConstruction < 64"))).toBe(true);
	});

	it("warns when efSearch > efConstruction", () => {
		const config: HnswConfig = { ...DEFAULT_HNSW_CONFIG, efSearch: 200, efConstruction: 128 };
		const result = validateHnswConfig(config);
		expect(result.warnings.some((w) => w.includes("efSearch > efConstruction"))).toBe(true);
	});

	it("warns for dot_product metric", () => {
		const config: HnswConfig = { ...DEFAULT_HNSW_CONFIG, metric: "dot_product" };
		const result = validateHnswConfig(config);
		expect(result.warnings.some((w) => w.includes("dot_product"))).toBe(true);
	});
});

// ============================================
// efSearch Adjustment Tests
// ============================================

describe("adjustEfSearchForRecall", () => {
	const baseEfSearch = 64;

	it("halves efSearch for low recall requirements", () => {
		const adjusted = adjustEfSearchForRecall(baseEfSearch, 80);
		expect(adjusted).toBe(32);
	});

	it("keeps base for moderate recall (90%)", () => {
		const adjusted = adjustEfSearchForRecall(baseEfSearch, 90);
		expect(adjusted).toBe(64);
	});

	it("increases for high recall (95%)", () => {
		const adjusted = adjustEfSearchForRecall(baseEfSearch, 95);
		expect(adjusted).toBe(96); // 1.5x
	});

	it("doubles for very high recall (98%)", () => {
		const adjusted = adjustEfSearchForRecall(baseEfSearch, 98);
		expect(adjusted).toBe(128); // 2x
	});

	it("caps at 256", () => {
		const adjusted = adjustEfSearchForRecall(200, 98);
		expect(adjusted).toBe(256);
	});

	it("never goes below 16", () => {
		const adjusted = adjustEfSearchForRecall(20, 80);
		expect(adjusted).toBeGreaterThanOrEqual(16);
	});
});

// ============================================
// Config Generation Tests
// ============================================

describe("generateVectorIndexConfig", () => {
	it("generates config with defaults", () => {
		const config = generateVectorIndexConfig();
		expect(config).toEqual({
			vector_index: {
				algorithm: "hnsw",
				parameters: {
					m: 16,
					ef_construction: 128,
					ef_search: 64,
				},
				distance_metric: "cosine",
			},
		});
	});

	it("generates config with custom values", () => {
		const config = generateVectorIndexConfig({
			m: 24,
			efConstruction: 256,
			efSearch: 128,
			metric: "euclidean",
		});
		expect(config).toEqual({
			vector_index: {
				algorithm: "hnsw",
				parameters: {
					m: 24,
					ef_construction: 256,
					ef_search: 128,
				},
				distance_metric: "euclidean",
			},
		});
	});
});

// ============================================
// Environment Profile Mapping Tests
// ============================================

describe("ENVIRONMENT_PROFILE_MAP", () => {
	it("has mappings for common environments", () => {
		expect(ENVIRONMENT_PROFILE_MAP.development).toBe("balanced");
		expect(ENVIRONMENT_PROFILE_MAP.test).toBe("memory_constrained");
		expect(ENVIRONMENT_PROFILE_MAP.staging).toBe("balanced");
		expect(ENVIRONMENT_PROFILE_MAP.production).toBe("balanced");
		expect(ENVIRONMENT_PROFILE_MAP.research).toBe("max_recall");
		expect(ENVIRONMENT_PROFILE_MAP.trading).toBe("low_latency");
	});
});
