import { describe, expect, test } from "bun:test";
import { ScannerConfigSchema } from "./scanner";

describe("ScannerConfigSchema", () => {
	test("applies defaults", () => {
		const parsed = ScannerConfigSchema.parse({});

		expect(parsed.minPrice).toBe(5.0);
		expect(parsed.minAvgVolume).toBe(100_000);
		expect(parsed.volumeSpikeThreshold).toBe(3.0);
		expect(parsed.priceMoveThreshold).toBe(2.0);
		expect(parsed.gapThreshold).toBe(2.0);
		expect(parsed.maxCandidates).toBe(10);
		expect(parsed.cooldownSeconds).toBe(300);
		expect(parsed.enabled).toBe(true);
	});

	test("rejects invalid thresholds", () => {
		const result = ScannerConfigSchema.safeParse({
			minPrice: -1,
			volumeSpikeThreshold: 0.5,
			maxCandidates: 0,
		});

		expect(result.success).toBe(false);
	});
});
