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
  test("maps earnings to EARNINGS", () => {
    expect(mapEventType("news", "earnings")).toBe("EARNINGS");
  });

  test("maps guidance to EARNINGS", () => {
    expect(mapEventType("news", "guidance")).toBe("EARNINGS");
  });

  test("maps dividend to EARNINGS", () => {
    expect(mapEventType("news", "dividend")).toBe("EARNINGS");
  });

  test("maps macro_release to MACRO", () => {
    expect(mapEventType("news", "macro_release")).toBe("MACRO");
  });

  test("maps analyst_rating to NEWS", () => {
    expect(mapEventType("news", "analyst_rating")).toBe("NEWS");
  });

  test("maps merger_acquisition to NEWS", () => {
    expect(mapEventType("news", "merger_acquisition")).toBe("NEWS");
  });

  test("maps product_launch to NEWS", () => {
    expect(mapEventType("news", "product_launch")).toBe("NEWS");
  });

  test("maps regulatory to NEWS", () => {
    expect(mapEventType("news", "regulatory")).toBe("NEWS");
  });

  test("maps unknown event type to NEWS", () => {
    expect(mapEventType("news", "unknown_type")).toBe("NEWS");
  });

  test("maps macro source type to MACRO regardless of eventType", () => {
    expect(mapEventType("macro", "any_type")).toBe("MACRO");
    expect(mapEventType("macro", "earnings")).toBe("MACRO");
  });

  test("maps other to NEWS", () => {
    expect(mapEventType("news", "other")).toBe("NEWS");
  });
});

// ============================================
// Text Summary Building Tests
// ============================================

describe("buildTextSummary", () => {
  test("includes summary as first part", () => {
    const event = createMockExtractedEvent();
    const summary = buildTextSummary(event);
    expect(summary).toContain("Apple reports strong Q4 earnings beating analyst expectations");
  });

  test("includes key insights when present", () => {
    const event = createMockExtractedEvent();
    const summary = buildTextSummary(event);
    expect(summary).toContain("Key insights:");
    expect(summary).toContain("Revenue up 15% YoY");
    expect(summary).toContain("Services segment growth accelerates");
  });

  test("includes sentiment context", () => {
    const event = createMockExtractedEvent();
    const summary = buildTextSummary(event);
    expect(summary).toContain("Sentiment: bullish");
    expect(summary).toContain("confidence: 0.85");
  });

  test("includes data points when present", () => {
    const event = createMockExtractedEvent();
    const summary = buildTextSummary(event);
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

  test("handles empty key insights", () => {
    const event = createMockExtractedEvent({
      extraction: {
        ...createMockExtractedEvent().extraction,
        keyInsights: [],
      },
    });
    const summary = buildTextSummary(event);
    expect(summary).not.toContain("Key insights:");
  });

  test("handles empty data points", () => {
    const event = createMockExtractedEvent({
      extraction: {
        ...createMockExtractedEvent().extraction,
        dataPoints: [],
      },
    });
    const summary = buildTextSummary(event);
    expect(summary).not.toContain("Data:");
  });
});

// ============================================
// ExternalEvent Conversion Tests
// ============================================

describe("toExternalEvent", () => {
  test("converts eventId to event_id", () => {
    const event = createMockExtractedEvent();
    const external = toExternalEvent(event);
    expect(external.event_id).toBe("test-event-123");
  });

  test("maps event type correctly", () => {
    const event = createMockExtractedEvent({ eventType: "earnings" });
    const external = toExternalEvent(event);
    expect(external.event_type).toBe("EARNINGS");
  });

  test("converts eventTime to ISO string", () => {
    const event = createMockExtractedEvent();
    const external = toExternalEvent(event);
    expect(external.event_time).toBe("2025-01-15T10:00:00.000Z");
  });

  test("serializes payload as JSON", () => {
    const event = createMockExtractedEvent();
    const external = toExternalEvent(event);
    const payload = JSON.parse(external.payload);
    expect(payload.sourceType).toBe("news");
    expect(payload.eventType).toBe("earnings");
    expect(payload.extraction).toBeDefined();
    expect(payload.scores).toBeDefined();
  });

  test("builds text_summary from extraction", () => {
    const event = createMockExtractedEvent();
    const external = toExternalEvent(event);
    expect(external.text_summary).toContain("Apple reports strong Q4 earnings");
  });

  test("serializes relatedInstrumentIds as JSON", () => {
    const event = createMockExtractedEvent({ relatedInstrumentIds: ["AAPL", "MSFT"] });
    const external = toExternalEvent(event);
    expect(external.related_instrument_ids).toBe(JSON.stringify(["AAPL", "MSFT"]));
  });
});

// ============================================
// Macro Factor Identification Tests
// ============================================

describe("identifyMacroFactors", () => {
  test("returns empty array for non-macro events", () => {
    const event = createMockExtractedEvent({ eventType: "earnings" });
    const factors = identifyMacroFactors(event);
    expect(factors).toEqual([]);
  });

  test("identifies GDP from data point metrics", () => {
    const event = createMockExtractedEvent({
      eventType: "macro_release",
      extraction: {
        ...createMockExtractedEvent().extraction,
        dataPoints: [{ metric: "GDP Growth", value: 2.5, unit: "%" }],
      },
    });
    const factors = identifyMacroFactors(event);
    expect(factors).toContain("gdp");
  });

  test("identifies CPI from data point metrics", () => {
    const event = createMockExtractedEvent({
      eventType: "macro_release",
      extraction: {
        ...createMockExtractedEvent().extraction,
        dataPoints: [{ metric: "CPI YoY", value: 3.2, unit: "%" }],
      },
    });
    const factors = identifyMacroFactors(event);
    expect(factors).toContain("cpi");
  });

  test("identifies unemployment from data point metrics", () => {
    const event = createMockExtractedEvent({
      eventType: "macro_release",
      extraction: {
        ...createMockExtractedEvent().extraction,
        dataPoints: [{ metric: "Unemployment Rate", value: 3.7, unit: "%" }],
      },
    });
    const factors = identifyMacroFactors(event);
    expect(factors).toContain("unemployment");
  });

  test("identifies nonfarm payrolls as unemployment", () => {
    const event = createMockExtractedEvent({
      eventType: "macro_release",
      extraction: {
        ...createMockExtractedEvent().extraction,
        dataPoints: [{ metric: "Nonfarm Payrolls", value: 250, unit: "K" }],
      },
    });
    const factors = identifyMacroFactors(event);
    expect(factors).toContain("unemployment");
  });

  test("identifies PMI from data point metrics", () => {
    const event = createMockExtractedEvent({
      eventType: "macro_release",
      extraction: {
        ...createMockExtractedEvent().extraction,
        dataPoints: [{ metric: "ISM PMI Manufacturing", value: 52.3, unit: "index" }],
      },
    });
    const factors = identifyMacroFactors(event);
    expect(factors).toContain("pmi_manufacturing");
  });

  test("identifies fed funds rate from summary keywords", () => {
    const event = createMockExtractedEvent({
      eventType: "macro_release",
      extraction: {
        ...createMockExtractedEvent().extraction,
        summary: "FOMC raises interest rate by 25 basis points",
        dataPoints: [],
      },
    });
    const factors = identifyMacroFactors(event);
    expect(factors).toContain("fed_funds_rate");
  });

  test("identifies oil from summary keywords", () => {
    const event = createMockExtractedEvent({
      eventType: "macro_release",
      extraction: {
        ...createMockExtractedEvent().extraction,
        summary: "OPEC+ announces crude oil production cuts",
        dataPoints: [],
      },
    });
    const factors = identifyMacroFactors(event);
    expect(factors).toContain("oil_wti");
  });

  test("identifies treasury from summary keywords", () => {
    const event = createMockExtractedEvent({
      eventType: "macro_release",
      extraction: {
        ...createMockExtractedEvent().extraction,
        summary: "Treasury yields surge on inflation concerns",
        dataPoints: [],
      },
    });
    const factors = identifyMacroFactors(event);
    expect(factors).toContain("treasury_10y");
  });

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
    const fedRateOccurrences = factors.filter((f) => f === "fed_funds_rate").length;
    expect(fedRateOccurrences).toBe(1);
  });

  test("filters out invalid macro entity IDs", () => {
    const event = createMockExtractedEvent({
      eventType: "macro_release",
      extraction: {
        ...createMockExtractedEvent().extraction,
        dataPoints: [{ metric: "GDP Growth", value: 2.5, unit: "%" }],
      },
    });
    const factors = identifyMacroFactors(event);
    for (const factor of factors) {
      expect(typeof factor).toBe("string");
      expect(factor.length).toBeGreaterThan(0);
    }
  });
});
