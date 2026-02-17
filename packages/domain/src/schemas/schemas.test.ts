/**
 * Tests for common schema validators.
 */

import { describe, expect, it } from "bun:test";
import { DatetimeSchema, EquityTickerSchema, TickerSymbolSchema, UuidSchema } from "./index.js";

describe("UuidSchema", () => {
	it("accepts valid UUIDs", () => {
		expect(UuidSchema.parse("550e8400-e29b-41d4-a716-446655440000")).toBeDefined();
		expect(UuidSchema.parse("f47ac10b-58cc-4372-a567-0e02b2c3d479")).toBeDefined();
	});

	it("rejects invalid UUIDs", () => {
		expect(() => UuidSchema.parse("not-a-uuid")).toThrow();
		expect(() => UuidSchema.parse("12345")).toThrow();
		expect(() => UuidSchema.parse("")).toThrow();
	});
});

describe("DatetimeSchema", () => {
	it("accepts valid ISO-8601 datetimes", () => {
		expect(DatetimeSchema.parse("2026-01-04T12:00:00Z")).toBeDefined();
		expect(DatetimeSchema.parse("2026-01-04T12:00:00.000Z")).toBeDefined();
	});

	it("rejects invalid datetimes", () => {
		expect(() => DatetimeSchema.parse("2026-01-04")).toThrow();
		expect(() => DatetimeSchema.parse("not-a-date")).toThrow();
	});
});

describe("TickerSymbolSchema", () => {
	it("accepts valid equity tickers", () => {
		expect(TickerSymbolSchema.parse("AAPL")).toBeDefined();
		expect(TickerSymbolSchema.parse("GOOGL")).toBeDefined();
		expect(TickerSymbolSchema.parse("A")).toBeDefined();
	});

	it("accepts valid option symbols", () => {
		expect(TickerSymbolSchema.parse("AAPL231215C00150000")).toBeDefined();
	});

	it("rejects invalid tickers", () => {
		expect(() => TickerSymbolSchema.parse("aapl")).toThrow();
		expect(() => TickerSymbolSchema.parse("AAPL ")).toThrow();
		expect(() => TickerSymbolSchema.parse("")).toThrow();
	});
});

describe("EquityTickerSchema", () => {
	it("accepts valid equity tickers", () => {
		expect(EquityTickerSchema.parse("AAPL")).toBeDefined();
		expect(EquityTickerSchema.parse("A")).toBeDefined();
		expect(EquityTickerSchema.parse("GOOGL")).toBeDefined();
	});

	it("rejects tickers too long", () => {
		expect(() => EquityTickerSchema.parse("TOOLONG")).toThrow();
	});

	it("rejects numbers", () => {
		expect(() => EquityTickerSchema.parse("AAPL1")).toThrow();
	});
});
