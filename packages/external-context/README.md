# @cream/external-context

External context extraction pipeline for the Cream trading system.

## Overview

Processes news, transcripts, and macro data into structured trading signals:

```
Raw Feed → Parse → Extract (Claude) → Score → Link → ExtractedEvent
```

## Pipeline Stages

1. **Parse** - Normalize raw feeds (FMP news, transcripts, macro)
2. **Extract** - Claude tool use for structured extraction
3. **Score** - Sentiment (-1 to 1), importance (0 to 1), surprise (-1 to 1)
4. **Link** - Map entities to ticker symbols
5. **Store** - Create ExtractedEvent for HelixDB

## Key Components

### ExtractionPipeline (`src/pipeline.ts`)

```typescript
import { createExtractionPipeline } from "@cream/external-context";

const pipeline = createExtractionPipeline({
  targetSymbols: ["AAPL", "MSFT"],
  dryRun: false,
});

const result = await pipeline.processNews(fmpArticles);
console.log(result.events);  // ExtractedEvent[]
```

### Entity Linking (`src/linking/`)

```typescript
import { createEntityLinker } from "@cream/external-context";

const linker = createEntityLinker({ fmpApiKey: process.env.FMP_KEY });
const links = await linker.linkEntities([
  { name: "Apple Inc", type: "company" },
]);
// [{ entityName: "Apple Inc", ticker: "AAPL", confidence: 0.95 }]
```

### Scoring

```typescript
import { computeSentimentScore, classifyImportance } from "@cream/external-context";

const sentiment = computeSentimentScore("bullish", 0.95);  // 0.76
const importance = classifyImportance(0.85);  // "high"
```

## Configuration

```bash
ANTHROPIC_API_KEY=...  # Claude for extraction
FMP_KEY=...            # Entity linking
```

## Scoring Details

**Sentiment**: bullish (+0.8), bearish (-0.8), neutral (0.0), confidence-weighted

**Importance Factors**:
- Source credibility (30%)
- Recency - 24h half-life (30%)
- Entity relevance (20%)
- LLM rating (20%)

**Surprise**: `(actual - expected) / |expected|`

## Dependencies

- `@anthropic-ai/sdk` - Claude extraction
- `zod` - Schema validation
