import { describe, expect, it } from "bun:test";

import { allowsSkipOnFailure, requiresRejectionOnFailure } from "../llm-parsing";

describe("requiresRejectionOnFailure", () => {
	it("returns true for critical agents", () => {
		expect(requiresRejectionOnFailure("RiskManagerAgent")).toBe(true);
		expect(requiresRejectionOnFailure("CriticAgent")).toBe(true);
		expect(requiresRejectionOnFailure("TraderAgent")).toBe(true);
	});

	it("returns false for research agents", () => {
		expect(requiresRejectionOnFailure("TechnicalAnalyst")).toBe(false);
		expect(requiresRejectionOnFailure("BullishResearchAgent")).toBe(false);
	});
});

describe("allowsSkipOnFailure", () => {
	it("returns true for research agents", () => {
		expect(allowsSkipOnFailure("TechnicalAnalyst")).toBe(true);
		expect(allowsSkipOnFailure("NewsSentimentAnalyst")).toBe(true);
		expect(allowsSkipOnFailure("FundamentalsMacroAnalyst")).toBe(true);
		expect(allowsSkipOnFailure("BullishResearchAgent")).toBe(true);
		expect(allowsSkipOnFailure("BearishResearchAgent")).toBe(true);
	});

	it("returns false for critical agents", () => {
		expect(allowsSkipOnFailure("RiskManagerAgent")).toBe(false);
		expect(allowsSkipOnFailure("CriticAgent")).toBe(false);
		expect(allowsSkipOnFailure("TraderAgent")).toBe(false);
	});
});
