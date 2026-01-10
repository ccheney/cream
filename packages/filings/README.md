# @cream/filings

SEC filings ingestion pipeline for HelixDB.

## Overview

Fetches SEC EDGAR filings (10-K, 10-Q, 8-K), parses with semantic extraction, chunks for RAG, and ingests into HelixDB.

## Pipeline

1. **Fetch** - SEC EDGAR API via `sec-edgar-toolkit`
2. **Parse** - HTML extraction with Cheerio
3. **Chunk** - Section-based chunking with overlap
4. **Ingest** - Store in HelixDB with embeddings
5. **Track** - Metadata in Turso

## Key Components

### FilingsIngestionService

```typescript
import { createFilingsIngestionService } from "@cream/filings";

const service = createFilingsIngestionService(dbClient);

const result = await service.syncFilings({
  symbols: ["AAPL", "MSFT"],
  filingTypes: ["10-K", "10-Q"],
  triggerSource: "dashboard",
  environment: "PAPER",
});
```

### EdgarClient

```typescript
import { EdgarClient } from "@cream/filings";

const client = new EdgarClient();
const filings = await client.getFilings({
  tickerOrCik: "AAPL",
  filingTypes: ["10-K"],
  limit: 5,
});
```

### Parsers

- `Form10KParser` - Business, risk factors, MD&A, financials
- `Form10QParser` - Quarterly sections
- `Form8KParser` - Item-based extraction

### Chunker

```typescript
import { chunkParsedFiling } from "@cream/filings";

const chunks = chunkParsedFiling(parsed);
// Chunks with section headers, 8000 char max, 200 char overlap
```

## Configuration

Uses HelixDB and Turso environment variables:
- `HELIX_URL` or `HELIX_HOST`/`HELIX_PORT`
- `TURSO_DATABASE_URL`

## Dependencies

- `sec-edgar-toolkit` - SEC EDGAR API
- `cheerio` - HTML parsing
- `@cream/helix` - HelixDB client
- `@cream/storage` - Turso repositories
