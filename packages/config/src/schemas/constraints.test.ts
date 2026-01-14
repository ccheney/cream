import { describe, expect, it } from "bun:test";
import {
	ConstraintsConfigSchema,
	OptionsGreeksConstraintsSchema,
	PerInstrumentConstraintsSchema,
	PortfolioConstraintsSchema,
	SizingConstraintsSchema,
} from "./constraints";

describe("PerInstrumentConstraintsSchema", () => {
	it("applies default values", () => {
		const config = PerInstrumentConstraintsSchema.parse({});
		expect(config.max_units).toBe(1000);
		expect(config.max_notional).toBe(50000);
		expect(config.max_pct_equity).toBe(0.1);
	});

	it("validates max_pct_equity range (0-1)", () => {
		expect(() =>
			PerInstrumentConstraintsSchema.parse({
				max_pct_equity: 1.5,
			})
		).toThrow();
	});

	it("requires positive values", () => {
		expect(() =>
			PerInstrumentConstraintsSchema.parse({
				max_units: -100,
			})
		).toThrow();

		expect(() =>
			PerInstrumentConstraintsSchema.parse({
				max_notional: 0,
			})
		).toThrow();
	});
});

describe("PortfolioConstraintsSchema", () => {
	it("applies default values", () => {
		const config = PortfolioConstraintsSchema.parse({});
		expect(config.max_gross_notional).toBe(500000);
		expect(config.max_net_notional).toBe(250000);
		expect(config.max_gross_pct_equity).toBe(2.0);
		expect(config.max_net_pct_equity).toBe(1.0);
	});

	it("accepts leverage > 1.0", () => {
		const config = PortfolioConstraintsSchema.parse({
			max_gross_pct_equity: 3.0,
		});
		expect(config.max_gross_pct_equity).toBe(3.0);
	});

	it("requires positive values", () => {
		expect(() =>
			PortfolioConstraintsSchema.parse({
				max_gross_notional: 0,
			})
		).toThrow();
	});
});

describe("OptionsGreeksConstraintsSchema", () => {
	it("applies default values", () => {
		const config = OptionsGreeksConstraintsSchema.parse({});
		expect(config.max_delta_notional).toBe(100000);
		expect(config.max_gamma).toBe(1000);
		expect(config.max_vega).toBe(5000);
		expect(config.max_theta).toBe(-500);
	});

	it("requires max_theta to be negative", () => {
		expect(() =>
			OptionsGreeksConstraintsSchema.parse({
				max_theta: 100,
			})
		).toThrow();
	});

	it("requires positive values for delta, gamma, vega", () => {
		expect(() =>
			OptionsGreeksConstraintsSchema.parse({
				max_delta_notional: -1000,
			})
		).toThrow();
	});
});

describe("SizingConstraintsSchema", () => {
	it("applies default sanity_threshold_multiplier", () => {
		const config = SizingConstraintsSchema.parse({});
		expect(config.sanity_threshold_multiplier).toBe(3.0);
	});

	it("requires positive multiplier", () => {
		expect(() =>
			SizingConstraintsSchema.parse({
				sanity_threshold_multiplier: 0,
			})
		).toThrow();
	});
});

describe("ConstraintsConfigSchema", () => {
	it("allows all sections to be optional", () => {
		const config = ConstraintsConfigSchema.parse({});
		expect(config.per_instrument).toBeUndefined();
		expect(config.portfolio).toBeUndefined();
		expect(config.options).toBeUndefined();
		expect(config.sizing).toBeUndefined();
	});

	it("accepts full per_instrument config", () => {
		const config = ConstraintsConfigSchema.parse({
			per_instrument: {
				max_units: 500,
				max_notional: 25000,
				max_pct_equity: 0.05,
			},
		});
		expect(config.per_instrument?.max_units).toBe(500);
	});
});
