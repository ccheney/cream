// Cream Trading System - HelixDB Query Definitions
// All HelixQL query operations for the trading memory system
//
// Queries cover:
// - Node insertion with embeddings
// - Vector similarity search with filters
// - Graph traversal operations
// - Edge creation for relationships
//
// @see schema.hx for node and edge type definitions
// @see docs/plans/04-memory-helixdb.md for full specification

// ============================================
// Trading Memory Insertion Queries
// ============================================

// Insert a new TradeDecision with embedded rationale
QUERY InsertTradeDecision(
    decision_id: String,
    cycle_id: String,
    instrument_id: String,
    underlying_symbol: String?,
    regime_label: String,
    action: String,
    decision_json: String,
    rationale_text: String,
    snapshot_reference: String,
    created_at: String,
    environment: String
) =>
    decision <- AddV<TradeDecision>(
        Embed(rationale_text, "gemini:gemini-embedding-001"),
        {
            decision_id: decision_id,
            cycle_id: cycle_id,
            instrument_id: instrument_id,
            underlying_symbol: underlying_symbol,
            regime_label: regime_label,
            action: action,
            decision_json: decision_json,
            rationale_text: rationale_text,
            snapshot_reference: snapshot_reference,
            created_at: created_at,
            environment: environment
        }
    )
    RETURN decision


// Insert a TradeLifecycleEvent and link to parent decision
QUERY InsertLifecycleEvent(
    event_id: String,
    decision_id: String,
    event_type: String,
    timestamp: String,
    price: F64,
    quantity: I64,
    environment: String
) =>
    event <- AddN<TradeLifecycleEvent>({
        event_id: event_id,
        decision_id: decision_id,
        event_type: event_type,
        timestamp: timestamp,
        price: price,
        quantity: quantity,
        environment: environment
    })
    // Link to parent decision
    decision <- N<TradeDecision>::WHERE(_::{decision_id}::EQ(decision_id))
    AddE<HAS_EVENT>::From(decision)::To(event)
    RETURN event


// ============================================
// External Event Insertion Queries
// ============================================

// Insert ExternalEvent with optional embedding
QUERY InsertExternalEvent(
    event_id: String,
    event_type: String,
    event_time: String,
    payload: String,
    text_summary: String?,
    related_instrument_ids: String
) =>
    event <- AddV<ExternalEvent>(
        Embed(text_summary, "gemini:gemini-embedding-001"),
        {
            event_id: event_id,
            event_type: event_type,
            event_time: event_time,
            payload: payload,
            text_summary: text_summary,
            related_instrument_ids: related_instrument_ids
        }
    )
    RETURN event


// ============================================
// Document Node Insertion Queries
// ============================================

// Insert FilingChunk with embedded text
QUERY InsertFilingChunk(
    chunk_id: String,
    filing_id: String,
    company_symbol: String,
    filing_type: String,
    filing_date: String,
    chunk_text: String,
    chunk_index: I64
) =>
    chunk <- AddV<FilingChunk>(
        Embed(chunk_text, "gemini:gemini-embedding-001"),
        {
            chunk_id: chunk_id,
            filing_id: filing_id,
            company_symbol: company_symbol,
            filing_type: filing_type,
            filing_date: filing_date,
            chunk_text: chunk_text,
            chunk_index: chunk_index
        }
    )
    RETURN chunk


// Insert TranscriptChunk with embedded text
QUERY InsertTranscriptChunk(
    chunk_id: String,
    transcript_id: String,
    company_symbol: String,
    call_date: String,
    speaker: String,
    chunk_text: String,
    chunk_index: I64
) =>
    chunk <- AddV<TranscriptChunk>(
        Embed(chunk_text, "gemini:gemini-embedding-001"),
        {
            chunk_id: chunk_id,
            transcript_id: transcript_id,
            company_symbol: company_symbol,
            call_date: call_date,
            speaker: speaker,
            chunk_text: chunk_text,
            chunk_index: chunk_index
        }
    )
    RETURN chunk


// Insert NewsItem with headline + body embeddings
QUERY InsertNewsItem(
    item_id: String,
    headline: String,
    body_text: String,
    published_at: String,
    source: String,
    related_symbols: String,
    sentiment_score: F64
) =>
    // Concatenate headline and body for embedding
    combined_text <- headline + "\n\n" + body_text
    item <- AddV<NewsItem>(
        Embed(combined_text, "gemini:gemini-embedding-001"),
        {
            item_id: item_id,
            headline: headline,
            body_text: body_text,
            published_at: published_at,
            source: source,
            related_symbols: related_symbols,
            sentiment_score: sentiment_score
        }
    )
    RETURN item


// ============================================
// Domain Knowledge Insertion Queries
// ============================================

// Insert Company node (no embedding)
QUERY InsertCompany(
    symbol: String,
    name: String,
    sector: String,
    industry: String,
    market_cap_bucket: String
) =>
    company <- AddN<Company>({
        symbol: symbol,
        name: name,
        sector: sector,
        industry: industry,
        market_cap_bucket: market_cap_bucket
    })
    RETURN company


// Insert MacroEntity node (no embedding)
QUERY InsertMacroEntity(
    entity_id: String,
    name: String,
    description: String,
    frequency: String
) =>
    entity <- AddN<MacroEntity>({
        entity_id: entity_id,
        name: name,
        description: description,
        frequency: frequency
    })
    RETURN entity


// ============================================
// Vector Similarity Search Queries
// ============================================

// Search for similar past decisions by rationale
QUERY SearchSimilarDecisions(
    query_text: String,
    instrument_id: String?,
    regime_label: String?,
    limit: I64
) =>
    results <- SearchV<TradeDecision>(Embed(query_text, "gemini:gemini-embedding-001"), limit)
        ::WHERE(
            (_::{instrument_id}::EQ(instrument_id) OR instrument_id IS NULL) AND
            (_::{regime_label}::EQ(regime_label) OR regime_label IS NULL)
        )
    RETURN results::{
        decision_id: decision_id,
        instrument_id: instrument_id,
        regime_label: regime_label,
        action: action,
        rationale_text: rationale_text,
        environment: environment,
        similarity_score: _::DISTANCE
    }


// Search filing chunks for a company
QUERY SearchFilings(
    query: String,
    company_symbol: String?,
    limit: I64
) =>
    results <- SearchV<FilingChunk>(Embed(query, "gemini:gemini-embedding-001"), limit)
        ::WHERE(_::{company_symbol}::EQ(company_symbol) OR company_symbol IS NULL)
    RETURN results::{
        chunk_id: chunk_id,
        filing_id: filing_id,
        company_symbol: company_symbol,
        filing_type: filing_type,
        chunk_text: chunk_text,
        similarity_score: _::DISTANCE
    }


// Search transcript chunks for a company
QUERY SearchTranscripts(
    query: String,
    company_symbol: String?,
    limit: I64
) =>
    results <- SearchV<TranscriptChunk>(Embed(query, "gemini:gemini-embedding-001"), limit)
        ::WHERE(_::{company_symbol}::EQ(company_symbol) OR company_symbol IS NULL)
    RETURN results::{
        chunk_id: chunk_id,
        transcript_id: transcript_id,
        company_symbol: company_symbol,
        speaker: speaker,
        chunk_text: chunk_text,
        similarity_score: _::DISTANCE
    }


// Search news items
QUERY SearchNews(
    query: String,
    limit: I64
) =>
    results <- SearchV<NewsItem>(Embed(query, "gemini:gemini-embedding-001"), limit)
    RETURN results::{
        item_id: item_id,
        headline: headline,
        body_text: body_text,
        source: source,
        sentiment_score: sentiment_score,
        similarity_score: _::DISTANCE
    }


// Search external events
QUERY SearchExternalEvents(
    query: String,
    event_type: String?,
    limit: I64
) =>
    results <- SearchV<ExternalEvent>(Embed(query, "gemini:gemini-embedding-001"), limit)
        ::WHERE(_::{event_type}::EQ(event_type) OR event_type IS NULL)
    RETURN results::{
        event_id: event_id,
        event_type: event_type,
        event_time: event_time,
        text_summary: text_summary,
        similarity_score: _::DISTANCE
    }


// ============================================
// Graph Traversal Queries
// ============================================

// Get trade decision with all lifecycle events
QUERY GetTradeWithEvents(decision_id: String) =>
    decision <- N<TradeDecision>::WHERE(_::{decision_id}::EQ(decision_id))
    events <- decision::Out<HAS_EVENT>
    RETURN {
        decision: decision,
        events: events
    }


// Get decisions influenced by an external event
// Filters by minimum influence score (default threshold: 0.6)
QUERY GetInfluencedDecisions(event_id: String, min_confidence: F64?) =>
    event <- N<ExternalEvent>::WHERE(_::{event_id}::EQ(event_id))
    influenced <- event::Out<INFLUENCED_DECISION>
        ::WHERE(_::EDGE::{influence_score} >= (min_confidence OR 0.6))
    RETURN influenced::{
        decision: _,
        influence_score: _::EDGE::{influence_score},
        influence_type: _::EDGE::{influence_type}
    }


// Get company with all related filings
QUERY GetCompanyFilings(symbol: String) =>
    company <- N<Company>::WHERE(_::{symbol}::EQ(symbol))
    filings <- company::In<FILED_BY>
    RETURN {
        company: company,
        filings: filings
    }


// Get company with all transcripts
QUERY GetCompanyTranscripts(symbol: String) =>
    company <- N<Company>::WHERE(_::{symbol}::EQ(symbol))
    transcripts <- company::In<TRANSCRIPT_FOR>
    RETURN {
        company: company,
        transcripts: transcripts
    }


// Get company with all news mentions
QUERY GetCompanyNews(symbol: String) =>
    company <- N<Company>::WHERE(_::{symbol}::EQ(symbol))
    news <- company::In<MENTIONS_COMPANY>
    RETURN news::{
        item: _,
        sentiment: _::EDGE::{sentiment}
    }


// Get related companies (multi-hop)
QUERY GetRelatedCompanies(symbol: String, max_depth: I64) =>
    company <- N<Company>::WHERE(_::{symbol}::EQ(symbol))
    related <- company::Out<RELATED_TO>{1..max_depth}
    RETURN related::{
        company: _,
        relationship_type: _::EDGE::{relationship_type}
    }


// Get company dependency chain (supply chain, customers, partners)
// Traverses DEPENDS_ON edges with strength filtering
// max_depth defaults to 2 (optimal for trading context)
// min_strength defaults to 0.3 to filter weak dependencies
QUERY GetCompanyDependencyChain(
    symbol: String,
    max_depth: I64?,
    min_strength: F64?
) =>
    company <- N<Company>::WHERE(_::{symbol}::EQ(symbol))
    dependencies <- company::Out<DEPENDS_ON>{1..(max_depth OR 2)}
        ::WHERE(_::EDGE::{strength} >= (min_strength OR 0.3))
    RETURN dependencies::{
        company: _,
        relationship_type: _::EDGE::{relationship_type},
        strength: _::EDGE::{strength},
        depth: _::DEPTH
    }


// Get companies that depend on a given company (reverse dependency lookup)
QUERY GetDependentCompanies(symbol: String, min_strength: F64?) =>
    company <- N<Company>::WHERE(_::{symbol}::EQ(symbol))
    dependents <- company::In<DEPENDS_ON>
        ::WHERE(_::EDGE::{strength} >= (min_strength OR 0.3))
    RETURN dependents::{
        company: _,
        relationship_type: _::EDGE::{relationship_type},
        strength: _::EDGE::{strength}
    }


// Get companies affected by a macro entity
QUERY GetCompaniesAffectedByMacro(entity_id: String, min_sensitivity: F64?) =>
    entity <- N<MacroEntity>::WHERE(_::{entity_id}::EQ(entity_id))
    affected <- entity::In<AFFECTED_BY>
        ::WHERE(_::EDGE::{sensitivity} >= (min_sensitivity OR 0.5))
    RETURN affected::{
        company: _,
        sensitivity: _::EDGE::{sensitivity}
    }


// Get events related to a macro entity
QUERY GetMacroEvents(entity_id: String) =>
    entity <- N<MacroEntity>::WHERE(_::{entity_id}::EQ(entity_id))
    events <- entity::In<RELATES_TO_MACRO>
    RETURN events


// ============================================
// Edge Creation Queries
// ============================================

// Link external event to decision with influence data
QUERY CreateInfluencedDecisionEdge(
    event_id: String,
    decision_id: String,
    influence_score: F64,
    influence_type: String
) =>
    event <- N<ExternalEvent>::WHERE(_::{event_id}::EQ(event_id))
    decision <- N<TradeDecision>::WHERE(_::{decision_id}::EQ(decision_id))
    edge <- AddE<INFLUENCED_DECISION>::From(event)::To(decision)::{
        influence_score: influence_score,
        influence_type: influence_type
    }
    RETURN edge


// Link filing chunk to company
QUERY CreateFiledByEdge(chunk_id: String, company_symbol: String) =>
    chunk <- N<FilingChunk>::WHERE(_::{chunk_id}::EQ(chunk_id))
    company <- N<Company>::WHERE(_::{symbol}::EQ(company_symbol))
    edge <- AddE<FILED_BY>::From(chunk)::To(company)
    RETURN edge


// Link transcript chunk to company
QUERY CreateTranscriptForEdge(chunk_id: String, company_symbol: String) =>
    chunk <- N<TranscriptChunk>::WHERE(_::{chunk_id}::EQ(chunk_id))
    company <- N<Company>::WHERE(_::{symbol}::EQ(company_symbol))
    edge <- AddE<TRANSCRIPT_FOR>::From(chunk)::To(company)
    RETURN edge


// Link news item to company with sentiment
QUERY CreateMentionsCompanyEdge(
    item_id: String,
    company_symbol: String,
    sentiment: F64?
) =>
    news <- N<NewsItem>::WHERE(_::{item_id}::EQ(item_id))
    company <- N<Company>::WHERE(_::{symbol}::EQ(company_symbol))
    edge <- AddE<MENTIONS_COMPANY>::From(news)::To(company)::{
        sentiment: sentiment
    }
    RETURN edge


// Link external event to macro entity
QUERY CreateRelatesToMacroEdge(event_id: String, entity_id: String) =>
    event <- N<ExternalEvent>::WHERE(_::{event_id}::EQ(event_id))
    entity <- N<MacroEntity>::WHERE(_::{entity_id}::EQ(entity_id))
    edge <- AddE<RELATES_TO_MACRO>::From(event)::To(entity)
    RETURN edge


// Link companies with relationship type
QUERY CreateRelatedToEdge(
    source_symbol: String,
    target_symbol: String,
    relationship_type: String
) =>
    source <- N<Company>::WHERE(_::{symbol}::EQ(source_symbol))
    target <- N<Company>::WHERE(_::{symbol}::EQ(target_symbol))
    edge <- AddE<RELATED_TO>::From(source)::To(target)::{
        relationship_type: relationship_type
    }
    RETURN edge


// Link company to another company it depends on (supply chain)
QUERY CreateDependsOnEdge(
    source_symbol: String,
    target_symbol: String,
    relationship_type: String,
    strength: F64
) =>
    source <- N<Company>::WHERE(_::{symbol}::EQ(source_symbol))
    target <- N<Company>::WHERE(_::{symbol}::EQ(target_symbol))
    edge <- AddE<DEPENDS_ON>::From(source)::To(target)::{
        relationship_type: relationship_type,
        strength: strength
    }
    RETURN edge


// Link company to macro entity it's affected by
QUERY CreateAffectedByEdge(
    company_symbol: String,
    entity_id: String,
    sensitivity: F64
) =>
    company <- N<Company>::WHERE(_::{symbol}::EQ(company_symbol))
    entity <- N<MacroEntity>::WHERE(_::{entity_id}::EQ(entity_id))
    edge <- AddE<AFFECTED_BY>::From(company)::To(entity)::{
        sensitivity: sensitivity
    }
    RETURN edge


// Link company to document with mention metadata
QUERY CreateMentionedInEdge(
    company_symbol: String,
    document_id: String,
    document_type: String,
    mention_type: String
) =>
    company <- N<Company>::WHERE(_::{symbol}::EQ(company_symbol))
    edge <- AddE<MENTIONED_IN>::From(company)::To(document_id)::{
        document_type: document_type,
        mention_type: mention_type
    }
    RETURN edge


// ============================================
// Lookup Queries
// ============================================

// Get decision by ID
QUERY GetDecisionById(decision_id: String) =>
    decision <- N<TradeDecision>::WHERE(_::{decision_id}::EQ(decision_id))
    RETURN decision


// Get company by symbol
QUERY GetCompanyBySymbol(symbol: String) =>
    company <- N<Company>::WHERE(_::{symbol}::EQ(symbol))
    RETURN company


// Get decisions by instrument and environment
QUERY GetDecisionsByInstrument(instrument_id: String, environment: String) =>
    decisions <- N<TradeDecision>
        ::WHERE(_::{instrument_id}::EQ(instrument_id) AND _::{environment}::EQ(environment))
    RETURN decisions


// Get decisions by regime
QUERY GetDecisionsByRegime(regime_label: String, environment: String) =>
    decisions <- N<TradeDecision>
        ::WHERE(_::{regime_label}::EQ(regime_label) AND _::{environment}::EQ(environment))
    RETURN decisions


// Get recent events by type
QUERY GetRecentEventsByType(event_type: String, limit: I64) =>
    events <- N<ExternalEvent>
        ::WHERE(_::{event_type}::EQ(event_type))
        ::ORDER_BY(_::{event_time} DESC)
        ::RANGE(0, limit)
    RETURN events


// ============================================
// Aggregate Queries
// ============================================

// Count decisions by action type for an instrument
QUERY CountDecisionsByAction(instrument_id: String, environment: String) =>
    decisions <- N<TradeDecision>
        ::WHERE(_::{instrument_id}::EQ(instrument_id) AND _::{environment}::EQ(environment))
        ::GROUP_BY(_::{action})
    RETURN decisions::{
        action: _::{action},
        count: _::COUNT
    }


// Get all companies in a sector
QUERY GetCompaniesBySector(sector: String) =>
    companies <- N<Company>::WHERE(_::{sector}::EQ(sector))
    RETURN companies


// ============================================
// Trade Decision Update Queries
// ============================================

// Update a trade decision with realized outcome
// Called after a trade is closed to record P&L and performance metrics
QUERY UpdateDecisionOutcome(
    decision_id: String,
    realized_outcome: String,
    closed_at: String
) =>
    decision <- N<TradeDecision>::WHERE(_::{decision_id}::EQ(decision_id))
    decision::UPDATE({
        realized_outcome: realized_outcome,
        closed_at: closed_at
    })
    RETURN decision
