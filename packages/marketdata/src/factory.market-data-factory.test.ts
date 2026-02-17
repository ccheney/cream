/**
 * Market Data Factory Tests
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	AlpacaMarketDataAdapter,
	createMarketDataAdapter,
	getMarketDataAdapter,
	isMarketDataAvailable,
	MarketDataConfigError,
} from "./factory";

const originalEnv = Bun.env.CREAM_ENV;
const originalAlpacaKey = Bun.env.ALPACA_KEY;
const originalAlpacaSecret = Bun.env.ALPACA_SECRET;

beforeEach(() => {
	delete Bun.env.ALPACA_KEY;
	delete Bun.env.ALPACA_SECRET;
});

afterEach(() => {
	if (originalEnv) {
		Bun.env.CREAM_ENV = originalEnv;
	} else {
		delete Bun.env.CREAM_ENV;
	}

	if (originalAlpacaKey) {
		Bun.env.ALPACA_KEY = originalAlpacaKey;
	} else {
		delete Bun.env.ALPACA_KEY;
	}

	if (originalAlpacaSecret) {
		Bun.env.ALPACA_SECRET = originalAlpacaSecret;
	} else {
		delete Bun.env.ALPACA_SECRET;
	}
});

describe("createMarketDataAdapter", () => {
	test("returns AlpacaMarketDataAdapter for PAPER with API keys", () => {
		Bun.env.ALPACA_KEY = "test-key";
		Bun.env.ALPACA_SECRET = "test-secret";
		const adapter = createMarketDataAdapter("PAPER");
		expect(adapter).toBeInstanceOf(AlpacaMarketDataAdapter);
		expect(adapter.getType()).toBe("alpaca");
	});

	test("returns AlpacaMarketDataAdapter for LIVE with API keys", () => {
		Bun.env.ALPACA_KEY = "test-key";
		Bun.env.ALPACA_SECRET = "test-secret";
		const adapter = createMarketDataAdapter("LIVE");
		expect(adapter).toBeInstanceOf(AlpacaMarketDataAdapter);
		expect(adapter.getType()).toBe("alpaca");
	});

	test("throws MarketDataConfigError for PAPER without API keys", () => {
		expect(() => createMarketDataAdapter("PAPER")).toThrow(MarketDataConfigError);
	});

	test("throws MarketDataConfigError for LIVE without API keys", () => {
		expect(() => createMarketDataAdapter("LIVE")).toThrow(MarketDataConfigError);
	});
});

describe("getMarketDataAdapter", () => {
	test("returns null for PAPER without API keys", () => {
		const adapter = getMarketDataAdapter("PAPER");
		expect(adapter).toBeNull();
	});

	test("returns adapter for PAPER with API keys", () => {
		Bun.env.ALPACA_KEY = "test-key";
		Bun.env.ALPACA_SECRET = "test-secret";
		const adapter = getMarketDataAdapter("PAPER");
		expect(adapter).not.toBeNull();
		expect(adapter?.getType()).toBe("alpaca");
	});
});

describe("isMarketDataAvailable", () => {
	test("returns false for PAPER without API keys", () => {
		expect(isMarketDataAvailable("PAPER")).toBe(false);
	});

	test("returns true for PAPER with API keys", () => {
		Bun.env.ALPACA_KEY = "test-key";
		Bun.env.ALPACA_SECRET = "test-secret";
		expect(isMarketDataAvailable("PAPER")).toBe(true);
	});
});
