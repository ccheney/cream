/**
 * Event Ingestion Service Tests
 *
 * Tests for the EventIngestionService including:
 * - Event type mapping
 * - Text summary building
 * - ExternalEvent conversion
 * - Macro factor identification
 */

import { describe, expect, test } from "bun:test";
import { _internal, type ExtractedEvent } from "./event-ingestion.js";

const { mapEventType, buildTextSummary, toExternalEvent, identifyMacroFactors } = _internal;

// ============================================
// Test Data Factories
// ============================================

function createMockExtractedEvent(overrides: Partial<ExtractedEvent> = {}): ExtractedEvent {
	return {
		eventId: "test-event-123",
		sourceType: "news",
		eventType: "earnings",
		eventTime: new Date("2025-01-15T10:00:00Z"),
		extraction: {
			sentiment: "bullish",
			confidence: 0.85,
			entities: [{ name: "Apple Inc", type: "company", ticker: "AAPL" }],
			dataPoints: [{ metric: "EPS", value: 2.1, unit: "USD", period: "Q4 2024" }],
			eventType: "earnings",
			importance: 0.9,
			summary: "Apple reports strong Q4 earnings beating analyst expectations",
			keyInsights: ["Revenue up 15% YoY", "Services segment growth accelerates"],
		},
		scores: {
			sentimentScore: 0.7,
			importanceScore: 0.85,
			surpriseScore: 0.6,
		},
		relatedInstrumentIds: ["AAPL"],
		originalContent: "Apple Inc reported fourth quarter earnings...",
		processedAt: new Date("2025-01-15T10:05:00Z"),
		...overrides,
	};
}

// ============================================
// Event Type Mapping Tests
// ============================================

describe("mapEventType", () => {
	test("maps known event types", () => {
		expect(mapEventType("news", "earnings")).toBe("EARNINGS");
		expect(mapEventType("news", "guidance")).toBe("EARNINGS");
		expect(mapEventType("news", "dividend")).toBe("EARNINGS");
		expect(mapEventType("news", "macro_release")).toBe("MACRO");
		expect(mapEventType("news", "analyst_rating")).toBe("NEWS");
		expect(mapEventType("news", "merger_acquisition")).toBe("NEWS");
		expect(mapEventType("news", "product_launch")).toBe("NEWS");
		expect(mapEventType("news", "regulatory")).toBe("NEWS");
		expect(mapEventType("news", "other")).toBe("NEWS");
	});

	test("maps unknown event type to NEWS", () => {
		expect(mapEventType("news", "unknown_type")).toBe("NEWS");
	});

	test("maps macro source type to MACRO regardless of eventType", () => {
		expect(mapEventType("macro", "any_type")).toBe("MACRO");
		expect(mapEventType("macro", "earnings")).toBe("MACRO");
	});
});

// ============================================
// Text Summary Building Tests
// ============================================

describe("buildTextSummary content", () => {
	test("includes summary, key insights, sentiment, and data", () => {
		const summary = buildTextSummary(createMockExtractedEvent());
		expect(summary).toContain("Apple reports strong Q4 earnings beating analyst expectations");
		expect(summary).toContain("Key insights:");
		expect(summary).toContain("Revenue up 15% YoY");
		expect(summary).toContain("Services segment growth accelerates");
		expect(summary).toContain("Sentiment: bullish");
		expect(summary).toContain("confidence: 0.85");
		expect(summary).toContain("Data:");
		expect(summary).toContain("EPS: 2.1 USD");
	});

	test("limits data points to 3", () => {
		const event = createMockExtractedEvent({
			extraction: {
				...createMockExtractedEvent().extraction,
				dataPoints: [
					{ metric: "Revenue", value: 100, unit: "B" },
					{ metric: "EPS", value: 2.1, unit: "USD" },
					{ metric: "Gross Margin", value: 45, unit: "%" },
					{ metric: "Net Income", value: 25, unit: "B" },
					{ metric: "Free Cash Flow", value: 30, unit: "B" },
				],
			},
		});
		const summary = buildTextSummary(event);
		expect(summary).toContain("Revenue:");
		expect(summary).toContain("EPS:");
		expect(summary).toContain("Gross Margin:");
		expect(summary).not.toContain("Net Income:");
		expect(summary).not.toContain("Free Cash Flow:");
	});
});

describe("buildTextSummary optional fields", () => {
	test("handles empty key insights", () => {
		const event = createMockExtractedEvent({
			extraction: {
				...createMockExtractedEvent().extraction,
				keyInsights: [],
			},
		});
		expect(buildTextSummary(event)).not.toContain("Key insights:");
	});

	test("handles empty data points", () => {
		const event = createMockExtractedEvent({
			extraction: {
				...createMockExtractedEvent().extraction,
				dataPoints: [],
			},
		});
		expect(buildTextSummary(event)).not.toContain("Data:");
	});
});

// ============================================
// ExternalEvent Conversion Tests
// ============================================

describe("toExternalEvent", () => {
	test("converts eventId to event_id", () => {
		const external = toExternalEvent(createMockExtractedEvent());
		expect(external.event_id).toBe("test-event-123");
	});

	test("maps event type correctly", () => {
		const external = toExternalEvent(createMockExtractedEvent({ eventType: "earnings" }));
		expect(external.event_type).toBe("EARNINGS");
	});

	test("converts eventTime to ISO string", () => {
		const external = toExternalEvent(createMockExtractedEvent());
		expect(external.event_time).toBe("2025-01-15T10:00:00.000Z");
	});

	test("serializes payload as JSON", () => {
		const external = toExternalEvent(createMockExtractedEvent());
		const payload = JSON.parse(external.payload);
		expect(payload.sourceType).toBe("news");
		expect(payload.eventType).toBe("earnings");
		expect(payload.extraction).toBeDefined();
		expect(payload.scores).toBeDefined();
	});

	test("builds text_summary from extraction", () => {
		const external = toExternalEvent(createMockExtractedEvent());
		expect(external.text_summary).toContain("Apple reports strong Q4 earnings");
	});

	test("serializes relatedInstrumentIds as JSON", () => {
		const external = toExternalEvent(
			createMockExtractedEvent({ relatedInstrumentIds: ["AAPL", "MSFT"] }),
		);
		expect(external.related_instrument_ids).toBe(JSON.stringify(["AAPL", "MSFT"]));
	});
});

// ============================================
// Macro Factor Identification Tests
// ============================================

describe("identifyMacroFactors non-macro events", () => {
	test("returns empty array for non-macro events", () => {
		const event = createMockExtractedEvent({ eventType: "earnings" });
		expect(identifyMacroFactors(event)).toEqual([]);
	});
});

describe("identifyMacroFactors from data point metrics", () => {
	test("identifies GDP and CPI", () => {
		const gdpEvent = createMockExtractedEvent({
			eventType: "macro_release",
			extraction: {
				...createMockExtractedEvent().extraction,
				dataPoints: [{ metric: "GDP Growth", value: 2.5, unit: "%" }],
			},
		});
		const cpiEvent = createMockExtractedEvent({
			eventType: "macro_release",
			extraction: {
				...createMockExtractedEvent().extraction,
				dataPoints: [{ metric: "CPI YoY", value: 3.2, unit: "%" }],
			},
		});
		expect(identifyMacroFactors(gdpEvent)).toContain("gdp");
		expect(identifyMacroFactors(cpiEvent)).toContain("cpi");
	});

	test("identifies unemployment and PMI variants", () => {
		const unemploymentEvent = createMockExtractedEvent({
			eventType: "macro_release",
			extraction: {
				...createMockExtractedEvent().extraction,
				dataPoints: [{ metric: "Unemployment Rate", value: 3.7, unit: "%" }],
			},
		});
		const nonfarmEvent = createMockExtractedEvent({
			eventType: "macro_release",
			extraction: {
				...createMockExtractedEvent().extraction,
				dataPoints: [{ metric: "Nonfarm Payrolls", value: 250, unit: "K" }],
			},
		});
		const pmiEvent = createMockExtractedEvent({
			eventType: "macro_release",
			extraction: {
				...createMockExtractedEvent().extraction,
				dataPoints: [{ metric: "ISM PMI Manufacturing", value: 52.3, unit: "index" }],
			},
		});
		expect(identifyMacroFactors(unemploymentEvent)).toContain("unemployment");
		expect(identifyMacroFactors(nonfarmEvent)).toContain("unemployment");
		expect(identifyMacroFactors(pmiEvent)).toContain("pmi_manufacturing");
	});
});

describe("identifyMacroFactors from summary keywords", () => {
	test("identifies fed funds rate from summary", () => {
		const event = createMockExtractedEvent({
			eventType: "macro_release",
			extraction: {
				...createMockExtractedEvent().extraction,
				summary: "FOMC raises interest rate by 25 basis points",
				dataPoints: [],
			},
		});
		expect(identifyMacroFactors(event)).toContain("fed_funds_rate");
	});

	test("identifies oil and treasury keywords", () => {
		const oilEvent = createMockExtractedEvent({
			eventType: "macro_release",
			extraction: {
				...createMockExtractedEvent().extraction,
				summary: "OPEC+ announces crude oil production cuts",
				dataPoints: [],
			},
		});
		const treasuryEvent = createMockExtractedEvent({
			eventType: "macro_release",
			extraction: {
				...createMockExtractedEvent().extraction,
				summary: "Treasury yields surge on inflation concerns",
				dataPoints: [],
			},
		});
		expect(identifyMacroFactors(oilEvent)).toContain("oil_wti");
		expect(identifyMacroFactors(treasuryEvent)).toContain("treasury_10y");
	});
});

describe("identifyMacroFactors combined behavior", () => {
	test("identifies multiple factors from combined data", () => {
		const event = createMockExtractedEvent({
			eventType: "macro_release",
			extraction: {
				...createMockExtractedEvent().extraction,
				summary: "Fed raises rates amid inflation concerns",
				dataPoints: [
					{ metric: "CPI", value: 3.5, unit: "%" },
					{ metric: "Fed Funds Rate", value: 5.5, unit: "%" },
				],
			},
		});
		const factors = identifyMacroFactors(event);
		expect(factors).toContain("cpi");
		expect(factors).toContain("fed_funds_rate");
	});

	test("deduplicates factors", () => {
		const event = createMockExtractedEvent({
			eventType: "macro_release",
			extraction: {
				...createMockExtractedEvent().extraction,
				summary: "FOMC decision on interest rate policy",
				dataPoints: [{ metric: "Fed Rate Target", value: 5.5, unit: "%" }],
			},
		});
		const factors = identifyMacroFactors(event);
		expect(factors.filter((factor) => factor === "fed_funds_rate").length).toBe(1);
	});

	test("returns valid non-empty factor IDs", () => {
		const event = createMockExtractedEvent({
			eventType: "macro_release",
			extraction: {
				...createMockExtractedEvent().extraction,
				dataPoints: [{ metric: "GDP Growth", value: 2.5, unit: "%" }],
			},
		});
		for (const factor of identifyMacroFactors(event)) {
			expect(typeof factor).toBe("string");
			expect(factor.length).toBeGreaterThan(0);
		}
	});
});
