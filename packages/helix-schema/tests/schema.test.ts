/**
 * HelixDB Schema Tests
 *
 * Validates TypeScript types match schema expectations
 */

import { describe, expect, it } from "bun:test";
import {
  type Company,
  type DerivedFromEdge,
  EMBEDDED_FIELDS,
  type ExternalEvent,
  type FilingChunk,
  type Indicator,
  type IndicatorCategory,
  type IndicatorStatus,
  type MacroEntity,
  type NewsItem,
  NODE_TYPES,
  type SimilarToEdge,
  type TradeDecision,
  type TradeLifecycleEvent,
  type TranscriptChunk,
  type UsedInDecisionEdge,
} from "../src/index.js";

describe("Node Types", () => {
  it("has all 10 node types defined", () => {
    expect(NODE_TYPES.length).toBe(10);
    expect(NODE_TYPES).toContain("TradeDecision");
    expect(NODE_TYPES).toContain("TradeLifecycleEvent");
    expect(NODE_TYPES).toContain("ExternalEvent");
    expect(NODE_TYPES).toContain("FilingChunk");
    expect(NODE_TYPES).toContain("TranscriptChunk");
    expect(NODE_TYPES).toContain("NewsItem");
    expect(NODE_TYPES).toContain("Company");
    expect(NODE_TYPES).toContain("MacroEntity");
    expect(NODE_TYPES).toContain("Indicator");
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

  it("identifies Indicator embedded fields", () => {
    expect(EMBEDDED_FIELDS.Indicator).toEqual(["embedding_text"]);
  });

  it("identifies ThesisMemory embedded fields", () => {
    expect(EMBEDDED_FIELDS.ThesisMemory).toEqual(["entry_thesis"]);
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

// ============================================
// Indicator Synthesis Tests
// ============================================

describe("Indicator type", () => {
  it("accepts valid Indicator with required fields", () => {
    const indicator: Indicator = {
      indicator_id: "ind-001",
      name: "RSI_Adaptive_14",
      category: "momentum",
      status: "staging",
      hypothesis: "Adaptive RSI performs better in trending markets",
      economic_rationale:
        "Mean reversion is stronger in low volatility regimes, adaptation improves signal quality",
      embedding_text:
        "Adaptive RSI performs better in trending markets. Mean reversion is stronger in low volatility regimes, adaptation improves signal quality",
      generated_at: "2026-01-06T12:00:00Z",
      environment: "BACKTEST",
    };

    expect(indicator.indicator_id).toBe("ind-001");
    expect(indicator.category).toBe("momentum");
    expect(indicator.status).toBe("staging");
    expect(indicator.environment).toBe("BACKTEST");
  });

  it("accepts Indicator with optional fields", () => {
    const indicator: Indicator = {
      indicator_id: "ind-002",
      name: "Volatility_Regime_Adjusted",
      category: "volatility",
      status: "production",
      hypothesis: "Volatility clustering provides predictive signal",
      economic_rationale: "GARCH effects create exploitable patterns",
      embedding_text:
        "Volatility clustering provides predictive signal. GARCH effects create exploitable patterns",
      generated_in_regime: "HIGH_VOL",
      code_hash: "abc123def456",
      ast_signature: "norm_ast_sig_001",
      deflated_sharpe: 1.25,
      probability_of_overfit: 0.15,
      information_coefficient: 0.08,
      generated_at: "2026-01-05T10:00:00Z",
      environment: "PAPER",
    };

    expect(indicator.deflated_sharpe).toBe(1.25);
    expect(indicator.probability_of_overfit).toBe(0.15);
    expect(indicator.generated_in_regime).toBe("HIGH_VOL");
  });

  it("validates IndicatorCategory type", () => {
    const categories: IndicatorCategory[] = ["momentum", "trend", "volatility", "volume", "custom"];
    expect(categories.length).toBe(5);
  });

  it("validates IndicatorStatus type", () => {
    const statuses: IndicatorStatus[] = ["staging", "paper", "production", "retired"];
    expect(statuses.length).toBe(4);
  });
});

describe("Indicator edges", () => {
  it("accepts valid SimilarToEdge", () => {
    const edge: SimilarToEdge = {
      source_id: "ind-001",
      target_id: "ind-002",
      similarity_score: 0.85,
      ast_similarity: 0.72,
      computed_at: "2026-01-06T12:00:00Z",
    };

    expect(edge.similarity_score).toBe(0.85);
    expect(edge.ast_similarity).toBe(0.72);
  });

  it("accepts SimilarToEdge without optional ast_similarity", () => {
    const edge: SimilarToEdge = {
      source_id: "ind-001",
      target_id: "ind-003",
      similarity_score: 0.65,
      computed_at: "2026-01-06T12:00:00Z",
    };

    expect(edge.ast_similarity).toBeUndefined();
  });

  it("accepts valid UsedInDecisionEdge", () => {
    const edge: UsedInDecisionEdge = {
      source_id: "ind-001",
      target_id: "td-001",
      signal_value: 72.5,
      contributed_to_outcome: true,
      decision_weight: 0.25,
    };

    expect(edge.signal_value).toBe(72.5);
    expect(edge.contributed_to_outcome).toBe(true);
    expect(edge.decision_weight).toBe(0.25);
  });

  it("accepts UsedInDecisionEdge without optional fields", () => {
    const edge: UsedInDecisionEdge = {
      source_id: "ind-002",
      target_id: "td-002",
      signal_value: 35.0,
    };

    expect(edge.contributed_to_outcome).toBeUndefined();
    expect(edge.decision_weight).toBeUndefined();
  });

  it("accepts valid DerivedFromEdge", () => {
    const edge: DerivedFromEdge = {
      source_id: "ind-002",
      target_id: "ind-001",
      derivation_type: "EVOLVED",
      derived_at: "2026-01-06T14:00:00Z",
    };

    expect(edge.derivation_type).toBe("EVOLVED");
  });

  it("accepts all DerivedFrom derivation types", () => {
    const types: DerivedFromEdge["derivation_type"][] = ["EVOLVED", "REPLACED", "ENSEMBLE"];
    expect(types.length).toBe(3);
  });
});
