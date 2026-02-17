/**
 * Option Chain scanner tests
 */

import { describe, expect, it } from "bun:test";
import { OptionChainScanner, type OptionFilterCriteria } from "./optionChain";
import { createMockClient } from "./optionChain.test-helpers";

describe("OptionChainScanner scan", () => {
	it("fetches and returns option chain", async () => {
		const scanner = new OptionChainScanner(createMockClient());
		const results = await scanner.scan("AAPL", {});
		expect(results.length).toBeGreaterThan(0);
		expect(results[0]?.underlying).toBe("AAPL");
	});

	it("filters by DTE", async () => {
		const scanner = new OptionChainScanner(createMockClient());
		const filter: OptionFilterCriteria = { minDte: 25, maxDte: 50 };
		const results = await scanner.scan("AAPL", filter);

		for (const opt of results) {
			expect(opt.dte).toBeGreaterThanOrEqual(25);
			expect(opt.dte).toBeLessThanOrEqual(50);
		}
	});

	it("filters by option type", async () => {
		const scanner = new OptionChainScanner(createMockClient());

		const callsOnly = await scanner.scan("AAPL", { optionType: "call" });
		for (const opt of callsOnly) {
			expect(opt.type).toBe("call");
		}

		const putsOnly = await scanner.scan("AAPL", { optionType: "put" });
		for (const opt of putsOnly) {
			expect(opt.type).toBe("put");
		}
	});
});

describe("OptionChainScanner caching", () => {
	it("caches results", async () => {
		const client = createMockClient();
		const scanner = new OptionChainScanner(client, 60000);

		await scanner.scan("AAPL", {});
		expect(client.getOptionContracts).toHaveBeenCalledTimes(1);

		await scanner.scan("AAPL", {});
		expect(client.getOptionContracts).toHaveBeenCalledTimes(1);
	});

	it("clears cache when requested", async () => {
		const client = createMockClient();
		const scanner = new OptionChainScanner(client, 60000);

		await scanner.scan("AAPL", {});
		expect(client.getOptionContracts).toHaveBeenCalledTimes(1);

		scanner.clearCache("AAPL");

		await scanner.scan("AAPL", {});
		expect(client.getOptionContracts).toHaveBeenCalledTimes(2);
	});
});

describe("OptionChainScanner getTopCandidates", () => {
	it("returns top N candidates for strategy", async () => {
		const scanner = new OptionChainScanner(createMockClient());
		const candidates = await scanner.getTopCandidates("AAPL", "longOption", 3);
		expect(candidates.length).toBeLessThanOrEqual(3);
	});
});
