// Cream Trading System - HelixDB Schema
// Complete HelixQL schema for all node types
//
// Node Types (9 total):
// - Trading Memory: TradeDecision, TradeLifecycleEvent
// - External Events: ExternalEvent
// - Documents: FilingChunk, TranscriptChunk, NewsItem
// - Domain Knowledge: Company, MacroEntity
// - Meta: Environment (enum-like)
//
// @see docs/plans/04-memory-helixdb.md for full specification

// ============================================
// Trading Memory Nodes
// ============================================

// Stores each trading decision with its context and outcomes
N::TradeDecision {
    // Unique identifier
    decision_id: String,

    // Cycle when decision was made
    cycle_id: String,

    // Traded instrument (ticker or OCC symbol for options)
    instrument_id: String,

    // For options, the underlying symbol
    underlying_symbol: String?,

    // Market regime at decision time (BULL_TREND, BEAR_TREND, RANGE, etc.)
    regime_label: String,

    // Trading action: BUY, SELL, HOLD, INCREASE, REDUCE, NO_TRADE
    action: String,

    // Full approved decision payload as JSON
    decision_json: String,

    // Human-readable rationale - EMBEDDED for semantic retrieval
    rationale_text: Embed(String),

    // Pointer to MarketSnapshot used for decision
    snapshot_reference: String,

    // Filled incrementally with execution results (JSON)
    realized_outcome: String?,

    // Decision timestamp (ISO 8601)
    created_at: String,

    // When position was fully closed (ISO 8601)
    closed_at: String?,

    // Trading environment: BACKTEST, PAPER, LIVE
    environment: String,
}

// Indexes for TradeDecision
INDEX TradeDecision.decision_id
INDEX TradeDecision.cycle_id
INDEX TradeDecision.instrument_id
INDEX TradeDecision.regime_label
INDEX TradeDecision.environment
// Composite index for common query pattern
INDEX TradeDecision.(instrument_id, regime_label)


// Represents events in a trade's lifecycle (fills, adjustments, closes)
N::TradeLifecycleEvent {
    // Unique identifier
    event_id: String,

    // Parent decision reference
    decision_id: String,

    // Event type: FILL, PARTIAL_FILL, ADJUSTMENT, CLOSE
    event_type: String,

    // When event occurred (ISO 8601)
    timestamp: String,

    // Execution price
    price: F64,

    // Quantity involved (signed: positive=buy, negative=sell)
    quantity: I64,

    // Trading environment: BACKTEST, PAPER, LIVE
    environment: String,
}

// Indexes for TradeLifecycleEvent
INDEX TradeLifecycleEvent.event_id
INDEX TradeLifecycleEvent.decision_id
INDEX TradeLifecycleEvent.environment


// ============================================
// External Event Nodes
// ============================================

// Represents discrete market events that may influence decisions
N::ExternalEvent {
    // Unique identifier
    event_id: String,

    // Event type: EARNINGS, MACRO, NEWS, SENTIMENT_SPIKE, FED_MEETING, etc.
    event_type: String,

    // When event occurred (ISO 8601)
    event_time: String,

    // Structured event details as JSON
    payload: String,

    // Summary text - optionally EMBEDDED for semantic retrieval
    text_summary: Embed(String)?,

    // Affected instrument IDs as JSON array
    related_instrument_ids: String,
}

// Indexes for ExternalEvent
INDEX ExternalEvent.event_id
INDEX ExternalEvent.event_type
// Composite index for time-based event filtering
INDEX ExternalEvent.(event_type, event_time)


// ============================================
// Document Nodes
// ============================================

// Chunked SEC filings for retrieval (10-K, 10-Q, 8-K)
N::FilingChunk {
    // Unique identifier
    chunk_id: String,

    // Parent filing identifier
    filing_id: String,

    // Company ticker symbol
    company_symbol: String,

    // Filing type: 10-K, 10-Q, 8-K, etc.
    filing_type: String,

    // Filing date (YYYY-MM-DD)
    filing_date: String,

    // Chunk text - EMBEDDED for semantic retrieval
    chunk_text: Embed(String),

    // Position in the filing (0-indexed)
    chunk_index: I64,
}

// Indexes for FilingChunk
INDEX FilingChunk.chunk_id
INDEX FilingChunk.filing_id
INDEX FilingChunk.company_symbol
// Composite index for company filings by date
INDEX FilingChunk.(company_symbol, filing_date)


// Chunked earnings call transcripts
N::TranscriptChunk {
    // Unique identifier
    chunk_id: String,

    // Parent transcript identifier
    transcript_id: String,

    // Company ticker symbol
    company_symbol: String,

    // Earnings call date (YYYY-MM-DD)
    call_date: String,

    // Speaker: CEO, CFO, COO, Analyst, Operator, etc.
    speaker: String,

    // Chunk text - EMBEDDED for semantic retrieval
    chunk_text: Embed(String),

    // Position in the transcript (0-indexed)
    chunk_index: I64,
}

// Indexes for TranscriptChunk
INDEX TranscriptChunk.chunk_id
INDEX TranscriptChunk.transcript_id
INDEX TranscriptChunk.company_symbol
// Composite index for company transcripts by date
INDEX TranscriptChunk.(company_symbol, call_date)


// News articles and press releases
N::NewsItem {
    // Unique identifier
    item_id: String,

    // Headline - EMBEDDED for semantic retrieval
    headline: Embed(String),

    // Full body text - EMBEDDED for semantic retrieval
    body_text: Embed(String),

    // Publication time (ISO 8601)
    published_at: String,

    // News source (e.g., "Reuters", "Bloomberg", "PR Newswire")
    source: String,

    // Mentioned ticker symbols as JSON array
    related_symbols: String,

    // Pre-computed sentiment score [-1.0, 1.0]
    sentiment_score: F64,
}

// Indexes for NewsItem
INDEX NewsItem.item_id
INDEX NewsItem.published_at
INDEX NewsItem.source


// ============================================
// Domain Knowledge Nodes
// ============================================

// Company metadata for relationship reasoning
N::Company {
    // Ticker symbol (primary identifier)
    symbol: String,

    // Full company name
    name: String,

    // GICS sector (e.g., "Technology", "Healthcare")
    sector: String,

    // GICS industry (e.g., "Software", "Biotechnology")
    industry: String,

    // Market cap bucket: MEGA, LARGE, MID, SMALL, MICRO
    market_cap_bucket: String,
}

// Indexes for Company
INDEX Company.symbol
INDEX Company.sector
INDEX Company.industry


// Macroeconomic concepts for event linking
N::MacroEntity {
    // Entity identifier (e.g., "CPI", "FOMC", "NFP", "GDP")
    entity_id: String,

    // Full name (e.g., "Consumer Price Index")
    name: String,

    // Description of what it represents
    description: String,

    // Release frequency: MONTHLY, QUARTERLY, WEEKLY, IRREGULAR
    frequency: String,
}

// Indexes for MacroEntity
INDEX MacroEntity.entity_id
INDEX MacroEntity.frequency


// ============================================
// Relationship Edges (GraphRAG)
// ============================================

// Links external events to trading decisions they influenced
E::INFLUENCED_DECISION {
    // Source: ExternalEvent, Target: TradeDecision
    source: ExternalEvent,
    target: TradeDecision,

    // Influence score [0.0, 1.0]
    influence_score: F64,

    // How the event influenced the decision
    influence_type: String,
}

// Links documents to companies they are about
E::FILED_BY {
    // Source: FilingChunk, Target: Company
    source: FilingChunk,
    target: Company,
}

E::TRANSCRIPT_FOR {
    // Source: TranscriptChunk, Target: Company
    source: TranscriptChunk,
    target: Company,
}

E::MENTIONS_COMPANY {
    // Source: NewsItem, Target: Company
    source: NewsItem,
    target: Company,

    // Mention sentiment [-1.0, 1.0]
    sentiment: F64?,
}

// Links events to macro entities they relate to
E::RELATES_TO_MACRO {
    // Source: ExternalEvent, Target: MacroEntity
    source: ExternalEvent,
    target: MacroEntity,
}

// Links companies that are related (sector peers, supply chain, etc.)
E::RELATED_TO {
    // Source: Company, Target: Company
    source: Company,
    target: Company,

    // Relationship type: SECTOR_PEER, SUPPLY_CHAIN, COMPETITOR, CUSTOMER
    relationship_type: String,
}

// Links decisions to the trade lifecycle events
E::HAS_EVENT {
    // Source: TradeDecision, Target: TradeLifecycleEvent
    source: TradeDecision,
    target: TradeLifecycleEvent,
}

// Links companies to other companies they depend on (supply chain, etc.)
E::DEPENDS_ON {
    // Source: Company, Target: Company
    source: Company,
    target: Company,

    // Relationship type: SUPPLIER, CUSTOMER, PARTNER
    relationship_type: String,

    // Strength of dependency [0.0, 1.0]
    strength: F64,
}

// Links companies to macro entities that affect them
E::AFFECTED_BY {
    // Source: Company, Target: MacroEntity
    source: Company,
    target: MacroEntity,

    // Sensitivity to this macro factor [0.0, 1.0] where 1.0 = highly sensitive
    sensitivity: F64,
}

// Links companies to documents that mention them
E::MENTIONED_IN {
    // Source: Company, Target: FilingChunk | TranscriptChunk | NewsItem
    // Note: Target can be any document type
    source: Company,
    target: String, // Document ID (chunk_id or item_id)

    // Document type: FILING, TRANSCRIPT, NEWS
    document_type: String,

    // Mention type: PRIMARY (main subject), SECONDARY (notable mention), PEER_COMPARISON (comparison context)
    mention_type: String,
}
