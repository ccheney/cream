# @cream/filings

SEC EDGAR filings ingestion pipeline for Cream's fundamental analysis. Fetches, parses, and chunks 10-K, 10-Q, and 8-K filings into HelixDB for RAG-based retrieval during trading decisions.

## Architecture

```mermaid
flowchart TB
    subgraph Sources["SEC EDGAR"]
        EDGAR[(SEC EDGAR API)]
    end

    subgraph Ingestion["Filings Package"]
        Client[EdgarClient]
        Parser[FilingParser]
        Chunker[Chunker]
        Ingest[HelixDB Ingest]
    end

    subgraph Storage["Persistence"]
        PG[(PostgreSQL)]
        Helix[(HelixDB)]
    end

    subgraph Consumers["Trading System"]
        Agents[Trading Agents]
        Context[External Context]
    end

    EDGAR -->|"fetch HTML"| Client
    Client -->|"Filing metadata"| Parser
    Parser -->|"ParsedFiling"| Chunker
    Chunker -->|"FilingChunk[]"| Ingest
    Ingest -->|"embeddings"| Helix
    Ingest -->|"tracking"| PG
    Helix -->|"SearchFilings"| Agents
    Helix -->|"vector search"| Context
```

## Filing Types

| Type | Purpose | Frequency | Key Sections |
|------|---------|-----------|--------------|
| **10-K** | Annual report | Yearly | Business, Risk Factors, MD&A, Financial Statements |
| **10-Q** | Quarterly report | Q1, Q2, Q3 | Financial Statements, MD&A, Risk Factor updates |
| **8-K** | Current report | Event-driven | Material events (earnings, M&A, leadership changes) |

## Ingestion Pipeline

```mermaid
sequenceDiagram
    autonumber
    participant Worker
    participant Service as FilingsIngestionService
    participant EDGAR as SEC EDGAR
    participant Parser as FilingParser
    participant Helix as HelixDB
    participant PG as PostgreSQL

    Worker->>Service: syncFilings(config)
    Service->>PG: Create sync run record

    loop For each symbol
        Service->>EDGAR: getFilings(symbol)
        EDGAR-->>Service: Filing[]

        loop For each filing
            Service->>PG: Check if exists
            alt Not ingested
                Service->>EDGAR: getFilingHtml(filing)
                EDGAR-->>Service: HTML content
                Service->>Parser: parseFiling(filing, html)
                Parser-->>Service: ParsedFiling
                Service->>Service: chunkParsedFiling(parsed)
                Service->>Helix: batchIngestChunks(chunks)
                Helix-->>Service: BatchIngestionResult
                Service->>PG: Mark filing complete
            end
        end
    end

    Service->>PG: Complete sync run
    Service-->>Worker: FilingSyncResult
```

## Form Parsing

### Section Extraction

Each filing type has specialized parsers that extract relevant sections:

```mermaid
classDiagram
    class FilingParser {
        +extractText() string
        +extractSections(patterns) Record
        +extractTables() Table[]
        +parse() ParsedFiling
    }

    class Form10KParser {
        +extractSections() Record
    }

    class Form10QParser {
        +extractSections() Record
    }

    class Form8KParser {
        +extractItems() Form8KItem[]
        +extractSections() Record
    }

    FilingParser <|-- Form10KParser
    FilingParser <|-- Form10QParser
    FilingParser <|-- Form8KParser
```

### 10-K Sections

| Section Key | Pattern | Content |
|-------------|---------|---------|
| `business` | Item 1 | Company description, products, markets |
| `risk_factors` | Item 1A | Material risks to the business |
| `properties` | Item 2 | Physical assets |
| `legal_proceedings` | Item 3 | Ongoing litigation |
| `mda` | Item 7 | Management's Discussion and Analysis |
| `financial_statements` | Item 8 | Audited financials |
| `quantitative_disclosures` | Item 7A | Market risk disclosures |
| `controls_procedures` | Item 9A | Internal controls |

### 10-Q Sections

| Section Key | Pattern | Content |
|-------------|---------|---------|
| `financial_statements` | Part I, Item 1 | Unaudited quarterly financials |
| `mda` | Item 2 | Quarterly MD&A |
| `quantitative_disclosures` | Item 3 | Quantitative/qualitative market risk |
| `controls_procedures` | Item 4 | Control changes |
| `legal_proceedings` | Part II, Item 1 | Legal updates |
| `risk_factors` | Item 1A | Risk factor updates |

### 8-K Items

8-K filings report specific material events. The parser extracts items by number:

| Section | Items | Events |
|---------|-------|--------|
| 1 | 1.01-1.04 | Material agreements, bankruptcy |
| 2 | 2.01-2.06 | Acquisitions, earnings (2.02), impairments |
| 3 | 3.01-3.03 | Delisting, unregistered sales |
| 4 | 4.01-4.02 | Accountant changes, restatements |
| 5 | 5.01-5.08 | Control changes, officer departures (5.02), bylaws |
| 7 | 7.01 | Regulation FD disclosures |
| 8 | 8.01 | Other material events |
| 9 | 9.01 | Exhibits |

## Chunking Strategy

Filings are split into overlapping chunks for RAG retrieval:

```mermaid
flowchart LR
    subgraph Input
        Section["Section Text<br/>(up to 50k chars)"]
    end

    subgraph Chunking
        Split["splitTextWithOverlap"]
        Para["Paragraph boundaries"]
        Sent["Sentence boundaries<br/>(for oversized paras)"]
    end

    subgraph Output
        C1["Chunk 1<br/>(max 8k chars)"]
        C2["Chunk 2<br/>(200 char overlap)"]
        C3["Chunk N"]
    end

    Section --> Split
    Split --> Para
    Para --> Sent
    Sent --> C1
    Sent --> C2
    Sent --> C3
```

**Configuration:**
- Max chunk size: 8,000 characters
- Overlap: 200 characters (context preservation)
- Min section length: 100 characters (skip tiny sections)

**Chunk Format:**
```
## Business Description (Part 1 of 3)

[Section content with overlap from previous chunk...]
```

## HelixDB Integration

Filing chunks are stored as `FilingChunk` nodes with vector embeddings:

```mermaid
erDiagram
    FilingChunk {
        string chunk_id PK
        string filing_id FK
        string company_symbol FK
        string filing_type
        string filing_date
        string chunk_text
        int chunk_index
        vector embedding
    }

    Company {
        string symbol PK
        string name
        string sector
    }

    FilingChunk }o--|| Company : "FILED_BY"
```

**Queries:**
- `InsertFilingChunk` - Ingest with auto-embedding via `Embed(chunk_text)`
- `SearchFilings(query, limit)` - Vector search across all filings
- `SearchFilingsByCompany(query, symbol, limit)` - Filtered by company
- `SearchGraphContext(query, limit)` - Cross-document search with company relationships

## Usage

### Sync Filings for Universe

```typescript
import { createFilingsIngestionService } from "@cream/filings";
import { createDatabase } from "@cream/storage";

const db = createDatabase();
const service = createFilingsIngestionService(db);

const result = await service.syncFilings({
  symbols: ["AAPL", "MSFT", "GOOGL"],
  filingTypes: ["10-K", "10-Q"],
  limitPerSymbol: 5,
  triggerSource: "scheduled",
  environment: "PAPER",
});

console.log(`Ingested ${result.filingsIngested} filings, ${result.chunksCreated} chunks`);
```

### Process Single Filing

```typescript
const service = createFilingsIngestionService(db);
const processed = await service.processFiling("AAPL", "0000320193-24-000081");

if (processed) {
  console.log(`Parsed ${Object.keys(processed.filing.sections).length} sections`);
  console.log(`Created ${processed.chunks.length} chunks`);
}
```

### Direct Parser Usage

```typescript
import { EdgarClient, parseFiling, chunkParsedFiling } from "@cream/filings";

const client = new EdgarClient();
const filings = await client.getFilings({
  tickerOrCik: "NVDA",
  filingTypes: ["8-K"],
  limit: 10,
});

for (const filing of filings) {
  const html = await client.getFilingHtml(filing);
  const parsed = parseFiling(filing, html);
  const chunks = chunkParsedFiling(parsed);

  // Use chunks for custom ingestion
}
```

## Integration with Cream

```mermaid
flowchart TB
    subgraph Scheduler["Worker (Hourly)"]
        Cron[Scheduled Job]
    end

    subgraph Filings["@cream/filings"]
        Sync[FilingsSyncService]
    end

    subgraph Storage["@cream/storage"]
        FilingsRepo[FilingsRepository]
        SyncRunsRepo[FilingSyncRunsRepository]
    end

    subgraph Memory["@cream/helix"]
        Search[SearchFilings]
        Context[SearchGraphContext]
    end

    subgraph Agents["Trading Agents"]
        Fundamental[Fundamental Analysis]
        Risk[Risk Assessment]
    end

    Cron -->|"syncFilings()"| Sync
    Sync --> FilingsRepo
    Sync --> SyncRunsRepo
    Sync --> Memory

    Search -->|"MD&A, Risk Factors"| Fundamental
    Context -->|"8-K events"| Risk
```

**Data Flow:**
1. **Worker** triggers filing sync on schedule or manual request
2. **FilingsIngestionService** fetches new filings from SEC EDGAR
3. **Parsers** extract sections based on filing type
4. **Chunker** splits content for optimal embedding
5. **HelixDB** stores chunks with vector embeddings
6. **Trading agents** query relevant filings during OODA loops

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPERATOR_EMAIL` | Yes | Contact email for SEC API User-Agent |
| `HELIX_HOST` | Yes | HelixDB server host |
| `HELIX_PORT` | Yes | HelixDB server port |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `LOG_LEVEL` | No | `debug` or `info` (default) |

## Dependencies

| Package | Purpose |
|---------|---------|
| `sec-edgar-toolkit` | SEC EDGAR API client |
| `cheerio` | HTML parsing |
| `@cream/helix` | HelixDB client |
| `@cream/storage` | PostgreSQL repositories |
| `@cream/logger` | Structured logging |
| `zod` | Schema validation |
