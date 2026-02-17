import { describe, expect, test } from "bun:test";

import { QuoteSchema } from "../marketSnapshot";
import { validQuote } from "./fixtures";

describe("QuoteSchema", () => {
	test("accepts valid quote", () => {
		const result = QuoteSchema.safeParse(validQuote);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.symbol).toBe("AAPL");
			expect(result.data.bid).toBe(185.5);
		}
	});

	test("rejects quote with empty symbol", () => {
		const result = QuoteSchema.safeParse({ ...validQuote, symbol: "" });
		expect(result.success).toBe(false);
	});

	test("rejects quote with negative bid", () => {
		const result = QuoteSchema.safeParse({ ...validQuote, bid: -1 });
		expect(result.success).toBe(false);
	});

	test("accepts quote with zero volume", () => {
		const result = QuoteSchema.safeParse({ ...validQuote, volume: 0 });
		expect(result.success).toBe(true);
	});

	test("rejects quote with non-integer volume", () => {
		const result = QuoteSchema.safeParse({ ...validQuote, volume: 100.5 });
		expect(result.success).toBe(false);
	});
});
