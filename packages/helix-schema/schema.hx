// Cream Trading System - HelixDB Schema
// Following HelixDB v2 idiomatic patterns
//
// Types:
// - V:: for vector types (embedding-searchable)
// - N:: for node types (graph entities)
// - E:: for edge types (relationships)

// ============================================
// Trading Memory - Vector Types
// ============================================

// Trading decisions with embedded rationale for semantic search
V::TradeDecision {
    INDEX decision_id: String,
    INDEX cycle_id: String,
    INDEX instrument_id: String,
    underlying_symbol: String,
    INDEX regime_label: String,
    action: String,
    decision_json: String,
    rationale_text: String,
    snapshot_reference: String,
    realized_outcome: String,
    INDEX environment: String,
    created_at: Date DEFAULT NOW,
    closed_at: String
}

// Trade lifecycle events (no embedding needed)
N::TradeLifecycleEvent {
    INDEX event_id: String,
    INDEX decision_id: String,
    event_type: String,
    price: F64,
    quantity: I64,
    INDEX environment: String,
    timestamp: Date DEFAULT NOW
}

// ============================================
// External Events - Vector Types
// ============================================

// Market events with embedded summaries for semantic search
V::ExternalEvent {
    INDEX event_id: String,
    INDEX event_type: String,
    payload: String,
    text_summary: String,
    related_instrument_ids: String,
    event_time: Date DEFAULT NOW
}

// ============================================
// Document Chunks - Vector Types
// ============================================

// SEC filings chunked for RAG retrieval
V::FilingChunk {
    INDEX chunk_id: String,
    INDEX filing_id: String,
    INDEX company_symbol: String,
    filing_type: String,
    filing_date: String,
    chunk_text: String,
    chunk_index: U32
}

// Earnings transcripts chunked for RAG retrieval
V::TranscriptChunk {
    INDEX chunk_id: String,
    INDEX transcript_id: String,
    INDEX company_symbol: String,
    call_date: String,
    speaker: String,
    chunk_text: String,
    chunk_index: U32
}

// News articles with embedded content
V::NewsItem {
    INDEX item_id: String,
    headline: String,
    body_text: String,
    INDEX source: String,
    related_symbols: String,
    sentiment_score: F64,
    published_at: Date DEFAULT NOW
}

// ============================================
// Domain Knowledge - Node Types
// ============================================

// Company metadata for graph relationships
N::Company {
    INDEX symbol: String,
    name: String,
    INDEX sector: String,
    INDEX industry: String,
    market_cap_bucket: String
}

// Macro economic entities for event correlation
N::MacroEntity {
    INDEX entity_id: String,
    name: String,
    description: String,
    INDEX frequency: String
}

// ============================================
// Research Pipeline - Vector Types
// ============================================

// Alpha factor hypotheses from the Idea Agent
V::ResearchHypothesis {
    INDEX hypothesis_id: String,
    title: String,
    economic_rationale: String,
    INDEX market_mechanism: String,
    INDEX target_regime: String,
    INDEX status: String,
    expected_ic: F64,
    expected_sharpe: F64,
    falsification_criteria: String,
    required_features: String,
    related_literature: String,
    originality_justification: String,
    trigger_type: String,
    implementation_hints: String,
    lessons_learned: String,
    realized_ic: F64,
    realized_sharpe: F64,
    factor_id: String,
    author: String,
    created_at: Date DEFAULT NOW,
    validated_at: String,
    INDEX environment: String
}

// Referenced academic papers
V::AcademicPaper {
    INDEX paper_id: String,
    title: String,
    authors: String,
    paper_abstract: String,
    url: String,
    publication_year: U32,
    citation_count: U32
}

// ============================================
// Thesis Memory - Vector Types
// ============================================

// Closed thesis outcomes for learning and retrieval
V::ThesisMemory {
    INDEX thesis_id: String,
    INDEX instrument_id: String,
    underlying_symbol: String,
    entry_thesis: String,
    INDEX outcome: String,
    pnl_percent: F64,
    holding_period_days: U32,
    lessons_learned: String,
    entry_regime: String,
    exit_regime: String,
    close_reason: String,
    entry_price: F64,
    exit_price: F64,
    INDEX environment: String,
    entry_date: Date DEFAULT NOW,
    closed_at: String
}

// ============================================
// Edge Types - Relationships
// ============================================

// Event influences on trading decisions
E::INFLUENCED_DECISION {
    From: ExternalEvent,
    To: TradeDecision,
    Properties: {
        influence_score: F64,
        influence_type: String
    }
}

// Document-company relationships
E::FILED_BY {
    From: FilingChunk,
    To: Company,
    Properties: {}
}

E::TRANSCRIPT_FOR {
    From: TranscriptChunk,
    To: Company,
    Properties: {}
}

E::MENTIONS_COMPANY {
    From: NewsItem,
    To: Company,
    Properties: {
        sentiment: F64
    }
}

// Event-macro relationships
E::RELATES_TO_MACRO {
    From: ExternalEvent,
    To: MacroEntity,
    Properties: {}
}

// Company-company relationships
E::RELATED_TO {
    From: Company,
    To: Company,
    Properties: {
        relationship_type: String
    }
}

E::DEPENDS_ON {
    From: Company,
    To: Company,
    Properties: {
        relationship_type: String,
        strength: F64
    }
}

// Decision lifecycle
E::HAS_EVENT {
    From: TradeDecision,
    To: TradeLifecycleEvent,
    Properties: {}
}

// Company-macro sensitivity
E::AFFECTED_BY {
    From: Company,
    To: MacroEntity,
    Properties: {
        sensitivity: F64
    }
}

// Thesis-decision linkage
E::THESIS_INCLUDES {
    From: ThesisMemory,
    To: TradeDecision,
    Properties: {}
}

// ============================================
// Indicator & Research Graph Edges
// ============================================

// Indicator-to-Indicator similarity edges
E::SIMILAR_TO {
    From: Indicator,
    To: Indicator,
    Properties: {
        similarity_score: F64,
        computed_at: String
    }
}

// Track which indicators influenced trading decisions
E::USED_IN_DECISION {
    From: Indicator,
    To: TradeDecision,
    Properties: {
        signal_value: F64,
        decision_weight: F64
    }
}

// Indicator derivation lineage
E::DERIVED_FROM {
    From: Indicator,
    To: Indicator,
    Properties: {
        derivation_type: String,
        derived_at: String
    }
}

// Hypothesis inspiration chain (to papers or other hypotheses)
E::INSPIRED_BY {
    From: ResearchHypothesis,
    To: ResearchHypothesis,
    Properties: {
        relevance: String,
        created_at: String
    }
}

// Paper inspiration for hypotheses
E::CITES_PAPER {
    From: ResearchHypothesis,
    To: AcademicPaper,
    Properties: {
        relevance: String,
        created_at: String
    }
}

// Track hypothesis iterations and improvements
E::IMPROVES_ON {
    From: ResearchHypothesis,
    To: ResearchHypothesis,
    Properties: {
        improvement_type: String,
        improvement_description: String,
        created_at: String
    }
}

// Link hypothesis to generated factor/indicator
E::GENERATED_FACTOR {
    From: ResearchHypothesis,
    To: Indicator,
    Properties: {
        validated_at: String,
        environment: String
    }
}
