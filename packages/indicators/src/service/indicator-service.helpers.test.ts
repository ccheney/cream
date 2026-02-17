import { describe, expect, test } from "bun:test";
import { requireValue } from "@cream/test-utils";
import { IndicatorService } from "./indicator-service";
import { createFullDependencies } from "./indicator-service.test-helpers";

describe("IndicatorService helper methods", () => {
	test("getPriceIndicators returns only price indicators", async () => {
		const service = new IndicatorService(createFullDependencies());
		const price = await service.getPriceIndicators("AAPL");
		expect(price.rsi_14).toBe(55.5);
		expect(price.atr_14).toBe(2.3);
	});

	test("getLiquidityIndicators returns only liquidity indicators", async () => {
		const service = new IndicatorService(createFullDependencies());
		const liquidity = await service.getLiquidityIndicators("AAPL");
		expect(liquidity.bid_ask_spread).toBe(0.05);
		expect(liquidity.vwap).toBe(150.25);
	});

	test("getOptionsIndicators returns only options indicators", async () => {
		const service = new IndicatorService(createFullDependencies());
		const options = await service.getOptionsIndicators("AAPL");
		expect(options.atm_iv).toBe(0.35);
	});
});

describe("IndicatorService snapshot map helpers", () => {
	test("getSnapshots returns snapshots for multiple symbols", async () => {
		const service = new IndicatorService(createFullDependencies());
		const snapshots = await service.getSnapshots(["AAPL", "TSLA", "GOOG"]);
		expect(snapshots.size).toBe(3);
		expect(snapshots.get("AAPL")).toBeDefined();
		expect(snapshots.get("TSLA")).toBeDefined();
		expect(snapshots.get("GOOG")).toBeDefined();
	});
});

describe("IndicatorService cache metrics helper", () => {
	test("getCacheMetrics returns metrics when cache enabled", async () => {
		const service = new IndicatorService(createFullDependencies());
		await service.getSnapshot("AAPL");
		const metrics = service.getCacheMetrics();
		expect(metrics).not.toBeNull();
		expect(requireValue(metrics, "metrics").snapshot.size).toBe(1);
	});

	test("getCacheMetrics returns null when cache not configured", () => {
		const deps = createFullDependencies();
		deps.cache = undefined;
		const service = new IndicatorService(deps);
		expect(service.getCacheMetrics()).toBeNull();
	});
});
