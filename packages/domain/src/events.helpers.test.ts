import { describe, expect, it } from "bun:test";
import {
	createEarningsEvent,
	createMacroEvent,
	createNewsEvent,
	getEventSurpriseScore,
	isEarningsEvent,
	isMacroEvent,
	isNewsEvent,
} from "./events";

describe("createEarningsEvent", () => {
	it("creates earnings event with defaults", () => {
		const event = createEarningsEvent(
			"550e8400-e29b-41d4-a716-446655440000",
			"2026-01-05T10:00:00Z",
			{ symbol: "AAPL", quarter: "Q1", year: 2026, transcriptAvailable: false },
		);
		expect(event.eventType).toBe("EARNINGS");
		expect(event.relatedInstrumentIds).toEqual(["AAPL"]);
	});
});

describe("createMacroEvent", () => {
	it("creates macro event with defaults", () => {
		const event = createMacroEvent("550e8400-e29b-41d4-a716-446655440000", "2026-01-05T10:00:00Z", {
			indicatorName: "CPI",
			value: 3.2,
			unit: "",
			country: "US",
		});
		expect(event.eventType).toBe("MACRO");
		expect(event.relatedInstrumentIds).toEqual([]);
	});
});

describe("createNewsEvent", () => {
	it("creates news event", () => {
		const event = createNewsEvent(
			"550e8400-e29b-41d4-a716-446655440000",
			"2026-01-05T10:00:00Z",
			{ headline: "Test", body: "Content", source: "Reuters", entities: [], keyInsights: [] },
			["AAPL"],
		);
		expect(event.eventType).toBe("NEWS");
		expect(event.headline).toBe("Test");
	});
});

describe("event type guards", () => {
	const earningsEvent = createEarningsEvent(
		"550e8400-e29b-41d4-a716-446655440000",
		"2026-01-05T10:00:00Z",
		{ symbol: "AAPL", quarter: "Q1", year: 2026, transcriptAvailable: false },
	);

	const macroEvent = createMacroEvent(
		"550e8400-e29b-41d4-a716-446655440000",
		"2026-01-05T10:00:00Z",
		{ indicatorName: "CPI", value: 3.2, unit: "", country: "US" },
	);

	const newsEvent = createNewsEvent(
		"550e8400-e29b-41d4-a716-446655440000",
		"2026-01-05T10:00:00Z",
		{ headline: "Test", body: "Content", source: "Reuters", entities: [], keyInsights: [] },
		["AAPL"],
	);

	it("isEarningsEvent works", () => {
		expect(isEarningsEvent(earningsEvent)).toBe(true);
		expect(isEarningsEvent(macroEvent)).toBe(false);
	});

	it("isMacroEvent works", () => {
		expect(isMacroEvent(macroEvent)).toBe(true);
		expect(isMacroEvent(earningsEvent)).toBe(false);
	});

	it("isNewsEvent works", () => {
		expect(isNewsEvent(newsEvent)).toBe(true);
		expect(isNewsEvent(earningsEvent)).toBe(false);
		expect(isNewsEvent(macroEvent)).toBe(false);
	});
});

describe("getEventSurpriseScore earnings inputs", () => {
	it("returns surprise score from event field", () => {
		const event = createEarningsEvent(
			"550e8400-e29b-41d4-a716-446655440000",
			"2026-01-05T10:00:00Z",
			{ symbol: "AAPL", quarter: "Q1", year: 2026, transcriptAvailable: false },
			{ surpriseScore: 0.5 },
		);
		expect(getEventSurpriseScore(event)).toBe(0.5);
	});

	it("calculates from earnings payload", () => {
		const event = createEarningsEvent(
			"550e8400-e29b-41d4-a716-446655440000",
			"2026-01-05T10:00:00Z",
			{
				symbol: "AAPL",
				quarter: "Q1",
				year: 2026,
				epsSurprisePct: 25,
				transcriptAvailable: false,
			},
		);
		expect(getEventSurpriseScore(event)).toBe(0.5);
	});

	it("caps surprise score at ±1", () => {
		const event = createEarningsEvent(
			"550e8400-e29b-41d4-a716-446655440000",
			"2026-01-05T10:00:00Z",
			{
				symbol: "AAPL",
				quarter: "Q1",
				year: 2026,
				epsSurprisePct: 100,
				transcriptAvailable: false,
			},
		);
		expect(getEventSurpriseScore(event)).toBe(1);
	});
});

describe("getEventSurpriseScore macro inputs", () => {
	it("calculates from macro payload surprisePct", () => {
		const event = createMacroEvent("550e8400-e29b-41d4-a716-446655440000", "2026-01-05T10:00:00Z", {
			indicatorName: "Non-Farm Payrolls",
			value: 250000,
			surprisePct: 20,
			unit: "jobs",
			country: "US",
		});
		expect(getEventSurpriseScore(event)).toBe(0.4);
	});

	it("caps macro surprise score at ±1", () => {
		const event = createMacroEvent("550e8400-e29b-41d4-a716-446655440000", "2026-01-05T10:00:00Z", {
			indicatorName: "CPI",
			value: 4.5,
			surprisePct: 75,
			unit: "%",
			country: "US",
		});
		expect(getEventSurpriseScore(event)).toBe(1);
	});

	it("caps negative surprise scores at -1", () => {
		const event = createMacroEvent("550e8400-e29b-41d4-a716-446655440000", "2026-01-05T10:00:00Z", {
			indicatorName: "GDP",
			value: -1.5,
			surprisePct: -80,
			unit: "%",
			country: "US",
		});
		expect(getEventSurpriseScore(event)).toBe(-1);
	});
});

describe("getEventSurpriseScore unsupported inputs", () => {
	it("returns undefined for event without surprise data", () => {
		const event = createMacroEvent("550e8400-e29b-41d4-a716-446655440000", "2026-01-05T10:00:00Z", {
			indicatorName: "GDP",
			value: 2.5,
			unit: "%",
			country: "US",
		});
		expect(getEventSurpriseScore(event)).toBeUndefined();
	});

	it("returns undefined for news event", () => {
		const event = createNewsEvent(
			"550e8400-e29b-41d4-a716-446655440000",
			"2026-01-05T10:00:00Z",
			{ headline: "Test", body: "Content", source: "Reuters", entities: [], keyInsights: [] },
			["AAPL"],
		);
		expect(getEventSurpriseScore(event)).toBeUndefined();
	});
});
