# @cream/helix-schema

TypeScript schema and utilities for HelixDB - the trading memory system.

## Overview

Defines the complete schema for HelixDB graph + vector database:

- **Node Types** - Trading decisions, events, documents
- **Edge Types** - Relationships between nodes
- **Retrieval** - GraphRAG, CBR, RRF fusion
- **Memory Management** - Retention, forgetting, pruning

## Node Types

### Trading Memory
- `TradeDecision` - Decisions with rationale (embedded)
- `TradeLifecycleEvent` - Fills, adjustments, closures
- `ThesisMemory` - Post-hoc trade analysis

### Documents
- `FilingChunk` - SEC filing chunks
- `TranscriptChunk` - Earnings call chunks
- `NewsItem` - News articles
- `ExternalEvent` - Market events

### Entities
- `Company` - Company nodes
- `MacroEntity` - Macro indicators
- `Indicator` - Technical indicators
- `ResearchHypothesis` - Alpha factor hypotheses

## Edge Types

- `INFLUENCED_DECISION` - Event → decision
- `DEPENDS_ON` - Supply chain relationships
- `MENTIONED_IN` - Document references
- `SIMILAR_TO` - Indicator relationships

## Retrieval

### CBR (Case-Based Reasoning)

```typescript
import { retrieveSimilarCases } from "@cream/helix-schema";

const result = await retrieveSimilarCases(client, embeddingClient, {
  instrumentId: "AAPL",
  regimeLabel: "BULL_TREND",
  indicators: { rsi: 65 },
});
```

### RRF (Reciprocal Rank Fusion)

Combines vector search + graph traversal (k=60 tuning).

## Memory Management

### Forgetting (Ebbinghaus Curve)

```typescript
import { calculateRetentionScore, getForgettingDecision } from "@cream/helix-schema";

const retention = calculateRetentionScore(node);
const decision = getForgettingDecision(node);  // RETAIN | SUMMARIZE | FORGET
```

### Compliance

- 6-year retention for LIVE trades (SEC Rule 17a-4)
- Immutable audit trail
- Version history

## Configuration

Uses `config.hx.json`:
- Embedding model (Gemini, 3072 dimensions)
- HNSW index parameters
- Retrieval settings
- Tuning profiles

## Dependencies

- `@cream/domain` - Trading domain types
- `@cream/config` - Configuration service
- `@google/genai` - Gemini embeddings
