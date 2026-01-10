# Cream Technical Architecture

> Agentic trading system for US equities and options combining LLM reasoning with deterministic Rust execution. Runs hourly OODA loops (Observe → Orient → Decide → Act).

**Version:** 0.2.0
**Last Updated:** 2026-01-10
**License:** AGPL-3.0-only

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Service Architecture & DAG](#2-service-architecture--dag)
3. [Technology Stack](#3-technology-stack)
4. [Monorepo Structure](#4-monorepo-structure)
5. [Package Dependency Graph](#5-package-dependency-graph)
6. [Agent Architecture](#6-agent-architecture)
7. [Data Flow & OODA Loop](#7-data-flow--ooda-loop)
8. [Protobuf Schema Layer](#8-protobuf-schema-layer)
9. [Database Layer](#9-database-layer)
10. [Rust Execution Engine](#10-rust-execution-engine)
11. [Trading Packages](#11-trading-packages)
12. [Dashboard & API](#12-dashboard--api)
13. [Worker & Scheduling](#13-worker--scheduling)
14. [Python Services](#14-python-services)
15. [Testing Strategy](#15-testing-strategy)
16. [Build & Deployment](#16-build--deployment)

---

## 1. System Overview

Cream is a multi-language monorepo implementing an autonomous trading system with the following key characteristics:

- **8-Agent Consensus Network**: LLM agents (Gemini) analyze markets, debate positions, and reach consensus before execution
- **Deterministic Execution**: Rust engine validates decisions against risk constraints and routes orders
- **Hourly OODA Cycles**: Scheduled trading cycles with checkpoint-based recovery
- **Multi-Asset Support**: US equities and options (up to 4-leg strategies)
- **Environment Isolation**: Complete separation of BACKTEST, PAPER, and LIVE modes
- **GraphRAG Memory**: HelixDB stores trade decisions for case-based reasoning

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                               CREAM TRADING SYSTEM                                   │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  ┌────────────────┐    ┌────────────────┐    ┌────────────────┐    ┌─────────────┐ │
│  │   Dashboard    │◄──►│  Dashboard-API │◄──►│    Worker      │◄──►│  Execution  │ │
│  │   (Next.js)    │    │   (Hono/WS)    │    │  (Scheduler)   │    │   Engine    │ │
│  │   Port 3000    │    │   Port 3001    │    │   Port 3002    │    │   (Rust)    │ │
│  └────────────────┘    └────────────────┘    └────────────────┘    └─────────────┘ │
│         │                     │                     │                    │          │
│         │                     │                     │                    │          │
│         ▼                     ▼                     ▼                    ▼          │
│  ┌──────────────────────────────────────────────────────────────────────────────┐  │
│  │                              DATA LAYER                                       │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │  │
│  │  │  Turso   │  │ HelixDB  │  │Databento │  │ Alpaca   │  │  Redis   │       │  │
│  │  │ (SQLite) │  │ (Graph)  │  │(Market)  │  │ (Broker) │  │ (Cache)  │       │  │
│  │  │ :8080    │  │ :6969    │  │          │  │          │  │ :6379    │       │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │  │
│  └──────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Service Architecture & DAG

### Service Dependency Graph

```
                              ┌─────────────────┐
                              │    Dashboard    │
                              │   (Next.js 16)  │
                              │   Port 3000     │
                              └────────┬────────┘
                                       │ HTTP
                                       ▼
                              ┌─────────────────┐
                              │  Dashboard-API  │
                              │  (Hono + Bun)   │
                              │   Port 3001     │
                              └────────┬────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │ HTTP             │ gRPC             │ HTTP
                    ▼                  ▼                  ▼
           ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
           │    Turso     │   │  Execution   │   │   HelixDB    │
           │   (SQLite)   │   │   Engine     │   │ (Graph+Vec)  │
           │   :8080      │   │ (Rust/Tonic) │   │   :6969      │
           └──────────────┘   │  :50051/53/55│   └──────────────┘
                              └──────┬───────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │ gRPC           │ HTTP           │ gRPC
                    ▼                ▼                ▼
           ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
           │   Databento  │  │    Alpaca    │  │    Turso     │
           │ (Market Data)│  │   (Broker)   │  │  (State DB)  │
           └──────────────┘  └──────────────┘  └──────────────┘


                              ┌─────────────────┐
                              │     Worker      │
                              │  (Scheduler)    │
                              │   Port 3002     │
                              └────────┬────────┘
                                       │
              ┌────────────────────────┼────────────────────────┐
              │ Direct Import          │ gRPC                   │ HTTP
              ▼                        ▼                        ▼
     ┌──────────────┐         ┌──────────────┐         ┌──────────────┐
     │   @cream/api │         │  Execution   │         │   HelixDB    │
     │  (Workflows) │         │   Engine     │         │ (Memory)     │
     └──────────────┘         └──────────────┘         └──────────────┘
```

### Inter-Service Communication Matrix

| From → To | Protocol | Port | Purpose |
|-----------|----------|------|---------|
| Dashboard → Dashboard-API | HTTP/WebSocket | 3001 | REST API + real-time streaming |
| Dashboard-API → Turso | HTTP (libsql) | 8080 | Config, decisions, orders |
| Dashboard-API → HelixDB | HTTP REST | 6969 | Memory queries |
| Dashboard-API → Execution Engine | gRPC | 50053 | Market data, order state |
| Worker → @cream/api | Direct import | N/A | Workflow execution |
| Worker → Execution Engine | gRPC | 50053 | Market data subscription |
| Worker → Turso | HTTP | 8080 | Config loading |
| Worker → HelixDB | HTTP | 6969 | CBR memory persistence |
| Execution Engine → Alpaca | HTTPS | 443 | Order routing |
| Execution Engine → Databento | gRPC | varies | Real-time market data |
| Execution Engine → Turso | HTTP | 8080 | Order state persistence |

### Execution Engine Ports

| Port | Protocol | Purpose |
|------|----------|---------|
| 50051 | HTTP (Axum) | REST API: /health, /v1/check-constraints, /v1/submit-orders |
| 50053 | gRPC (Tonic) | ExecutionService + MarketDataService |
| 50055 | Arrow Flight | High-performance market data transport |

---

## 3. Technology Stack

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| **TypeScript** | Bun | 1.3+ | Runtime, package manager, test runner |
| | tsgo (native-preview) | 7.0 | Native TypeScript compilation |
| | Biome | 2.3.11 | Linting and formatting |
| **Rust** | Edition 2024 | stable | Execution engine |
| | Tokio | 1.49 | Async runtime |
| | Tonic | 0.14.2 | gRPC server |
| | Arrow Flight | 57.0 | High-performance data transport |
| **Python** | CPython | 3.14+ | Research and analytics |
| | uv | - | Package management |
| | Ruff | - | Linting and formatting |
| **Orchestration** | Mastra | 0.24+ | Agent framework |
| | Turborepo | 2.7+ | Monorepo build |
| **Databases** | Turso | 0.4 | SQLite-compatible (HTTP) |
| | HelixDB | - | Graph + vector database |
| | Redis | 7 | Caching and rate limiting |
| **Messaging** | Protobuf | v3 | Cross-language serialization |
| | Buf CLI | v2 | Code generation |
| **Frontend** | Next.js | 16 | React framework |
| | React | 19 | UI library |
| | Zustand | 5.0 | State management |
| **API** | Hono | 4.11 | HTTP framework |
| | Connect-ES | 2.1 | gRPC client |
| **Auth** | better-auth | 1.4 | Google OAuth + sessions |

---

## 4. Monorepo Structure

```
cream/
├── apps/
│   ├── api/                    # Mastra server (agents + workflows)
│   ├── worker/                 # Hourly scheduler (cron-based)
│   ├── dashboard/              # Next.js 16 trading UI
│   ├── dashboard-api/          # Hono REST + WebSocket API
│   ├── execution-engine/       # Rust gRPC server
│   └── vision-service/         # Python chart analysis
│
├── packages/
│   ├── domain/                 # Core types, Zod schemas, env handling
│   ├── config/                 # Runtime config service, validation
│   ├── schema/                 # Protobuf definitions (.proto)
│   ├── schema-gen/             # Generated stubs (TS/Rust/Python)
│   ├── storage/                # Turso client wrapper, migrations
│   ├── helix/                  # HelixDB client (GraphRAG)
│   ├── helix-schema/           # Graph schema type definitions
│   ├── broker/                 # Alpaca Markets integration
│   ├── marketdata/             # Polygon/Databento adapters
│   ├── universe/               # Trading universe resolution
│   ├── indicators/             # Technical indicators (RSI, ATR, SMA)
│   ├── regime/                 # Market regime classification
│   ├── metrics/                # Risk-adjusted performance metrics
│   ├── mastra-kit/             # Agent prompts, tools, consensus gate
│   ├── external-context/       # News, sentiment extraction (Claude)
│   ├── filings/                # SEC EDGAR filing ingestion
│   ├── prediction-markets/     # Kalshi/Polymarket integration
│   ├── logger/                 # Pino logging wrapper
│   ├── dashboard-types/        # Shared dashboard/API types
│   ├── tsconfig/               # Shared TypeScript configs
│   ├── infra/                  # OpenTofu infrastructure
│   └── research/               # Python backtesting (VectorBT)
│
├── .github/workflows/          # CI/CD pipelines
├── docker-compose.yml          # Local infrastructure
├── Cargo.toml                  # Rust workspace
├── turbo.json                  # Turborepo pipeline
├── biome.json                  # Linter configuration
└── package.json                # Root workspace
```

---

## 5. Package Dependency Graph

```
FOUNDATION LAYER (No internal dependencies)
├── @cream/tsconfig
├── @cream/schema (generates schema-gen)
├── @cream/schema-gen ← protobuf, connectrpc
├── @cream/metrics (pure calculations)
└── @cream/logger ← pino
    │
    ▼
CORE LAYER
├── @cream/domain ← schema-gen, zod
└── @cream/config ← domain, zod
    │
    ▼
DATA LAYER
├── @cream/storage ← domain, config, @libsql/*
├── @cream/helix-schema ← domain, config, @google/genai
├── @cream/indicators ← storage
├── @cream/regime ← config, indicators
├── @cream/universe ← domain, config, storage
└── @cream/marketdata ← domain, config, indicators, regime, universe
    │
    ▼
INFRASTRUCTURE LAYER
├── @cream/broker ← domain, config
├── @cream/helix ← domain, config, helix-schema, helix-ts
├── @cream/filings ← domain, helix, helix-schema, storage
├── @cream/external-context ← domain, config, @anthropic-ai/sdk
└── @cream/prediction-markets ← domain, config, storage, kalshi-typescript
    │
    ▼
AGENT LAYER
└── @cream/mastra-kit ← broker, config, domain, helix, helix-schema,
                         indicators, logger, storage, universe,
                         external-context, @mastra/core
    │
    ▼
APPLICATION LAYER
├── @cream/api (apps/api) ← mastra-kit, workflows
├── @cream/worker (apps/worker) ← api, filings
├── @cream/dashboard (apps/dashboard) ← dashboard-types
└── @cream/dashboard-api (apps/dashboard-api) ← domain, storage, helix
```

### Simplified View

```
                     ┌─────────────────┐
                     │     domain      │  (Core types, schemas)
                     └────────┬────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
    ┌──────────┐        ┌──────────┐        ┌──────────┐
    │ storage  │        │  config  │        │  helix-  │
    │          │        │          │        │  schema  │
    └────┬─────┘        └────┬─────┘        └────┬─────┘
         │                   │                   │
         └───────────────────┼───────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
          ▼                  ▼                  ▼
    ┌──────────┐       ┌──────────┐       ┌──────────┐
    │indicators│       │  helix   │       │ universe │
    └────┬─────┘       └────┬─────┘       └────┬─────┘
         │                  │                  │
         └──────────────────┼──────────────────┘
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
          ▼                 ▼                 ▼
    ┌──────────┐      ┌──────────┐      ┌──────────┐
    │  broker  │      │marketdata│      │  regime  │
    └────┬─────┘      └────┬─────┘      └────┬─────┘
         │                 │                 │
         └─────────────────┼─────────────────┘
                           │
                           ▼
                   ┌──────────────┐
                   │  mastra-kit  │  (Agent coordination)
                   └──────────────┘
```

---

## 6. Agent Architecture

### 8-Agent Consensus Network

The system implements a multi-agent debate architecture organized in 4 execution phases:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PHASE 1: ANALYSIS (Parallel)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐            │
│  │    Technical    │  │      News       │  │   Fundamentals  │            │
│  │     Analyst     │  │    Analyst      │  │     Analyst     │            │
│  │                 │  │                 │  │                 │            │
│  │ • Price action  │  │ • News impact   │  │ • Valuation     │            │
│  │ • Indicators    │  │ • Sentiment     │  │ • Macro context │            │
│  │ • Key levels    │  │ • Event timing  │  │ • Pred markets  │            │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘            │
│           │                    │                    │                      │
└───────────┼────────────────────┼────────────────────┼──────────────────────┘
            │                    │                    │
            ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PHASE 2: DEBATE (Parallel)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│         ┌─────────────────────┐      ┌─────────────────────┐               │
│         │  Bullish Researcher │      │  Bearish Researcher │               │
│         │                     │      │                     │               │
│         │ • Best case LONG    │      │ • Best case SHORT   │               │
│         │ • Supporting data   │      │ • Supporting data   │               │
│         │ • Conviction 0-1    │      │ • Conviction 0-1    │               │
│         └──────────┬──────────┘      └──────────┬──────────┘               │
│                    │                            │                          │
└────────────────────┼────────────────────────────┼──────────────────────────┘
                     │                            │
                     ▼                            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       PHASE 3: DECISION (Sequential)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                        ┌─────────────────────┐                              │
│                        │       TRADER        │                              │
│                        │    (Head Trader)    │                              │
│                        │                     │                              │
│                        │ • Synthesize all    │                              │
│                        │ • Compare bull/bear │                              │
│                        │ • Size positions    │                              │
│                        │ • Set risk levels   │                              │
│                        └──────────┬──────────┘                              │
│                                   │                                         │
│                                   ▼                                         │
│                           DecisionPlan                                      │
│                                                                             │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     PHASE 4: APPROVAL (Dual-Gate Loop)                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│       ┌─────────────────────┐          ┌─────────────────────┐             │
│       │   RISK MANAGER      │          │      CRITIC         │             │
│       │   (CRO)             │          │   (Internal Audit)  │             │
│       │                     │          │                     │             │
│       │ • Constraint check  │          │ • Logic validation  │             │
│       │ • Position limits   │          │ • Evidence tracing  │             │
│       │ • Greeks limits     │          │ • Hallucination     │             │
│       │ • Event risk        │          │   detection         │             │
│       └──────────┬──────────┘          └──────────┬──────────┘             │
│                  │                                │                         │
│                  └────────────┬───────────────────┘                         │
│                               │                                             │
│                               ▼                                             │
│                        Both APPROVE?                                        │
│                         /        \                                          │
│                       YES         NO                                        │
│                        │           │                                        │
│                        ▼           ▼                                        │
│                    EXECUTE     REVISE (max 3x)                              │
│                                    │                                        │
│                                    └──► NO_TRADE (safety default)           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Agent Configuration

| Agent | Model | Tools | Output |
|-------|-------|-------|--------|
| Technical Analyst | Gemini 3 Pro | `get_quotes`, `recalc_indicator`, `helix_query` | Setup classification, key levels |
| News Analyst | Gemini 3 Pro | `news_search`, `helix_query` | Event impacts, sentiment |
| Fundamentals Analyst | Gemini 3 Pro | `economic_calendar`, `helix_query` | Valuation, macro context |
| Bullish Researcher | Gemini 3 Pro | `helix_query` | Long thesis, conviction |
| Bearish Researcher | Gemini 3 Pro | `helix_query` | Short thesis, conviction |
| Trader | Gemini 3 Pro | `get_quotes`, `portfolio_state`, `option_chain`, `get_greeks` | DecisionPlan |
| Risk Manager | Gemini 3 Flash | `portfolio_state` | APPROVE/REJECT |
| Critic | Gemini 3 Flash | None | APPROVE/REJECT |

### Decision Logic

```
Trader Decision Rules:
─────────────────────
delta = bullish_conviction - bearish_conviction

If |delta| < 0.2:
  → HOLD (insufficient edge)

If delta > 0.3:
  → BUY/LONG with Kelly-inspired sizing

If delta < -0.3:
  → SELL/SHORT or CLOSE existing

Always:
  → Set stops at Technical Analyst's invalidation levels
  → Risk/reward minimum 1.5:1
  → Adjust sizing for macro events (prediction markets)
```

---

## 7. Data Flow & OODA Loop

### Trading Cycle (Hourly)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                            OODA LOOP                                      │
└──────────────────────────────────────────────────────────────────────────┘

OBSERVE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━►
    │
    ├── fetchMarketSnapshot()
    │   ├── OHLCV candles (1h, 120 bars)
    │   ├── Real-time quotes (bid/ask/volume)
    │   └── Option chains (if enabled)
    │
    └── fetchExternalContext()
        ├── News articles (FMP)
        ├── Earnings calendars
        └── Macro releases (CPI, NFP, FOMC)

ORIENT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━►
    │
    ├── loadMemoryContext()
    │   └── HelixDB: GraphRAG retrieval of similar trades
    │
    ├── computeAndStoreRegimes()
    │   ├── Rule-based classifier (SMA crossover + ATR percentile)
    │   └── Store to regime_labels table
    │
    └── fetchPredictionMarkets() [15-min workflow]
        ├── Kalshi (Fed rates, macro events)
        └── Polymarket (elections, geopolitical)

DECIDE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━►
    │
    ├── runAnalystsParallel() [with timeout]
    │   ├── Technical Analyst → TechnicalAnalysisOutput
    │   ├── News Analyst → SentimentAnalysisOutput
    │   └── Fundamentals Analyst → FundamentalsAnalysisOutput
    │
    ├── runDebateParallel() [with timeout]
    │   ├── Bullish Researcher → BullishResearchOutput
    │   └── Bearish Researcher → BearishResearchOutput
    │
    ├── runTrader() [sequential]
    │   └── DecisionPlan (actions, sizes, stops, rationales)
    │
    └── runConsensusLoop() [Dual-Gate, max 3 iterations]
        ├── Risk Manager → APPROVE/REJECT
        ├── Critic → APPROVE/REJECT
        └── revisePlan() if rejected

ACT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━►
    │
    ├── checkConstraints() [gRPC → Rust]
    │   └── Final validation in execution engine
    │
    ├── submitOrders() [gRPC → Rust → Alpaca]
    │   ├── Market/Limit orders
    │   └── Multi-leg options (up to 4 legs)
    │
    ├── persistDecisions() [Turso]
    │   └── Store decisions with metadata for audit
    │
    └── updateHelixDBMemory()
        └── Store trade decision embeddings for future retrieval
```

### Workflow Execution Timeline

```
Worker Scheduler
    │
    ├── Trading Cycle (Hourly, aligned to candle close)
    │   └── tradingCycleWorkflow.execute()
    │
    ├── Prediction Markets (Every 15 minutes)
    │   └── predictionMarketsWorkflow.execute()
    │
    └── SEC Filings Sync (Daily at 6 AM EST)
        └── FilingsIngestionService.syncFilings()
```

### Feature Snapshot Structure

```typescript
interface MarketSnapshot {
  instruments: string[];
  candles: Record<string, CandleData[]>;  // Symbol → 120 hourly candles
  quotes: Record<string, QuoteData>;       // Symbol → bid/ask
  timestamp: number;
}

interface RegimeData {
  regime: "BULL_TREND" | "BEAR_TREND" | "RANGE_BOUND" | "HIGH_VOLATILITY" | "LOW_VOLATILITY" | "CRISIS";
  confidence: number;  // 0-1
  reasoning: string;
}

interface MemoryContext {
  relevantCases: Array<{
    caseId: string;
    symbol: string;
    action: string;
    regime: string;
    rationale: string;
    similarity: number;
  }>;
  regimeLabels: Record<string, RegimeData>;
}
```

---

## 8. Protobuf Schema Layer

### Schema Structure

```
packages/schema/cream/v1/
├── common.proto          # Enums (Environment, Action, Direction), shared messages
├── decision.proto        # DecisionPlan, Decision, RiskLevels, OrderPlan
├── execution.proto       # ExecutionService, orders, positions, constraints
├── events.proto          # ExternalEvent (16 types), payloads
└── market_snapshot.proto # Quote, Bar, OptionQuote, MarketDataService
```

### Code Generation (buf.gen.yaml)

```yaml
plugins:
  # TypeScript (Protobuf-ES v2)
  - buf.build/bufbuild/es          → packages/schema-gen/ts
  - buf.build/bufbuild/connect-es  → packages/schema-gen/ts

  # Python
  - buf.build/protocolbuffers/python → packages/schema-gen/python
  - buf.build/protocolbuffers/pyi    → packages/schema-gen/python

  # Rust (Prost + Tonic)
  - buf.build/community/neoeinstein-prost → packages/schema-gen/rust
  - buf.build/community/neoeinstein-tonic → packages/schema-gen/rust
```

### Key Enums (common.proto)

```protobuf
enum Environment { BACKTEST = 0; PAPER = 1; LIVE = 2; }
enum Action { BUY = 0; SELL = 1; HOLD = 2; INCREASE = 3; REDUCE = 4; NO_TRADE = 5; }
enum Direction { LONG = 0; SHORT = 1; FLAT = 2; }
enum InstrumentType { EQUITY = 0; OPTION = 1; }
enum OptionType { CALL = 0; PUT = 1; }
enum OrderType { LIMIT = 0; MARKET = 1; }
enum TimeInForce { DAY = 0; GTC = 1; IOC = 2; FOK = 3; OPG = 4; CLS = 5; }
enum Regime { BULL_TREND = 0; BEAR_TREND = 1; RANGE_BOUND = 2; HIGH_VOLATILITY = 3; LOW_VOLATILITY = 4; CRISIS = 5; }
```

### gRPC Services

```protobuf
service ExecutionService {
  rpc CheckConstraints(CheckConstraintsRequest) returns (CheckConstraintsResponse);
  rpc SubmitOrder(SubmitOrderRequest) returns (SubmitOrderResponse);
  rpc GetOrderState(GetOrderStateRequest) returns (GetOrderStateResponse);
  rpc CancelOrder(CancelOrderRequest) returns (CancelOrderResponse);
  rpc StreamExecutions(StreamExecutionsRequest) returns (stream StreamExecutionsResponse);
  rpc GetAccountState(GetAccountStateRequest) returns (GetAccountStateResponse);
  rpc GetPositions(GetPositionsRequest) returns (GetPositionsResponse);
}

service MarketDataService {
  rpc SubscribeMarketData(SubscribeMarketDataRequest) returns (stream SubscribeMarketDataResponse);
  rpc GetSnapshot(GetSnapshotRequest) returns (GetSnapshotResponse);
  rpc GetOptionChain(GetOptionChainRequest) returns (GetOptionChainResponse);
}
```

### TypeScript gRPC Client

```typescript
// apps/api/src/grpc/client.ts
interface ExecutionEngineClient {
  checkConstraints(request: CheckConstraintsRequest): Promise<CheckConstraintsResponse>;
  submitOrder(request: SubmitOrderRequest): Promise<SubmitOrderResponse>;
  getOrderState(request: GetOrderStateRequest): Promise<GetOrderStateResponse>;
  cancelOrder(request: CancelOrderRequest): Promise<CancelOrderResponse>;
  getAccountState(request?: GetAccountStateRequest): Promise<GetAccountStateResponse>;
  getPositions(request?: GetPositionsRequest): Promise<GetPositionsResponse>;
}

// Features:
// - Automatic retries with exponential backoff (3 attempts, 100ms base)
// - Retryable codes: UNAVAILABLE, RESOURCE_EXHAUSTED, ABORTED, DEADLINE_EXCEEDED
// - 30-second default timeout
// - Singleton management via getExecutionEngineClient()
```

---

## 9. Database Layer

### Turso (SQLite-compatible)

**Purpose:** Transactional storage for config, decisions, orders, cycles

**Connection:** HTTP (port 8080) via libsql client

**Key Tables:**

```sql
-- Runtime configuration
CREATE TABLE trading_config (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL,
  version INTEGER NOT NULL,
  max_consensus_iterations INTEGER DEFAULT 3,
  agent_timeout_ms INTEGER DEFAULT 1800000,
  total_consensus_timeout_ms INTEGER DEFAULT 300000,
  trading_cycle_interval_ms INTEGER DEFAULT 3600000,
  prediction_markets_interval_ms INTEGER DEFAULT 900000,
  status TEXT DEFAULT 'draft',  -- draft | testing | active | archived
  created_at TEXT NOT NULL
);

CREATE TABLE universe_configs (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL,
  source TEXT NOT NULL,  -- static | index | screener
  static_symbols TEXT,   -- JSON array
  status TEXT DEFAULT 'draft',
  created_at TEXT NOT NULL
);

-- Decision history
CREATE TABLE decisions (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  action TEXT NOT NULL,
  direction TEXT NOT NULL,
  size REAL NOT NULL,
  size_unit TEXT NOT NULL,
  entry_price REAL,
  stop_price REAL,
  target_price REAL,
  status TEXT NOT NULL,  -- approved | rejected | executed | cancelled
  strategy_family TEXT,
  time_horizon TEXT,
  rationale TEXT,
  bullish_factors TEXT,   -- JSON array
  bearish_factors TEXT,   -- JSON array
  confidence_score REAL,
  metadata TEXT,          -- JSON object
  environment TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Order tracking
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  broker_order_id TEXT,
  decision_id TEXT,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  order_type TEXT NOT NULL,
  limit_price REAL,
  status TEXT NOT NULL,
  filled_quantity INTEGER DEFAULT 0,
  avg_fill_price REAL,
  environment TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Regime labels (computed hourly)
CREATE TABLE regime_labels (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  regime TEXT NOT NULL,
  confidence REAL NOT NULL,
  model_name TEXT NOT NULL,
  model_version TEXT NOT NULL,
  UNIQUE(symbol, timestamp, timeframe)
);
```

### HelixDB (Graph + Vector)

**Purpose:** GraphRAG memory for case-based reasoning

**Connection:** HTTP REST (port 6969)

**Node Types:**

```
TradeDecision {
  decision_id: String @unique
  cycle_id: String
  instrument_id: String @index
  underlying_symbol: String @index
  regime_label: String
  action: String  // BUY | SELL | HOLD | NO_TRADE
  decision_json: String
  rationale_text: String
  rationale_embedding: Vector[768]  // text-embedding-004
  snapshot_reference: String
  environment: String
  created_at: DateTime
}

ExternalEvent {
  event_id: String @unique
  type: String  // EARNINGS | NEWS | MACRO | etc.
  summary: String
  sentiment: Float
  importance: Float
  related_symbols: [String]
  event_time: DateTime
}

FilingChunk {
  chunk_id: String @unique
  filing_id: String
  symbol: String @index
  section: String
  content: String
  content_embedding: Vector[768]
  created_at: DateTime
}
```

**Edge Types:**

```
INFLUENCED_DECISION { from: ExternalEvent, to: TradeDecision, weight: Float }
SIMILAR_TO { from: TradeDecision, to: TradeDecision, similarity: Float }
HAS_FILING { from: Company, to: FilingChunk }
```

**GraphRAG Retrieval:**

```typescript
// Orient phase: retrieve similar past decisions
const result = await helixOrchestrator.orient({
  queryEmbedding: situationEmbedding,
  instrumentId: symbol,
  regime: currentRegime,
  topK: 5,
});
// Returns: decisions with relevanceScore, linked events
```

---

## 10. Rust Execution Engine

### Architecture

```
apps/execution-engine/src/
├── main.rs              # Entry point, multi-server startup
├── lib.rs               # Library exports
├── config.rs            # Environment-based configuration
├── server/
│   ├── mod.rs           # Server module
│   ├── http.rs          # Axum HTTP server (:50051)
│   └── grpc.rs          # Tonic gRPC server (:50053)
├── execution/
│   ├── mod.rs           # Order routing, ExecutionGateway
│   ├── alpaca.rs        # Alpaca broker adapter
│   └── order_state.rs   # OrderStateManager
├── risk/
│   ├── mod.rs           # Risk validation
│   ├── constraints.rs   # Constraint definitions
│   └── validator.rs     # ConstraintValidator
├── broker/
│   ├── mod.rs           # Broker interface
│   └── alpaca.rs        # AlpacaAdapter with circuit breaker
├── feed/
│   ├── mod.rs           # Market data feed
│   └── databento.rs     # Databento subscription
├── safety/
│   └── connection_monitor.rs  # Mass cancel on disconnect
└── models/
    ├── order.rs         # Order, OrderState
    └── position.rs      # Position tracking
```

### Key Dependencies

```toml
[dependencies]
tokio = { version = "1.49", features = ["full"] }
tonic = { version = "0.14.2", features = ["tls-ring"] }
prost = "0.14.1"
arrow = { version = "57.0.0", features = ["ipc", "json"] }
arrow-flight = { version = "57.0.0", features = ["flight-sql-experimental"] }
rust_decimal = { version = "1.39", features = ["serde"] }
reqwest = "0.13"
tracing = "0.1.44"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
```

### Environment-Based Behavior

| Mode | Broker | Feed | Reconciliation | Safety |
|------|--------|------|----------------|--------|
| **BACKTEST** | Mock adapter | None | Disabled | Disabled |
| **PAPER** | Alpaca (paper) | Databento | Optional | Optional |
| **LIVE** | Alpaca (live) | Databento | Required | Required |

### Constraint Validation

```rust
pub struct ConstraintValidator {
    config: RiskConfig,
}

impl ConstraintValidator {
    pub fn validate(&self, request: &CheckConstraintsRequest) -> CheckConstraintsResponse {
        let mut violations = vec![];

        // Position size limits
        self.check_position_size(&request.decision_plan, &request.account_state, &mut violations);

        // Sector concentration
        self.check_sector_exposure(&request.decision_plan, &request.positions, &mut violations);

        // Options Greeks limits (portfolio delta/gamma/vega)
        self.check_greeks_limits(&request.decision_plan, &request.positions, &mut violations);

        // PDT rule compliance
        self.check_pdt_compliance(&request.account_state, &mut violations);

        // Stop-loss required for every decision
        for decision in &request.decision_plan.decisions {
            if decision.risk_levels.is_none() {
                violations.push(ConstraintViolation {
                    code: "MISSING_STOP_LOSS",
                    severity: Critical,
                    message: "Every decision must have stop-loss levels",
                });
            }
        }

        CheckConstraintsResponse {
            approved: violations.is_empty(),
            violations,
        }
    }
}
```

### Caching Strategy

- **Account state cache**: 30-second TTL
- **Positions cache**: 60-second TTL
- **Thread-safe**: `Arc<RwLock<AlpacaCache>>`

---

## 11. Trading Packages

### @cream/broker - Alpaca Integration

```typescript
interface AlpacaClient {
  getAccount(): Promise<Account>;
  getPositions(): Promise<Position[]>;
  submitOrder(request: OrderRequest): Promise<Order>;
  cancelOrder(orderId: string): Promise<void>;
  isMarketOpen(): Promise<boolean>;
}

// Multi-leg options (up to 4 legs)
interface OrderRequest {
  clientOrderId: string;
  symbol?: string;           // Single-leg
  legs?: OrderLeg[];         // Multi-leg
  qty: number;
  side: OrderSide;
  type: OrderType;
  timeInForce: TimeInForce;
  limitPrice?: number;
}
```

### @cream/marketdata - Multi-Provider

**Providers:** Databento, Polygon, FMP, AlphaVantage

```typescript
interface MarketDataAdapter {
  getCandles(symbol: string, timeframe: string, from: string, to: string): Promise<Candle[]>;
  getQuotes(symbols: string[]): Promise<Map<string, Quote>>;
  getOptionChain(symbol: string): Promise<OptionContract[]>;
}

// Features:
// - Rate limiting with token bucket
// - Exponential backoff retry
// - Corporate action adjustments
// - Options Greeks (Black-Scholes)
```

### @cream/indicators - Technical Analysis

```typescript
// Momentum
calculateRSI(candles, { period: 14 }): RSIResult[];
calculateMACD(candles, { fast: 12, slow: 26, signal: 9 }): MACDResult[];

// Trend
calculateSMA(candles, { period: 20 }): MAResult[];
calculateEMA(candles, { period: 20 }): MAResult[];

// Volatility
calculateATR(candles, { period: 14 }): ATRResult[];
calculateBollingerBands(candles, { period: 20, stdDev: 2 }): BollingerResult[];

// Pipeline
calculateIndicators(candles, timeframe, config): IndicatorSnapshot;
```

### @cream/regime - Market Classification

```typescript
type RegimeLabel = "BULL_TREND" | "BEAR_TREND" | "RANGE_BOUND" | "HIGH_VOL" | "LOW_VOL" | "CRISIS";

interface RegimeClassification {
  regime: RegimeLabel;
  confidence: number;  // 0-1
  reasoning: string;
  metrics: { fastMa, slowMa, maDiffPct, atrPercentile };
}

// Rule-based classifier
classifyRegime(input: RegimeInput): RegimeClassification;
```

### @cream/external-context - News Extraction

```typescript
class ExtractionPipeline {
  async processNews(articles: FMPNewsArticle[]): Promise<PipelineResult>;
  async processTranscripts(transcripts: FMPTranscript[]): Promise<PipelineResult>;
  async processMacroReleases(releases: FMPEconomicEvent[]): Promise<PipelineResult>;
}

// Uses Claude for structured extraction
interface ContentScores {
  sentiment: number;   // -1 to 1
  surprise: number;    // 0 to 1
  importance: number;  // 0 to 1
}
```

### @cream/prediction-markets - Kalshi/Polymarket

```typescript
class UnifiedPredictionMarketClient {
  async fetchAggregated(marketTypes: MarketType[]): Promise<UnifiedMarketData>;
}

interface PredictionMarketSignals {
  fedCutProbability?: number;
  fedHikeProbability?: number;
  recessionProbability12m?: number;
  macroUncertaintyIndex?: number;
}
```

---

## 12. Dashboard & API

### Dashboard (Next.js 16)

```
apps/dashboard/src/
├── app/
│   ├── page.tsx              # Main dashboard
│   ├── (auth)/
│   │   ├── dashboard/        # Protected trading view
│   │   ├── config/           # Configuration management
│   │   │   ├── edit/         # Draft config editing
│   │   │   └── promote/      # Config promotion workflow
│   │   ├── portfolio/        # Position management
│   │   └── decisions/        # Decision history
│   └── login/                # OAuth redirect
├── components/
│   ├── charts/               # Lightweight-charts
│   ├── portfolio/            # Position widgets
│   └── ui/                   # Design system
└── stores/
    ├── portfolio.ts          # Zustand state
    └── websocket.ts          # WebSocket connection
```

### Dashboard API (Hono)

```typescript
// apps/dashboard-api/src/index.ts
Bun.serve({
  fetch: async (req, server) => {
    if (url.pathname === "/ws") {
      return server.upgrade(req);  // WebSocket upgrade
    }
    return app.fetch(req);  // HTTP via Hono
  },
  websocket: websocketHandler
});
```

### WebSocket Channels

| Channel | Purpose |
|---------|---------|
| QUOTES | Real-time market data |
| OPTIONS | Options chain streaming |
| DECISIONS | Trade decisions from OODA |
| ALERTS | System alerts |
| BACKTEST | Backtest progress streaming |

### API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/market/snapshot` | GET | Current market snapshot |
| `/api/market/quotes/:symbol` | GET | Real-time quote |
| `/api/portfolio` | GET | Current positions |
| `/api/decisions` | GET | Decision history |
| `/api/decisions/:id` | GET | Decision detail + agent outputs |
| `/api/config/active` | GET | Active trading config |
| `/api/config/draft` | GET/PUT | Draft config editing |
| `/api/config/promote` | POST | Promote draft to active |
| `/api/system/trigger-cycle` | POST | On-demand OODA cycle |
| `/api/backtests/run` | POST | Execute VectorBT backtest |
| `/health` | GET | Service health |

---

## 13. Worker & Scheduling

### Worker Architecture

```typescript
// apps/worker/src/index.ts
interface WorkerState {
  config: FullRuntimeConfig;      // Loaded from Turso
  environment: RuntimeEnvironment;
  timers: {
    tradingCycle: Timer | null;
    predictionMarkets: Timer | null;
    filingsSync: Timer | null;
  };
  running: {
    tradingCycle: boolean;
    predictionMarkets: boolean;
    filingsSync: boolean;
  };
}
```

### Scheduling

| Workflow | Schedule | Alignment |
|----------|----------|-----------|
| Trading Cycle | Configurable (default: 1h) | Hour boundary |
| Prediction Markets | Configurable (default: 15m) | 15-minute boundary |
| SEC Filings Sync | Daily | 6 AM EST |

### Health Endpoint

```json
GET :3002/health
{
  "status": "ok",
  "environment": "PAPER",
  "config_id": "trading-config-v5",
  "intervals": {
    "trading_cycle_ms": 3600000,
    "prediction_markets_ms": 900000
  },
  "instruments": ["NVDA", "TSLA", "AAPL"],
  "last_run": {
    "trading_cycle": "2026-01-10T15:00:00Z",
    "prediction_markets": "2026-01-10T15:15:00Z"
  },
  "running": { "trading_cycle": false },
  "market_data": { "active": true, "symbols": 20 }
}
```

### Signal Handling

- **SIGHUP**: Hot-reload configuration from database
- **SIGINT/SIGTERM**: Graceful shutdown, stop timers

---

## 14. Python Services

### apps/vision-service - Chart Analysis

```python
# Pattern detection + support/resistance
class ChartAnalyzer:
    def analyze(self, candles: list[Candle], symbol: str) -> ChartAnalysisResult:
        patterns = self.pattern_detector.detect(candles)
        support, resistance = self.level_detector.detect(candles)
        return ChartAnalysisResult(
            patterns=patterns,
            support_levels=support,
            resistance_levels=resistance,
            overall_signal=self._calculate_signal(patterns, support, resistance),
        )
```

### packages/research - VectorBT Backtesting

```python
# Standalone subprocess runner
# Called from dashboard-api, streams JSON events over stdout
python -m cream.backtest.runner --config '{"backtestId": "...", "dataPath": "..."}'

# Output format (one JSON per line):
{"type": "progress", "pct": 30, "phase": "running_simulation"}
{"type": "trade", "timestamp": "...", "symbol": "AAPL", "pnl": 150.0}
{"type": "completed", "metrics": {"sharpeRatio": 1.2, "maxDrawdown": -0.15}}
```

### packages/filings - SEC EDGAR Ingestion

```typescript
// TypeScript package (not Python)
class FilingsIngestionService {
  async syncFilings(options: {
    symbols: string[];
    filingTypes: ("10-K" | "10-Q" | "8-K")[];
    limitPerSymbol: number;
  }): Promise<{
    filingsIngested: number;
    chunksCreated: number;
    durationMs: number;
  }>;
}
// Chunks filings and stores in HelixDB with embeddings
```

---

## 15. Testing Strategy

### Test Pyramid

```
                    ┌─────────────────────┐
                    │   Integration       │  (Testcontainers)
                    │  (HelixDB, Turso)   │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
       ┌──────────┐     ┌──────────┐     ┌──────────┐
       │  Unit    │     │  Unit    │     │  Unit    │
       │   (TS)   │     │  (Rust)  │     │ (Python) │
       │ bun:test │     │  cargo   │     │  pytest  │
       └──────────┘     └──────────┘     └──────────┘
```

### Running Tests

```bash
# TypeScript (always BACKTEST mode)
NODE_ENV=test CREAM_ENV=BACKTEST bun test

# Rust
cargo test --workspace

# Python
pytest apps/vision-service
```

### CI Workflows

| Workflow | Trigger | Jobs |
|----------|---------|------|
| `test.yml` | Push/PR | TS tests, Rust tests, Python tests, Lint |
| `buf-check.yml` | Push/PR | Proto lint, breaking changes |

---

## 16. Build & Deployment

### Local Development

```bash
# Start infrastructure
docker compose up -d

# Install dependencies
bun install

# Seed database configuration
bun run db:seed

# Start all services
bun run dev
```

### Docker Compose Services

| Service | Image | Ports |
|---------|-------|-------|
| turso | ghcr.io/tursodatabase/libsql-server | 8080 |
| redis | redis:7-alpine | 6379 |
| dashboard | apps/dashboard/Dockerfile | 3000 |
| dashboard-api | apps/dashboard-api/Dockerfile | 3001 |

Note: HelixDB runs via CLI (`helix deploy local` on port 6969)

### Environment Variables

```bash
# Core (required)
CREAM_ENV=BACKTEST|PAPER|LIVE

# Database
TURSO_DATABASE_URL=http://localhost:8080
HELIX_URL=http://localhost:6969

# Market Data
POLYGON_KEY=xxx
DATABENTO_KEY=xxx
FMP_KEY=xxx

# Broker (required for PAPER/LIVE)
ALPACA_KEY=xxx
ALPACA_SECRET=xxx

# LLM (required for PAPER/LIVE)
GOOGLE_GENERATIVE_AI_API_KEY=xxx

# Auth (required for PAPER/LIVE)
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
BETTER_AUTH_URL=http://localhost:3001

# Prediction Markets
KALSHI_API_KEY_ID=xxx
KALSHI_PRIVATE_KEY_PATH=xxx
```

### Turborepo Pipeline

```json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"],
      "env": ["CREAM_ENV"]
    },
    "test": {
      "dependsOn": ["^build", "build"],
      "outputs": ["coverage/**"],
      "env": ["CREAM_ENV"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

---

## Appendix: Quick Reference

### Commands

```bash
# Development
bun run dev                 # All services via Turborepo
cargo build --workspace     # Rust
buf generate                # Protobuf codegen

# Testing
CREAM_ENV=BACKTEST bun test
cargo test --workspace
pytest

# Linting
bun run lint                # All (TS + Rust + Python)
biome check .               # TS only
cargo clippy --all-targets  # Rust only
ruff check                  # Python only

# Database
bun run db:migrate          # Run migrations
bun run db:seed             # Seed configuration
bun run db:status           # Migration status
```

### Key File Locations

| Component | Path |
|-----------|------|
| Trading cycle workflow | `/apps/api/src/workflows/trading-cycle.ts` |
| Agent definitions | `/apps/api/src/agents/mastra-agents.ts` |
| Consensus gate | `/packages/mastra-kit/src/consensus.ts` |
| gRPC client | `/apps/api/src/grpc/client.ts` |
| Proto schemas | `/packages/schema/cream/v1/*.proto` |
| Rust engine | `/apps/execution-engine/src/` |
| Worker scheduler | `/apps/worker/src/index.ts` |
| Dashboard routes | `/apps/dashboard-api/src/routes/` |
| HelixDB orchestrator | `/apps/api/src/workflows/steps/helixOrchestrator.ts` |
| Regime classifier | `/packages/regime/src/rule-based.ts` |

### Service Ports

| Service | Port | Protocol |
|---------|------|----------|
| Dashboard | 3000 | HTTP |
| Dashboard-API | 3001 | HTTP + WebSocket |
| Worker (health) | 3002 | HTTP |
| Turso | 8080 | HTTP (libsql) |
| HelixDB | 6969 | HTTP REST |
| Execution Engine | 50051 | HTTP (Axum) |
| Execution Engine | 50053 | gRPC (Tonic) |
| Execution Engine | 50055 | Arrow Flight |
| Redis | 6379 | Redis protocol |

---

*This document is auto-maintained. Last generated: 2026-01-10*
