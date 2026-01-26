# Cream Architecture

> Agentic trading system for US equities and options. Combines LLM-driven reasoning with deterministic Rust execution, running hourly OODA loops (Observe → Orient → Decide → Act) with an 8-agent consensus network.

---

## System Overview

```mermaid
flowchart TB
    subgraph External["External Data Sources"]
        Alpaca[(Alpaca Markets)]
        FRED[(FRED)]
        Kalshi[(Kalshi)]
        EDGAR[(SEC EDGAR)]
        News[(News APIs)]
        Semantic[(Semantic Scholar)]
    end

    subgraph UI["User Interface"]
        Dashboard["Dashboard<br/>(Next.js :3000)"]
    end

    subgraph Services["Application Services"]
        DashAPI["Dashboard API<br/>(Hono :3001)"]
        Worker["Worker<br/>(:3002)"]
        Mastra["Mastra<br/>(:4111)"]
        ExecEngine["Execution Engine<br/>(:50051 HTTP / :50053 gRPC)"]
        StreamProxy["Stream Proxy<br/>(:50052 gRPC / :8082 HTTP)"]
    end

    subgraph Data["Data Layer"]
        PG[(PostgreSQL)]
        Helix[(HelixDB)]
    end

    subgraph Observability
        OTELCollector["OTEL Collector<br/>:4317 gRPC / :4318 HTTP"]
        OpenObserve["OpenObserve<br/>:5080"]
    end

    External --> Services
    Dashboard -->|HTTP/WebSocket| DashAPI
    Worker -->|POST /trigger-cycle| DashAPI
    DashAPI -->|Run Workflow| Mastra
    Mastra -->|gRPC| ExecEngine
    ExecEngine -->|REST| Alpaca
    StreamProxy -->|WebSocket| Alpaca
    StreamProxy -->|gRPC streams| DashAPI
    Services --> PG
    Services --> Helix
    Services -->|OTLP| OTELCollector
    OTELCollector --> OpenObserve
```

---

## Services

| Service | Role | Ports | Protocol |
|---------|------|-------|----------|
| **Dashboard** | Real-time trading UI, portfolio view, OODA cycle visualization | 3000 | HTTP |
| **Dashboard API** | Gateway, authentication (better-auth OAuth + 2FA), data aggregation | 3001 | HTTP/WebSocket |
| **Worker** | Hourly trading cycles, background data ingestion jobs | 3002 | HTTP |
| **Mastra** | Agent orchestration, OODA workflow engine (Mastra v1.0) | 4111 | HTTP |
| **Execution Engine** | Order validation, risk constraints, broker routing (Rust) | 50051 HTTP, 50053 gRPC | HTTP, gRPC |
| **Stream Proxy** | Alpaca WebSocket multiplexer, market data distribution (Rust) | 50052 gRPC, 8082 HTTP | gRPC, HTTP |

---

## Agent Network

The system uses an 8-agent debate architecture in 4 phases:

```mermaid
flowchart TB
    subgraph Phase1["PHASE 1: ANALYSIS"]
        direction LR
        GA[Grounding Agent]
        NA[News Analyst]
        FA[Fundamentals Analyst]
    end

    subgraph Phase2["PHASE 2: DEBATE"]
        direction LR
        Bull[Bullish Researcher]
        Bear[Bearish Researcher]
    end

    subgraph Phase3["PHASE 3: DECISION"]
        Trader[Head Trader]
        Plan([Decision Plan])
    end

    subgraph Phase4["PHASE 4: APPROVAL"]
        Risk[Risk Manager]
        Critic[Critic]
        Gate{Both Approve?}
        Retry{Retries < 3?}
        Execute([Execute])
        NoTrade([No Trade])
    end

    GA --> Bull & Bear
    NA & FA --> Bull & Bear
    Bull & Bear --> Trader
    Trader --> Plan
    Plan --> Risk & Critic
    Risk & Critic --> Gate
    Gate -->|Yes| Execute
    Gate -->|No| Retry
    Retry -->|Yes| Trader
    Retry -->|No| NoTrade
```

### Agent Responsibilities

| Agent | Model | Role | Key Tools |
|-------|-------|------|-----------|
| **Grounding** | xAI Grok | Real-time web/X search for market context | Live search |
| **News Analyst** | Gemini 3 Flash | Event impact assessment, sentiment analysis | `extractNewsContext`, `graphragQuery` |
| **Fundamentals** | Gemini 3 Flash | Valuation, macro context, prediction signals | `fredEconomicCalendar`, `getPredictionSignals` |
| **Bullish Researcher** | Gemini 3 Flash | Long thesis construction, IV analysis | `helixQuery`, `searchAcademicPapers` |
| **Bearish Researcher** | Gemini 3 Flash | Short thesis construction, IV analysis | `helixQuery`, `searchAcademicPapers` |
| **Trader** | Gemini 3 Flash | Decision plan synthesis, PDT compliance | `getQuotes`, `optionChain`, `getGreeks` |
| **Risk Manager** | Gemini 3 Flash | Constraint validation, position sizing | `getEnrichedPortfolioState` |
| **Critic** | Gemini 3 Flash | Logical consistency, evidence tracing | Context-driven |

### Decision Rules

| Metric | Formula |
|--------|---------|
| Conviction delta | δ = S_bull − S_bear |
| HOLD | \|δ\| < 0.2 |
| BUY | δ > 0.3 |
| SELL | δ < −0.3 |

**Requirements:**
- Stop-loss at thesis invalidation price
- Reward/risk ratio ≥ 1.5

---

## OODA Loop

```mermaid
flowchart LR
    subgraph OBSERVE
        Market[[Market Snapshot]]
        Context[[External Context]]
    end

    subgraph ORIENT
        Memory[[Memory Retrieval]]
        Regime[[Regime Classification]]
        Grounding[[Web Search]]
    end

    subgraph DECIDE
        Analysts[[Analysts]]
        Debate[[Bull vs Bear]]
        Trade[[Trader]]
        Approve[[Approvers]]
    end

    subgraph ACT
        Validate[[Constraint Check]]
        Submit[[Submit Order]]
        Persist[[Store Decision]]
    end

    OBSERVE --> ORIENT --> DECIDE --> ACT
```

### OODA Step Details

| Step | Phase | Description | Components |
|------|-------|-------------|------------|
| `observe` | Observe | Fetch quotes, candles, regime classification | Alpaca, @cream/marketdata, @cream/regime |
| `orient` | Orient | Load memory context, prediction signals | HelixDB, @cream/helix |
| `grounding` | Orient | Real-time web/X search for context | xAI Grok |
| `analysts` | Decide | Parallel news + fundamentals analysis | newsAnalyst, fundamentalsAnalyst |
| `debate` | Decide | Parallel bull/bear thesis construction | bullishResearcher, bearishResearcher |
| `trader` | Decide | Synthesize into decision plan | trader |
| `consensus` | Decide | Dual approval gate | riskManager, critic |
| `act` | Act | Submit approved orders | Execution Engine gRPC |

### Scheduled Workflows

| Workflow | Schedule | Purpose |
|----------|----------|---------|
| Trading Cycle | Hourly (aligned to candle close) | Full OODA loop execution |
| Prediction Markets | Every 15 minutes | Kalshi/Polymarket probability data |
| Sentiment | Hourly 9 AM - 4 PM ET (Mon-Fri) | News sentiment aggregation |
| SEC Filings | Daily 6 AM ET | 10-K, 10-Q, 8-K document ingestion |
| Economic Calendar | 6 AM / 6 PM ET | FRED event cache refresh |
| Short Interest | Daily 6 PM ET | FINRA short interest data |
| Corporate Actions | Daily 6 AM ET | Dividends, splits, spinoffs |

---

## Data Flow

### Trading Cycle

```mermaid
sequenceDiagram
    autonumber
    participant W as Worker
    participant D as Dashboard API
    participant M as Mastra
    participant E as Execution Engine
    participant B as Alpaca Broker
    participant SQL as PostgreSQL
    participant G as HelixDB

    rect rgba(99, 102, 241, 0.1)
        Note over W,B: OBSERVE
        W->>D: POST /trigger-cycle
        D->>M: Execute tradingCycleWorkflow
        M->>E: GetSnapshot
        E->>B: Market data request
        B-->>E: OHLCV + quotes
        E-->>M: Market snapshot
    end

    rect rgba(139, 92, 246, 0.1)
        Note over M,G: ORIENT
        M->>G: Vector search (similar decisions)
        G-->>M: Past decisions + context
        M->>M: Classify market regime
    end

    rect rgba(217, 119, 6, 0.1)
        Note over M: DECIDE
        M->>M: Run 8-agent consensus
    end

    rect rgba(16, 185, 129, 0.1)
        Note over M,B: ACT
        M->>E: CheckConstraints
        E-->>M: Approved
        M->>E: SubmitOrder
        E->>B: Place order
        B-->>E: Confirmation
        E-->>M: Execution result
        M->>SQL: Persist decision
        M->>G: Store embedding
    end
```

### Dashboard Request

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant D as Dashboard
    participant A as Dashboard API
    participant SQL as PostgreSQL
    participant G as HelixDB
    participant E as Execution Engine

    U->>D: View portfolio
    D->>A: GET /api/portfolio

    par Parallel fetch
        A->>SQL: Query positions
        SQL-->>A: Position data
    and
        A->>G: Query recent decisions
        G-->>A: Decision history
    and
        A->>E: GetPositions
        E-->>A: Live positions
    end

    A-->>D: Aggregated response
    D-->>U: Render portfolio
```

### Market Data Streaming

```mermaid
flowchart LR
    subgraph Alpaca["Alpaca Markets"]
        SIP["SIP WebSocket"]
        OPRA["OPRA WebSocket"]
        Trading["Trading Updates"]
    end

    subgraph Proxy["alpaca-stream-proxy (Rust)"]
        SipClient["SIP Client<br/>(JSON)"]
        OpraClient["OPRA Client<br/>(MessagePack)"]
        TradingClient["Trading Client"]
        Broadcast["Broadcast Hub"]
        gRPC["gRPC Server"]
    end

    subgraph Clients["TypeScript Services"]
        DashAPI["dashboard-api"]
        Mastra["mastra"]
    end

    SIP --> SipClient
    OPRA --> OpraClient
    Trading --> TradingClient

    SipClient --> Broadcast
    OpraClient --> Broadcast
    TradingClient --> Broadcast

    Broadcast --> gRPC

    gRPC -->|StreamQuotes| Clients
    gRPC -->|StreamTrades| Clients
    gRPC -->|StreamOptionQuotes| Clients
    gRPC -->|StreamOrderUpdates| Clients
```

---

## Execution Engine

```mermaid
flowchart TB
    subgraph Engine["Execution Engine (Rust)"]
        HTTP[HTTP Server]
        GRPC[gRPC Server]

        subgraph Core
            Gateway[Execution Gateway]
            State[Order State Manager]
        end

        subgraph Validation
            Constraints[Constraint Validator]
        end

        subgraph Routing
            Adapter[Broker Adapter]
            Feed[Market Feed]
        end

        subgraph Safety
            Monitor[Connection Monitor]
        end
    end

    HTTP --> Gateway
    GRPC --> Gateway
    Gateway --> Constraints
    Gateway --> Adapter
    Gateway --> Feed
    Adapter --> Monitor
```

### Risk Validation Pipeline

```mermaid
flowchart LR
    subgraph Input
        Orders[Orders]
        Context[Risk Context]
    end

    subgraph Checks["Risk Checks"]
        PerInstrument["Per-Instrument<br/>max_units<br/>max_notional<br/>max_pct_equity"]
        Portfolio["Portfolio<br/>max_gross_notional<br/>max_net_notional<br/>max_leverage"]
        Options["Options Greeks<br/>max_delta<br/>max_gamma<br/>max_vega<br/>max_theta"]
        BuyingPower["Buying Power<br/>required vs available"]
        PDT["PDT Rules<br/>day_trades_remaining"]
    end

    subgraph Output
        Result[Constraint Result]
    end

    Orders --> PerInstrument & Portfolio & BuyingPower & PDT
    Context --> PerInstrument & Portfolio & Options & BuyingPower & PDT

    PerInstrument --> Result
    Portfolio --> Result
    Options --> Result
    BuyingPower --> Result
    PDT --> Result
```

### Order State Machine

```mermaid
stateDiagram-v2
    [*] --> New : create
    New --> Accepted : accept
    New --> Rejected : reject
    New --> Canceled : cancel

    Accepted --> PartiallyFilled : partial fill
    Accepted --> Filled : complete fill
    Accepted --> Canceled : cancel

    PartiallyFilled --> PartiallyFilled : partial fill
    PartiallyFilled --> Filled : complete fill
    PartiallyFilled --> Canceled : cancel

    Filled --> [*]
    Canceled --> [*]
    Rejected --> [*]
    Expired --> [*]

    note right of PartiallyFilled
        FIX Protocol Invariant
        CumQty + LeavesQty = OrdQty
    end note
```

### gRPC Services

**ExecutionService (port 50053)**

| RPC | Description |
|-----|-------------|
| `CheckConstraints` | Validate DecisionPlan against risk limits |
| `SubmitOrder` | Submit single order to broker |
| `GetOrderState` | Query order by ID |
| `CancelOrder` | Request order cancellation |
| `StreamExecutions` | Real-time execution updates |
| `GetAccountState` | Account equity, buying power |
| `GetPositions` | Current positions |

**StreamProxyService (port 50052)**

| RPC | Description |
|-----|-------------|
| `StreamQuotes` | Real-time stock quotes (SIP feed) |
| `StreamTrades` | Real-time stock trades |
| `StreamBars` | Real-time OHLCV bars |
| `StreamOptionQuotes` | Real-time option quotes (OPRA feed) |
| `StreamOptionTrades` | Real-time option trades |
| `StreamOrderUpdates` | Order fill/cancel/reject events |
| `GetConnectionStatus` | Feed health and subscription counts |

---

## Environment Isolation

```mermaid
flowchart LR
    subgraph PAPER
        P1[Paper Account]
        P2[Live Market Data]
        P3[Safety Optional]
        P4[paper-api.alpaca.markets]
    end

    subgraph LIVE
        L1[Live Account]
        L2[Live Market Data]
        L3[Safety Required]
        L4[api.alpaca.markets]
    end
```

| Environment | Auth Required | Real Money | 2FA Required | Safety Checks |
|-------------|---------------|------------|--------------|---------------|
| PAPER | Yes | No | No | Optional |
| LIVE | Yes | Yes | Yes | Required |

### Safety Mechanisms

```mermaid
flowchart TB
    subgraph Layer1["1: ExecutionContext"]
        Explicit[Explicit environment parameter]
    end

    subgraph Layer2["2: Credentials"]
        Separate[Separate API keys per environment]
    end

    subgraph Layer3["3: Confirmation"]
        Token["requireLiveConfirmation()"]
    end

    subgraph Layer4["4: Namespacing"]
        OrderID["Order ID: LIVE-xxx / PAPER-xxx"]
    end

    subgraph Layer5["5: Endpoint Validation"]
        Broker["validateBrokerEndpoint()"]
    end

    Layer1 --> Layer2 --> Layer3 --> Layer4 --> Layer5
```

---

## Storage

### Dual Database Architecture

```mermaid
flowchart LR
    subgraph Sources["Data Sources"]
        Market["Market Data"]
        Fund["Fundamentals"]
        EDGAR["SEC EDGAR"]
        Predict["Prediction Markets"]
    end

    subgraph Processing
        Ind["Indicator Service"]
        Ext["External Context"]
    end

    subgraph Storage
        PG[("PostgreSQL<br/>System of Record")]
        Helix[("HelixDB<br/>System of Memory")]
    end

    Sources --> Processing
    Processing --> Storage

    style PG fill:#14B8A6,stroke:#0D9488,color:#FAFAF9
    style Helix fill:#6366F1,stroke:#4F46E5,color:#FAFAF9
```

### PostgreSQL (Drizzle ORM)

Structured data with indexed queries:

| Domain | Tables |
|--------|--------|
| **Core Trading** | decisions, orders, positions, cycles, cycle_events, portfolio_snapshots |
| **Thesis** | thesis_state, thesis_state_history |
| **Configuration** | trading_config, agent_configs, universe_configs, constraints_config |
| **Auth** | user, session, account, verification, two_factor |
| **Market Data** | candles, corporate_actions, features, regime_labels |
| **Indicators** | fundamental_indicators, short_interest, sentiment, options_cache |
| **External** | prediction_market_snapshots, external_events, filings, macro_watch |

### HelixDB (Graph + Vector)

Semantic memory and case-based reasoning:

```mermaid
erDiagram
    TradeDecision ||--o{ TradeLifecycleEvent : "HAS_EVENT"
    ThesisMemory ||--o{ TradeDecision : "THESIS_INCLUDES"
    ExternalEvent ||--o{ TradeDecision : "INFLUENCED_DECISION"
    FilingChunk }o--|| Company : "FILED_BY"
    TranscriptChunk }o--|| Company : "TRANSCRIPT_FOR"
    NewsItem }o--o{ Company : "MENTIONS_COMPANY"
    Company ||--o{ Company : "DEPENDS_ON"
    Company }o--o{ MacroEntity : "AFFECTED_BY"
    ResearchHypothesis ||--o{ AcademicPaper : "CITES_PAPER"
```

**Node Types:**
- `TradeDecision` - Trading decisions with rationale embeddings
- `ThesisMemory` - Post-hoc trade analysis with lessons learned
- `ExternalEvent` - Discrete market events
- `FilingChunk` / `TranscriptChunk` - Document chunks from SEC filings
- `NewsItem` - News articles with sentiment
- `Company` / `MacroEntity` - Domain entities
- `ResearchHypothesis` / `AcademicPaper` - Research knowledge base

---

## Service Communication

```mermaid
flowchart LR
    Dashboard -->|HTTP| API
    Dashboard -->|WebSocket| API
    API -->|gRPC| Engine
    API -->|gRPC| Proxy
    API -->|HTTPS| LLM
    API -->|HTTPS| Embed
    Worker -->|HTTP| API
    Worker -->|gRPC| Engine
    Worker -->|HTTPS| LLM
    Mastra -->|gRPC| Engine
    Engine -->|HTTPS| Broker
    Engine -->|gRPC| Proxy
    Proxy -->|WebSocket| Broker
```

| From | To | Protocol | Purpose |
|------|----|----------|---------|
| Dashboard | Dashboard API | HTTP/WebSocket | UI data, real-time updates |
| Dashboard API | Execution Engine | gRPC | Position queries, account state |
| Dashboard API | Stream Proxy | gRPC | Market data streaming (quotes, trades, bars) |
| Dashboard API | LLM | HTTPS | Agent streaming, direct inference |
| Dashboard API | Embeddings | HTTPS | Vector generation for queries |
| Worker | Dashboard API | HTTP | Cycle triggers |
| Worker | Execution Engine | gRPC | Constraint checks, order submission |
| Mastra | Execution Engine | gRPC | Order execution after consensus |
| Execution Engine | Alpaca | HTTPS | Order execution |
| Execution Engine | Stream Proxy | gRPC | Market data for position monitoring |
| Stream Proxy | Alpaca | WebSocket | Single upstream connection |

---

## Observability

```mermaid
flowchart LR
    subgraph Services["Instrumented Services"]
        API["dashboard-api<br/>@opentelemetry/sdk-node"]
        WRK["worker<br/>@opentelemetry/sdk-node"]
        MST["mastra<br/>@opentelemetry/sdk-node"]
        Rust["alpaca-stream-proxy<br/>tracing-opentelemetry"]
    end

    subgraph Collector["OTEL Collector"]
        Recv["Receivers<br/>OTLP gRPC/HTTP"]
        Proc["Processors<br/>batch | memory_limiter"]
        Exp["Exporters<br/>otlphttp/openobserve"]
    end

    subgraph OpenObserve["OpenObserve"]
        Traces[(traces)]
        Metrics[(metrics)]
        Logs[(logs)]
    end

    Services -->|OTLP HTTP :4318| Recv
    Recv --> Proc --> Exp
    Exp --> Traces & Metrics & Logs
```

### Telemetry Data

| Type | Content |
|------|---------|
| **Traces** | Agent runs, LLM generations, tool calls, workflow transitions |
| **Metrics** | WebSocket connections, message throughput, cache hit rates |
| **Logs** | Structured pino logs with automatic redaction |

---

## Technical Indicators

60+ indicators across 8 categories computed by `@cream/indicators`:

| Category | Update Frequency | Key Indicators |
|----------|-----------------|----------------|
| **Price** | Real-time | RSI, ATR, SMA, EMA, MACD, Bollinger, Stochastic |
| **Liquidity** | Real-time | Bid-ask spread, VWAP, Amihud illiquidity |
| **Options** | Real-time | IV skew, Put/Call ratio, VRP, Greeks |
| **Value** | Nightly | P/E, P/B, EV/EBITDA, Earnings yield |
| **Quality** | Nightly | ROE, ROA, Beneish M-Score |
| **Short Interest** | Bi-weekly | Days to cover, Short % float |
| **Sentiment** | Hourly | Sentiment score, News volume |
| **Corporate** | Daily | Dividend yield, Ex-div days |

---

## Market Regime Classification

Five regimes inform position sizing and strategy selection:

| Regime | Characteristics | Trading Implications |
|--------|-----------------|---------------------|
| `BULL_TREND` | Fast MA > Slow MA, sustained upward momentum | Favor long positions, trend-following |
| `BEAR_TREND` | Fast MA < Slow MA, sustained downward momentum | Reduce exposure, defensive positioning |
| `RANGE` | MAs converged, low-normal volatility | Mean-reversion strategies |
| `HIGH_VOL` | ATR >80th percentile | Reduce sizes, wider stops |
| `LOW_VOL` | ATR <20th percentile | Breakout setups |

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| TypeScript Runtime | Bun |
| Rust | Edition 2024 |
| Databases | PostgreSQL (Drizzle ORM), HelixDB |
| Serialization | Protobuf (Buf CLI) + Zod |
| Monorepo | Turborepo |
| Linting | Biome, Clippy |
| Infrastructure | OpenTofu, Hetzner |
| Observability | OpenTelemetry, OpenObserve |
| Frontend | Next.js 16, React 19, TanStack Query 5, Zustand 5 |
| API Framework | Hono |
| Authentication | better-auth (OAuth + 2FA) |
| Agent Framework | Mastra v1.0 |
