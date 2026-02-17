import { describe, expect, it } from "bun:test";
import {
	AnalystRatingPayloadSchema,
	DividendPayloadSchema,
	EarningsEventPayloadSchema,
	EventQueryRequestSchema,
	ExternalEventListSchema,
	MacroEventPayloadSchema,
	MergerAcquisitionPayloadSchema,
	NewsEventPayloadSchema,
	RegulatoryPayloadSchema,
	SentimentEventPayloadSchema,
	SplitPayloadSchema,
	TypedEarningsEventSchema,
	TypedExternalEventSchema,
	TypedMacroEventSchema,
	TypedNewsEventSchema,
} from "./events";

const baseEvent = {
	eventId: "550e8400-e29b-41d4-a716-446655440000",
	eventTime: "2026-01-05T10:00:00Z",
	relatedInstrumentIds: ["AAPL"],
};

describe("EarningsEventPayloadSchema", () => {
	it("validates earnings payload", () => {
		const payload = {
			symbol: "AAPL",
			quarter: "Q1",
			year: 2026,
			epsActual: 2.18,
			epsExpected: 2.1,
			epsSurprisePct: 3.81,
			revenueActual: 120000000000,
			revenueExpected: 118000000000,
			revenueSurprisePct: 1.69,
			transcriptAvailable: true,
		};
		const result = EarningsEventPayloadSchema.safeParse(payload);
		expect(result.success).toBe(true);
	});

	it("requires symbol, quarter, and year", () => {
		const result = EarningsEventPayloadSchema.safeParse({ epsActual: 2.18 });
		expect(result.success).toBe(false);
	});

	it("allows minimal earnings payload", () => {
		const payload = {
			symbol: "AAPL",
			quarter: "Q1",
			year: 2026,
		};
		const result = EarningsEventPayloadSchema.safeParse(payload);
		expect(result.success).toBe(true);
	});
});

describe("MacroEventPayloadSchema", () => {
	it("validates macro payload", () => {
		const payload = {
			indicatorName: "Non-Farm Payrolls",
			value: 250000,
			previousValue: 200000,
			expectedValue: 220000,
			surprisePct: 13.64,
			unit: "jobs",
			country: "US",
		};
		const result = MacroEventPayloadSchema.safeParse(payload);
		expect(result.success).toBe(true);
	});

	it("defaults country to US", () => {
		const result = MacroEventPayloadSchema.safeParse({
			indicatorName: "CPI",
			value: 3.2,
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.country).toBe("US");
		}
	});
});

describe("NewsEventPayloadSchema", () => {
	it("validates news payload", () => {
		const payload = {
			headline: "Apple Reports Record Earnings",
			body: "Apple Inc. announced record quarterly earnings today.",
			source: "Reuters",
			url: "https://reuters.com/article/apple",
			entities: [{ name: "Apple", entityType: "company", ticker: "AAPL" }],
			keyInsights: ["Record iPhone sales", "Services revenue growth"],
		};
		const result = NewsEventPayloadSchema.safeParse(payload);
		expect(result.success).toBe(true);
	});

	it("requires headline, body, and source", () => {
		const result = NewsEventPayloadSchema.safeParse({ headline: "Test" });
		expect(result.success).toBe(false);
	});
});

describe("SentimentEventPayloadSchema", () => {
	it("validates sentiment payload", () => {
		const payload = {
			platform: "Twitter",
			mentionCount: 50000,
			averageVolume: 10000,
			volumeZscore: 4,
			aggregateSentiment: "BULLISH",
			windowMinutes: 60,
		};
		const result = SentimentEventPayloadSchema.safeParse(payload);
		expect(result.success).toBe(true);
	});
});

describe("MergerAcquisitionPayloadSchema", () => {
	it("validates M&A payload", () => {
		const payload = {
			transactionType: "acquisition",
			acquirerSymbol: "MSFT",
			targetSymbol: "ATVI",
			dealValue: 69000000000,
			currency: "USD",
			status: "approved",
		};
		const result = MergerAcquisitionPayloadSchema.safeParse(payload);
		expect(result.success).toBe(true);
	});
});

describe("AnalystRatingPayloadSchema", () => {
	it("validates analyst rating payload", () => {
		const payload = {
			firm: "Goldman Sachs",
			analystName: "John Smith",
			previousRating: "Hold",
			newRating: "Buy",
			previousTarget: 180,
			newTarget: 210,
			actionType: "upgrade",
		};
		const result = AnalystRatingPayloadSchema.safeParse(payload);
		expect(result.success).toBe(true);
	});
});

describe("RegulatoryPayloadSchema", () => {
	it("validates regulatory payload", () => {
		const payload = {
			regulatoryBody: "FDA",
			actionType: "approval",
			subject: "Drug XYZ",
			decision: "Approved for treatment of condition ABC",
		};
		const result = RegulatoryPayloadSchema.safeParse(payload);
		expect(result.success).toBe(true);
	});
});

describe("DividendPayloadSchema", () => {
	it("validates dividend payload", () => {
		const payload = {
			amount: 0.24,
			currency: "USD",
			exDate: "2026-02-10",
			recordDate: "2026-02-11",
			paymentDate: "2026-02-18",
			dividendType: "regular",
			yoyChangePct: 4.35,
		};
		const result = DividendPayloadSchema.safeParse(payload);
		expect(result.success).toBe(true);
	});
});

describe("SplitPayloadSchema", () => {
	it("validates split payload", () => {
		const payload = {
			splitFrom: 4,
			splitTo: 1,
			effectiveDate: "2026-08-25",
			announcementDate: "2026-07-28",
		};
		const result = SplitPayloadSchema.safeParse(payload);
		expect(result.success).toBe(true);
	});
});

describe("TypedEarningsEventSchema", () => {
	it("validates earnings event", () => {
		const event = {
			...baseEvent,
			eventType: "EARNINGS",
			payload: {
				symbol: "AAPL",
				quarter: "Q1",
				year: 2026,
				epsActual: 2.18,
			},
		};
		const result = TypedEarningsEventSchema.safeParse(event);
		expect(result.success).toBe(true);
	});
});

describe("TypedMacroEventSchema", () => {
	it("validates macro event", () => {
		const event = {
			...baseEvent,
			eventType: "MACRO",
			relatedInstrumentIds: [],
			payload: {
				indicatorName: "CPI",
				value: 3.2,
			},
		};
		const result = TypedMacroEventSchema.safeParse(event);
		expect(result.success).toBe(true);
	});
});

describe("TypedNewsEventSchema", () => {
	it("validates news event", () => {
		const event = {
			...baseEvent,
			eventType: "NEWS",
			payload: {
				headline: "Test Headline",
				body: "Test body content",
				source: "Reuters",
			},
		};
		const result = TypedNewsEventSchema.safeParse(event);
		expect(result.success).toBe(true);
	});
});

describe("TypedExternalEventSchema", () => {
	it("discriminates earnings event", () => {
		const event = {
			...baseEvent,
			eventType: "EARNINGS",
			payload: { symbol: "AAPL", quarter: "Q1", year: 2026 },
		};
		const result = TypedExternalEventSchema.safeParse(event);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.eventType).toBe("EARNINGS");
		}
	});

	it("discriminates macro event", () => {
		const event = {
			...baseEvent,
			eventType: "MACRO",
			relatedInstrumentIds: [],
			payload: { indicatorName: "GDP", value: 2.8 },
		};
		const result = TypedExternalEventSchema.safeParse(event);
		expect(result.success).toBe(true);
	});

	it("discriminates generic event", () => {
		const event = {
			...baseEvent,
			eventType: "CONFERENCE",
			payload: { name: "Investor Day" },
		};
		const result = TypedExternalEventSchema.safeParse(event);
		expect(result.success).toBe(true);
	});
});

describe("Event collection schemas", () => {
	it("validates event list", () => {
		const list = {
			events: [
				{
					eventId: "550e8400-e29b-41d4-a716-446655440000",
					eventType: "EARNINGS",
					eventTime: "2026-01-05T10:00:00Z",
					relatedInstrumentIds: ["AAPL"],
					payload: { symbol: "AAPL", quarter: "Q1", year: 2026 },
				},
			],
			totalCount: 1,
		};
		const result = ExternalEventListSchema.safeParse(list);
		expect(result.success).toBe(true);
	});

	it("validates event query request", () => {
		const request = {
			eventTypes: ["EARNINGS", "MACRO"],
			instrumentIds: ["AAPL", "MSFT"],
			startTime: "2026-01-01T00:00:00Z",
			endTime: "2026-01-05T00:00:00Z",
			limit: 50,
			minImportance: 0.5,
		};
		const result = EventQueryRequestSchema.safeParse(request);
		expect(result.success).toBe(true);
	});
});
