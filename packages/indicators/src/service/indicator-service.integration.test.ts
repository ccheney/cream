import { describe, expect, test } from "bun:test";
import { createEmptyPriceIndicators } from "../types";
import { IndicatorService } from "./indicator-service";
import { createFullDependencies } from "./indicator-service.test-helpers";

describe("IndicatorService integration workflow", () => {
	test("full workflow: fetch -> cache -> invalidate -> refetch", async () => {
		const deps = createFullDependencies();
		let version = 1;
		deps.priceCalculator = {
			calculate() {
				const indicators = createEmptyPriceIndicators();
				indicators.rsi_14 = 50 + version;
				return indicators;
			},
		};

		const service = new IndicatorService(deps);
		const snapshot1 = await service.getSnapshot("AAPL");
		expect(snapshot1.price.rsi_14).toBe(51);

		version = 2;
		const snapshot2 = await service.getSnapshot("AAPL");
		expect(snapshot2.price.rsi_14).toBe(51);

		service.invalidateCache("AAPL");
		const snapshot3 = await service.getSnapshot("AAPL");
		expect(snapshot3.price.rsi_14).toBe(52);
	});
});
