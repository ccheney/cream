/**
 * HelixDB Schema Tests
 *
 * Validates TypeScript types match schema expectations
 */

import { describe, expect, it } from "bun:test";
import {
  type Company,
  EMBEDDED_FIELDS,
  type ExternalEvent,
  type FilingChunk,
  type MacroEntity,
  type NewsItem,
  NODE_TYPES,
  type TradeDecision,
  type TradeLifecycleEvent,
  type TranscriptChunk,
} from "../src/index.js";

describe("Node Types", () => {
  it("has all 9 node types defined", () => {
    expect(NODE_TYPES.length).toBe(9);
    expect(NODE_TYPES).toContain("TradeDecision");
    expect(NODE_TYPES).toContain("TradeLifecycleEvent");
    expect(NODE_TYPES).toContain("ExternalEvent");
    expect(NODE_TYPES).toContain("FilingChunk");
    expect(NODE_TYPES).toContain("TranscriptChunk");
    expect(NODE_TYPES).toContain("NewsItem");
    expect(NODE_TYPES).toContain("Company");
    expect(NODE_TYPES).toContain("MacroEntity");
    expect(NODE_TYPES).toContain("ThesisMemory");
  });
});

describe("Embedded Fields Registry", () => {
  it("identifies TradeDecision embedded fields", () => {
    expect(EMBEDDED_FIELDS.TradeDecision).toEqual(["rationale_text"]);
  });

  it("identifies ExternalEvent embedded fields", () => {
    expect(EMBEDDED_FIELDS.ExternalEvent).toEqual(["text_summary"]);
  });

  it("identifies FilingChunk embedded fields", () => {
    expect(EMBEDDED_FIELDS.FilingChunk).toEqual(["chunk_text"]);
  });

  it("identifies TranscriptChunk embedded fields", () => {
    expect(EMBEDDED_FIELDS.TranscriptChunk).toEqual(["chunk_text"]);
  });

  it("identifies NewsItem embedded fields (both headline and body)", () => {
    expect(EMBEDDED_FIELDS.NewsItem).toEqual(["headline", "body_text"]);
  });

  it("identifies nodes without embedded fields", () => {
    expect(EMBEDDED_FIELDS.TradeLifecycleEvent).toEqual([]);
    expect(EMBEDDED_FIELDS.Company).toEqual([]);
    expect(EMBEDDED_FIELDS.MacroEntity).toEqual([]);
  });
});

describe("TradeDecision type", () => {
  it("accepts valid TradeDecision", () => {
    const decision: TradeDecision = {
      decision_id: "td-001",
      cycle_id: "cycle-2026-01-04-10",
      instrument_id: "AAPL",
      regime_label: "BULL_TREND",
      action: "BUY",
      decision_json: '{"size": 100}',
      rationale_text: "Strong momentum with volume confirmation",
      snapshot_reference: "snap-001",
      created_at: "2026-01-04T10:00:00Z",
      environment: "PAPER",
    };

    expect(decision.decision_id).toBe("td-001");
    expect(decision.action).toBe("BUY");
    expect(decision.environment).toBe("PAPER");
  });

  it("accepts optional fields", () => {
    const decision: TradeDecision = {
      decision_id: "td-002",
      cycle_id: "cycle-001",
      instrument_id: "AAPL  261219C00200000", // Option symbol
      underlying_symbol: "AAPL",
      regime_label: "HIGH_VOL",
      action: "SELL",
      decision_json: "{}",
      rationale_text: "IV crush play",
      snapshot_reference: "snap-002",
      realized_outcome: '{"pnl": 500}',
      created_at: "2026-01-04T10:00:00Z",
      closed_at: "2026-01-05T10:00:00Z",
      environment: "LIVE",
    };

    expect(decision.underlying_symbol).toBe("AAPL");
    expect(decision.realized_outcome).toBeDefined();
    expect(decision.closed_at).toBeDefined();
  });
});

describe("TradeLifecycleEvent type", () => {
  it("accepts valid TradeLifecycleEvent", () => {
    const event: TradeLifecycleEvent = {
      event_id: "evt-001",
      decision_id: "td-001",
      event_type: "FILL",
      timestamp: "2026-01-04T10:05:00Z",
      price: 150.25,
      quantity: 100,
      environment: "PAPER",
    };

    expect(event.event_type).toBe("FILL");
    expect(event.price).toBe(150.25);
  });
});

describe("ExternalEvent type", () => {
  it("accepts valid ExternalEvent", () => {
    const event: ExternalEvent = {
      event_id: "ee-001",
      event_type: "EARNINGS",
      event_time: "2026-01-04T16:00:00Z",
      payload: '{"eps": 1.25, "revenue": 100000000}',
      text_summary: "AAPL beats earnings expectations",
      related_instrument_ids: '["AAPL", "AAPL230120C00150000"]',
    };

    expect(event.event_type).toBe("EARNINGS");
  });

  it("accepts ExternalEvent without optional text_summary", () => {
    const event: ExternalEvent = {
      event_id: "ee-002",
      event_type: "MACRO",
      event_time: "2026-01-04T08:30:00Z",
      payload: '{"cpi": 3.2}',
      related_instrument_ids: "[]",
    };

    expect(event.text_summary).toBeUndefined();
  });
});

describe("Document nodes", () => {
  it("accepts valid FilingChunk", () => {
    const chunk: FilingChunk = {
      chunk_id: "fc-001",
      filing_id: "0001193125-26-000001",
      company_symbol: "AAPL",
      filing_type: "10-K",
      filing_date: "2026-01-15",
      chunk_text: "Revenue increased 15% year-over-year...",
      chunk_index: 42,
    };

    expect(chunk.filing_type).toBe("10-K");
  });

  it("accepts valid TranscriptChunk", () => {
    const chunk: TranscriptChunk = {
      chunk_id: "tc-001",
      transcript_id: "AAPL-Q4-2025",
      company_symbol: "AAPL",
      call_date: "2026-01-25",
      speaker: "CEO",
      chunk_text: "We are excited to announce...",
      chunk_index: 5,
    };

    expect(chunk.speaker).toBe("CEO");
  });

  it("accepts valid NewsItem", () => {
    const item: NewsItem = {
      item_id: "ni-001",
      headline: "Apple Announces New Product Line",
      body_text: "Apple Inc. today announced...",
      published_at: "2026-01-04T09:00:00Z",
      source: "Reuters",
      related_symbols: '["AAPL", "GOOG"]',
      sentiment_score: 0.75,
    };

    expect(item.sentiment_score).toBe(0.75);
  });
});

describe("Domain Knowledge nodes", () => {
  it("accepts valid Company", () => {
    const company: Company = {
      symbol: "AAPL",
      name: "Apple Inc.",
      sector: "Technology",
      industry: "Consumer Electronics",
      market_cap_bucket: "MEGA",
    };

    expect(company.market_cap_bucket).toBe("MEGA");
  });

  it("accepts valid MacroEntity", () => {
    const entity: MacroEntity = {
      entity_id: "CPI",
      name: "Consumer Price Index",
      description: "Measures changes in consumer prices",
      frequency: "MONTHLY",
    };

    expect(entity.frequency).toBe("MONTHLY");
  });
});
