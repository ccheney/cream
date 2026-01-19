// Cream Trading System - HelixDB Queries
// Following HelixDB v2 patterns

// ============================================
// Vector Insertion Queries
// ============================================

#[model("gemini:gemini-embedding-001:RETRIEVAL_DOCUMENT")]
QUERY InsertTradeDecision(
    decision_id: String,
    cycle_id: String,
    instrument_id: String,
    underlying_symbol: String,
    regime_label: String,
    action: String,
    decision_json: String,
    rationale_text: String,
    snapshot_reference: String,
    realized_outcome: String,
    environment: String,
    closed_at: String
) =>
    decision <- AddV<TradeDecision>(
        Embed(rationale_text),
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
            realized_outcome: realized_outcome,
            environment: environment,
            closed_at: closed_at
        }
    )
    RETURN decision

#[model("gemini:gemini-embedding-001:RETRIEVAL_DOCUMENT")]
QUERY InsertExternalEvent(
    event_id: String,
    event_type: String,
    payload: String,
    text_summary: String,
    related_instrument_ids: String
) =>
    event <- AddV<ExternalEvent>(
        Embed(text_summary),
        {
            event_id: event_id,
            event_type: event_type,
            payload: payload,
            text_summary: text_summary,
            related_instrument_ids: related_instrument_ids
        }
    )
    RETURN event

#[model("gemini:gemini-embedding-001:RETRIEVAL_DOCUMENT")]
QUERY InsertFilingChunk(
    chunk_id: String,
    filing_id: String,
    company_symbol: String,
    filing_type: String,
    filing_date: String,
    chunk_text: String,
    chunk_index: U32
) =>
    chunk <- AddV<FilingChunk>(
        Embed(chunk_text),
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

#[model("gemini:gemini-embedding-001:RETRIEVAL_DOCUMENT")]
QUERY InsertTranscriptChunk(
    chunk_id: String,
    transcript_id: String,
    company_symbol: String,
    call_date: String,
    speaker: String,
    chunk_text: String,
    chunk_index: U32
) =>
    chunk <- AddV<TranscriptChunk>(
        Embed(chunk_text),
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

#[model("gemini:gemini-embedding-001:RETRIEVAL_DOCUMENT")]
QUERY InsertNewsItem(
    item_id: String,
    headline: String,
    body_text: String,
    source: String,
    related_symbols: String,
    sentiment_score: F64
) =>
    item <- AddV<NewsItem>(
        Embed(headline),
        {
            item_id: item_id,
            headline: headline,
            body_text: body_text,
            source: source,
            related_symbols: related_symbols,
            sentiment_score: sentiment_score
        }
    )
    RETURN item

#[model("gemini:gemini-embedding-001:RETRIEVAL_DOCUMENT")]
QUERY InsertThesisMemory(
    thesis_id: String,
    instrument_id: String,
    underlying_symbol: String,
    entry_thesis: String,
    outcome: String,
    pnl_percent: F64,
    holding_period_days: U32,
    lessons_learned: String,
    entry_regime: String,
    exit_regime: String,
    close_reason: String,
    entry_price: F64,
    exit_price: F64,
    environment: String,
    closed_at: String
) =>
    thesis <- AddV<ThesisMemory>(
        Embed(entry_thesis),
        {
            thesis_id: thesis_id,
            instrument_id: instrument_id,
            underlying_symbol: underlying_symbol,
            entry_thesis: entry_thesis,
            outcome: outcome,
            pnl_percent: pnl_percent,
            holding_period_days: holding_period_days,
            lessons_learned: lessons_learned,
            entry_regime: entry_regime,
            exit_regime: exit_regime,
            close_reason: close_reason,
            entry_price: entry_price,
            exit_price: exit_price,
            environment: environment,
            closed_at: closed_at
        }
    )
    RETURN thesis

#[model("gemini:gemini-embedding-001:RETRIEVAL_DOCUMENT")]
QUERY InsertIndicator(
    indicator_id: String,
    name: String,
    category: String,
    status: String,
    hypothesis: String,
    economic_rationale: String,
    embedding_text: String,
    generated_in_regime: String,
    code_hash: String,
    ast_signature: String,
    deflated_sharpe: F64,
    probability_of_overfit: F64,
    information_coefficient: F64,
    environment: String
) =>
    indicator <- AddV<Indicator>(
        Embed(embedding_text),
        {
            indicator_id: indicator_id,
            name: name,
            category: category,
            status: status,
            hypothesis: hypothesis,
            economic_rationale: economic_rationale,
            embedding_text: embedding_text,
            generated_in_regime: generated_in_regime,
            code_hash: code_hash,
            ast_signature: ast_signature,
            deflated_sharpe: deflated_sharpe,
            probability_of_overfit: probability_of_overfit,
            information_coefficient: information_coefficient,
            environment: environment
        }
    )
    RETURN indicator

#[model("gemini:gemini-embedding-001:RETRIEVAL_DOCUMENT")]
QUERY InsertResearchHypothesis(
    hypothesis_id: String,
    title: String,
    economic_rationale: String,
    market_mechanism: String,
    target_regime: String,
    status: String,
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
    validated_at: String,
    environment: String
) =>
    hypothesis <- AddV<ResearchHypothesis>(
        Embed(economic_rationale),
        {
            hypothesis_id: hypothesis_id,
            title: title,
            economic_rationale: economic_rationale,
            market_mechanism: market_mechanism,
            target_regime: target_regime,
            status: status,
            expected_ic: expected_ic,
            expected_sharpe: expected_sharpe,
            falsification_criteria: falsification_criteria,
            required_features: required_features,
            related_literature: related_literature,
            originality_justification: originality_justification,
            trigger_type: trigger_type,
            implementation_hints: implementation_hints,
            lessons_learned: lessons_learned,
            realized_ic: realized_ic,
            realized_sharpe: realized_sharpe,
            factor_id: factor_id,
            author: author,
            validated_at: validated_at,
            environment: environment
        }
    )
    RETURN hypothesis

#[model("gemini:gemini-embedding-001:RETRIEVAL_DOCUMENT")]
QUERY InsertAcademicPaper(
    paper_id: String,
    title: String,
    authors: String,
    paper_abstract: String,
    url: String,
    publication_year: U32,
    citation_count: U32
) =>
    paper <- AddV<AcademicPaper>(
        Embed(paper_abstract),
        {
            paper_id: paper_id,
            title: title,
            authors: authors,
            paper_abstract: paper_abstract,
            url: url,
            publication_year: publication_year,
            citation_count: citation_count
        }
    )
    RETURN paper

// ============================================
// Node Insertion Queries
// ============================================

#[model("gemini:gemini-embedding-001:RETRIEVAL_DOCUMENT")]
QUERY InsertLifecycleEvent(
    event_id: String,
    decision_id: String,
    event_type: String,
    price: F64,
    quantity: I64,
    environment: String
) =>
    event <- AddN<TradeLifecycleEvent>({
        event_id: event_id,
        decision_id: decision_id,
        event_type: event_type,
        price: price,
        quantity: quantity,
        environment: environment
    })
    RETURN event

#[model("gemini:gemini-embedding-001:RETRIEVAL_DOCUMENT")]
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

#[model("gemini:gemini-embedding-001:RETRIEVAL_DOCUMENT")]
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
// Vector Search Queries
// ============================================

#[model("gemini:gemini-embedding-001:RETRIEVAL_QUERY")]
QUERY SearchSimilarDecisions(query_text: String, limit: I64) =>
    results <- SearchV<TradeDecision>(Embed(query_text), limit)
    RETURN results

#[model("gemini:gemini-embedding-001:RETRIEVAL_QUERY")]
QUERY SearchDecisionsByInstrument(query_text: String, instrument_id: String, limit: I64) =>
    results <- SearchV<TradeDecision>(Embed(query_text), limit)
        ::WHERE(_::{instrument_id}::EQ(instrument_id))
    RETURN results

#[model("gemini:gemini-embedding-001:RETRIEVAL_QUERY")]
QUERY SearchFilings(query: String, limit: I64) =>
    results <- SearchV<FilingChunk>(Embed(query), limit)
    RETURN results

#[model("gemini:gemini-embedding-001:RETRIEVAL_QUERY")]
QUERY SearchFilingsByCompany(query: String, company_symbol: String, limit: I64) =>
    results <- SearchV<FilingChunk>(Embed(query), limit)
        ::WHERE(_::{company_symbol}::EQ(company_symbol))
    RETURN results

#[model("gemini:gemini-embedding-001:RETRIEVAL_QUERY")]
QUERY SearchTranscripts(query: String, limit: I64) =>
    results <- SearchV<TranscriptChunk>(Embed(query), limit)
    RETURN results

#[model("gemini:gemini-embedding-001:RETRIEVAL_QUERY")]
QUERY SearchTranscriptsByCompany(query: String, company_symbol: String, limit: I64) =>
    results <- SearchV<TranscriptChunk>(Embed(query), limit)
        ::WHERE(_::{company_symbol}::EQ(company_symbol))
    RETURN results

#[model("gemini:gemini-embedding-001:RETRIEVAL_QUERY")]
QUERY SearchNews(query: String, limit: I64) =>
    results <- SearchV<NewsItem>(Embed(query), limit)
    RETURN results

#[model("gemini:gemini-embedding-001:RETRIEVAL_QUERY")]
QUERY SearchExternalEvents(query: String, limit: I64) =>
    results <- SearchV<ExternalEvent>(Embed(query), limit)
    RETURN results

#[model("gemini:gemini-embedding-001:RETRIEVAL_QUERY")]
QUERY SearchExternalEventsByType(query: String, event_type: String, limit: I64) =>
    results <- SearchV<ExternalEvent>(Embed(query), limit)
        ::WHERE(_::{event_type}::EQ(event_type))
    RETURN results

#[model("gemini:gemini-embedding-001:RETRIEVAL_QUERY")]
QUERY SearchSimilarTheses(query_text: String, limit: I64) =>
    results <- SearchV<ThesisMemory>(Embed(query_text), limit)
    RETURN results

#[model("gemini:gemini-embedding-001:RETRIEVAL_QUERY")]
QUERY SearchThesesByOutcome(query_text: String, outcome: String, limit: I64) =>
    results <- SearchV<ThesisMemory>(Embed(query_text), limit)
        ::WHERE(_::{outcome}::EQ(outcome))
    RETURN results

// ============================================
// Graph Traversal Queries
// ============================================

QUERY GetTradeWithEvents(decision_id: String) =>
    decision <- V<TradeDecision>::WHERE(_::{decision_id}::EQ(decision_id))
    events <- decision::Out<HAS_EVENT>
    RETURN events

QUERY GetInfluencedDecisions(event_id: String) =>
    event <- V<ExternalEvent>::WHERE(_::{event_id}::EQ(event_id))
    decisions <- event::Out<INFLUENCED_DECISION>
    RETURN decisions

QUERY GetCompanyFilings(symbol: String) =>
    company <- N<Company>::WHERE(_::{symbol}::EQ(symbol))
    filings <- company::In<FILED_BY>
    RETURN filings

QUERY GetCompanyTranscripts(symbol: String) =>
    company <- N<Company>::WHERE(_::{symbol}::EQ(symbol))
    transcripts <- company::In<TRANSCRIPT_FOR>
    RETURN transcripts

QUERY GetCompanyNews(symbol: String) =>
    company <- N<Company>::WHERE(_::{symbol}::EQ(symbol))
    news <- company::In<MENTIONS_COMPANY>
    RETURN news

QUERY GetRelatedCompanies(symbol: String) =>
    company <- N<Company>::WHERE(_::{symbol}::EQ(symbol))
    related <- company::Out<RELATED_TO>
    RETURN related

QUERY GetCompanyDependencies(symbol: String) =>
    company <- N<Company>::WHERE(_::{symbol}::EQ(symbol))
    deps <- company::Out<DEPENDS_ON>
    RETURN deps

QUERY GetDependentCompanies(symbol: String) =>
    company <- N<Company>::WHERE(_::{symbol}::EQ(symbol))
    dependents <- company::In<DEPENDS_ON>
    RETURN dependents

QUERY GetCompaniesAffectedByMacro(entity_id: String) =>
    entity <- N<MacroEntity>::WHERE(_::{entity_id}::EQ(entity_id))
    companies <- entity::In<AFFECTED_BY>
    RETURN companies

QUERY GetMacroEvents(entity_id: String) =>
    entity <- N<MacroEntity>::WHERE(_::{entity_id}::EQ(entity_id))
    events <- entity::In<RELATES_TO_MACRO>
    RETURN events

QUERY GetThesisDecisions(thesis_id: String) =>
    thesis <- V<ThesisMemory>::WHERE(_::{thesis_id}::EQ(thesis_id))
    decisions <- thesis::Out<THESIS_INCLUDES>
    RETURN decisions

// ============================================
// Lookup Queries
// ============================================

QUERY GetDecisionById(decision_id: String) =>
    decision <- V<TradeDecision>::WHERE(_::{decision_id}::EQ(decision_id))
    RETURN decision

QUERY GetCompanyBySymbol(symbol: String) =>
    company <- N<Company>::WHERE(_::{symbol}::EQ(symbol))
    RETURN company

QUERY GetCompaniesBySector(sector: String) =>
    companies <- N<Company>::WHERE(_::{sector}::EQ(sector))
    RETURN companies

QUERY GetThesisById(thesis_id: String) =>
    thesis <- V<ThesisMemory>::WHERE(_::{thesis_id}::EQ(thesis_id))
    RETURN thesis

// ============================================
// Indicator Search Queries
// ============================================

#[model("gemini:gemini-embedding-001:RETRIEVAL_QUERY")]
QUERY SearchSimilarIndicators(query_text: String, limit: I64) =>
    results <- SearchV<Indicator>(Embed(query_text), limit)
    RETURN results

#[model("gemini:gemini-embedding-001:RETRIEVAL_QUERY")]
QUERY SearchIndicatorsByCategory(query_text: String, category: String, limit: I64) =>
    results <- SearchV<Indicator>(Embed(query_text), limit)
        ::WHERE(_::{category}::EQ(category))
    RETURN results

#[model("gemini:gemini-embedding-001:RETRIEVAL_QUERY")]
QUERY SearchIndicatorsByStatus(query_text: String, status: String, limit: I64) =>
    results <- SearchV<Indicator>(Embed(query_text), limit)
        ::WHERE(_::{status}::EQ(status))
    RETURN results

QUERY GetIndicatorById(indicator_id: String) =>
    indicator <- V<Indicator>::WHERE(_::{indicator_id}::EQ(indicator_id))
    RETURN indicator

QUERY GetIndicatorByCodeHash(code_hash: String) =>
    indicator <- V<Indicator>::WHERE(_::{code_hash}::EQ(code_hash))
    RETURN indicator

// ============================================
// Research Hypothesis Search Queries
// ============================================

#[model("gemini:gemini-embedding-001:RETRIEVAL_QUERY")]
QUERY SearchSimilarHypotheses(query_text: String, limit: I64) =>
    results <- SearchV<ResearchHypothesis>(Embed(query_text), limit)
    RETURN results

#[model("gemini:gemini-embedding-001:RETRIEVAL_QUERY")]
QUERY SearchHypothesesByStatus(query_text: String, status: String, limit: I64) =>
    results <- SearchV<ResearchHypothesis>(Embed(query_text), limit)
        ::WHERE(_::{status}::EQ(status))
    RETURN results

#[model("gemini:gemini-embedding-001:RETRIEVAL_QUERY")]
QUERY SearchHypothesesByMechanism(query_text: String, market_mechanism: String, limit: I64) =>
    results <- SearchV<ResearchHypothesis>(Embed(query_text), limit)
        ::WHERE(_::{market_mechanism}::EQ(market_mechanism))
    RETURN results

QUERY GetHypothesisById(hypothesis_id: String) =>
    hypothesis <- V<ResearchHypothesis>::WHERE(_::{hypothesis_id}::EQ(hypothesis_id))
    RETURN hypothesis

// ============================================
// Academic Paper Search Queries
// ============================================

#[model("gemini:gemini-embedding-001:RETRIEVAL_QUERY")]
QUERY SearchAcademicPapers(query_text: String, limit: I64) =>
    results <- SearchV<AcademicPaper>(Embed(query_text), limit)
    RETURN results

QUERY GetPaperById(paper_id: String) =>
    paper <- V<AcademicPaper>::WHERE(_::{paper_id}::EQ(paper_id))
    RETURN paper

// ============================================
// Indicator Graph Traversal Queries
// ============================================

QUERY GetSimilarIndicators(indicator_id: String) =>
    indicator <- V<Indicator>::WHERE(_::{indicator_id}::EQ(indicator_id))
    similar <- indicator::Out<SIMILAR_TO>
    RETURN similar

QUERY GetIndicatorsUsedInDecision(decision_id: String) =>
    decision <- V<TradeDecision>::WHERE(_::{decision_id}::EQ(decision_id))
    indicators <- decision::In<USED_IN_DECISION>
    RETURN indicators

QUERY GetDerivedIndicators(indicator_id: String) =>
    indicator <- V<Indicator>::WHERE(_::{indicator_id}::EQ(indicator_id))
    derived <- indicator::In<DERIVED_FROM>
    RETURN derived

QUERY GetSourceIndicator(indicator_id: String) =>
    indicator <- V<Indicator>::WHERE(_::{indicator_id}::EQ(indicator_id))
    source <- indicator::Out<DERIVED_FROM>
    RETURN source

// ============================================
// Hypothesis Graph Traversal Queries
// ============================================

QUERY GetHypothesisInspirations(hypothesis_id: String) =>
    hypothesis <- V<ResearchHypothesis>::WHERE(_::{hypothesis_id}::EQ(hypothesis_id))
    inspirations <- hypothesis::Out<INSPIRED_BY>
    RETURN inspirations

QUERY GetInspiredHypotheses(hypothesis_id: String) =>
    hypothesis <- V<ResearchHypothesis>::WHERE(_::{hypothesis_id}::EQ(hypothesis_id))
    inspired <- hypothesis::In<INSPIRED_BY>
    RETURN inspired

QUERY GetImprovedHypotheses(hypothesis_id: String) =>
    hypothesis <- V<ResearchHypothesis>::WHERE(_::{hypothesis_id}::EQ(hypothesis_id))
    improved <- hypothesis::In<IMPROVES_ON>
    RETURN improved

QUERY GetHypothesisIndicator(hypothesis_id: String) =>
    hypothesis <- V<ResearchHypothesis>::WHERE(_::{hypothesis_id}::EQ(hypothesis_id))
    indicator <- hypothesis::Out<GENERATED_FACTOR>
    RETURN indicator

QUERY GetIndicatorHypothesis(indicator_id: String) =>
    indicator <- V<Indicator>::WHERE(_::{indicator_id}::EQ(indicator_id))
    hypothesis <- indicator::In<GENERATED_FACTOR>
    RETURN hypothesis

QUERY GetHypothesisPapers(hypothesis_id: String) =>
    hypothesis <- V<ResearchHypothesis>::WHERE(_::{hypothesis_id}::EQ(hypothesis_id))
    papers <- hypothesis::Out<CITES_PAPER>
    RETURN papers

QUERY GetCitingHypotheses(paper_id: String) =>
    paper <- V<AcademicPaper>::WHERE(_::{paper_id}::EQ(paper_id))
    hypotheses <- paper::In<CITES_PAPER>
    RETURN hypotheses

// ============================================
// GraphRAG Unified Search Queries
// ============================================

// Unified cross-type vector search with graph traversal
// Returns filings, transcripts, news, events and their connected companies
#[model("gemini:gemini-embedding-001:RETRIEVAL_QUERY")]
QUERY SearchGraphContext(query: String, limit: I64) =>
    filing_chunks <- SearchV<FilingChunk>(Embed(query), limit)
    transcript_chunks <- SearchV<TranscriptChunk>(Embed(query), limit)
    news_items <- SearchV<NewsItem>(Embed(query), limit)
    external_events <- SearchV<ExternalEvent>(Embed(query), limit)
    filing_companies <- filing_chunks::Out<FILED_BY>
    transcript_companies <- transcript_chunks::Out<TRANSCRIPT_FOR>
    news_companies <- news_items::Out<MENTIONS_COMPANY>
    RETURN filing_chunks, transcript_chunks, news_items, external_events,
           filing_companies, transcript_companies, news_companies

// Filtered search with related company traversal
// First finds results for a specific company, then discovers related companies
#[model("gemini:gemini-embedding-001:RETRIEVAL_QUERY")]
QUERY SearchGraphContextByCompany(query: String, company_symbol: String, limit: I64) =>
    company <- N<Company>::WHERE(_::{symbol}::EQ(company_symbol))
    filing_chunks <- SearchV<FilingChunk>(Embed(query), limit)
        ::WHERE(_::{company_symbol}::EQ(company_symbol))
    transcript_chunks <- SearchV<TranscriptChunk>(Embed(query), limit)
        ::WHERE(_::{company_symbol}::EQ(company_symbol))
    news_items <- SearchV<NewsItem>(Embed(query), limit)
    news_companies <- news_items::Out<MENTIONS_COMPANY>
    related_companies <- company::Out<RELATED_TO>
    dependent_companies <- company::Out<DEPENDS_ON>
    RETURN filing_chunks, transcript_chunks, news_items, company,
           news_companies, related_companies, dependent_companies
