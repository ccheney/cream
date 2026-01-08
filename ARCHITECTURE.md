# Cream Technical Architecture

> Agentic trading system for US equities and options combining LLM reasoning with deterministic Rust execution. Runs hourly OODA loops (Observe → Orient → Decide → Act).

**Version:** 0.1.0
**Last Updated:** 2026-01-06
**License:** AGPL-3.0-only

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Technology Stack](#2-technology-stack)
3. [Monorepo Structure](#3-monorepo-structure)
4. [Agent Architecture](#4-agent-architecture)
5. [Data Flow & OODA Loop](#5-data-flow--ooda-loop)
6. [Protobuf Schema Layer](#6-protobuf-schema-layer)
7. [Database Layer](#7-database-layer)
8. [Rust Execution Engine](#8-rust-execution-engine)
9. [Trading Packages](#9-trading-packages)
10. [Dashboard & API](#10-dashboard--api)
11. [Python Services](#11-python-services)
12. [Testing Strategy](#12-testing-strategy)
13. [Observability](#13-observability)
14. [Build & Deployment](#14-build--deployment)

---

## 1. System Overview

Cream is a multi-language monorepo implementing an autonomous trading system with the following key characteristics:

- **8-Agent Consensus Network**: LLM agents (Gemini) analyze markets, debate positions, and reach consensus before execution
- **Deterministic Execution**: Rust engine validates decisions against risk constraints and routes orders
- **Hourly OODA Cycles**: Scheduled trading cycles with checkpoint-based recovery
- **Multi-Asset Support**: US equities and options (up to 4-leg strategies)
- **Environment Isolation**: Complete separation of BACKTEST, PAPER, and LIVE modes

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              CREAM TRADING SYSTEM                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │   Dashboard  │◄──►│ Dashboard-API│◄──►│   Mastra     │◄──►│  Execution   │  │
│  │   (Next.js)  │    │   (Hono/WS)  │    │   Agents     │    │   Engine     │   │
│  │   Port 3000  │    │   Port 3001  │    │  (Gemini)    │    │   (Rust)     │   │
│  └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘   │
│                                                  │                   │          │
│                                                  ▼                   ▼          │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                           DATA LAYER                                     │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │   │
│  │  │  Turso   │  │ HelixDB  │  │ Polygon  │  │ Alpaca   │  │  Redis   │    │   │
│  │  │ (SQLite) │  │ (Graph)  │  │ (Market) │  │ (Broker) │  │ (Cache)  │    │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Technology Stack

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| **TypeScript** | Bun | 1.3+ | Runtime, package manager, test runner |
| | tsgo (native-preview) | 7.0 | Native TypeScript compilation |
| | Biome | 2.3.11 | Linting and formatting |
| **Rust** | Edition 2024 | stable | Execution engine |
| | cargo-llvm-cov | - | Coverage reporting |
| | Clippy | - | Linting |
| **Python** | CPython | 3.14+ | Research and analytics |
| | uv | - | Package management |
| | Ruff | - | Linting and formatting |
| | MyPy | strict | Type checking |
| **Orchestration** | Mastra | 0.24+ | Agent framework |
| | Turborepo | 2.7+ | Monorepo build |
| **Databases** | Turso | 0.4 | SQLite-compatible (HTTP/gRPC) |
| | HelixDB | - | Graph + vector database |
| | Redis | 7 | Caching and rate limiting |
| **Messaging** | Protobuf | v3 | Cross-language serialization |
| | Buf CLI | v2 | Code generation |
| **Observability** | Prometheus | 3.4 | Metrics |
| | Alertmanager | 0.28 | Alert routing |
| | OpenTelemetry | 0.31 | Distributed tracing |

---

## 3. Monorepo Structure

```
cream/
├── apps/
│   ├── api/                    # Mastra server (agents + workflows)
│   ├── worker/                 # Hourly scheduler (cron-based)
│   ├── dashboard/              # Next.js 16 trading UI
│   ├── dashboard-api/          # Hono REST + WebSocket API
│   ├── execution-engine/       # Rust gRPC server
│   ├── evals/                  # Python DeepEval evaluations
│   ├── filings-service/        # Python SEC filings ingestion
│   └── vision-service/         # Python chart analysis
│
├── packages/
│   ├── domain/                 # Core types, Zod schemas, env handling
│   ├── config/                 # YAML config loading with validation
│   ├── schema/                 # Protobuf definitions (.proto)
│   ├── schema-gen/             # Generated stubs (TS/Rust/Python)
│   ├── storage/                # Turso client wrapper
│   ├── helix/                  # HelixDB client
│   ├── helix-schema/           # Graph schema definitions
│   ├── broker/                 # Alpaca Markets integration
│   ├── marketdata/             # Polygon/Massive/Databento adapters
│   ├── universe/               # Trading universe resolution
│   ├── indicators/             # Technical indicators (RSI, ATR, SMA)
│   ├── regime/                 # Market regime classification
│   ├── metrics/                # Risk-adjusted performance metrics
│   ├── mastra-kit/             # Agent prompts, tools, evaluations
│   ├── external-context/       # News, sentiment, fundamentals
│   ├── prediction-markets/     # Kalshi/Polymarket integration
│   ├── validation/             # Schema parity validation
│   ├── dashboard-types/        # Shared dashboard/API types
│   ├── tsconfig/               # Shared TypeScript configs
│   ├── infra/                  # Prometheus/Alertmanager configs
│   └── research/               # Python backtesting (VectorBT)
│
├── .github/workflows/          # CI/CD pipelines
├── docker-compose.yml          # Local infrastructure
├── Cargo.toml                  # Rust workspace
├── turbo.json                  # Turborepo pipeline
├── biome.json                  # Linter configuration
└── package.json                # Root workspace
```

### Package Dependencies

```
                     ┌─────────────────┐
                     │     domain      │  (Core types, schemas)
                     └────────┬────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
    ┌──────────┐        ┌──────────┐        ┌──────────┐
    │  broker  │        │marketdata│        │  config  │
    └────┬─────┘        └────┬─────┘        └────┬─────┘
         │                   │                   │
         └───────────────────┼───────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
          ▼                  ▼                  ▼
    ┌──────────┐       ┌──────────┐       ┌──────────┐
    │indicators│       │  regime  │       │ universe │
    └────┬─────┘       └────┬─────┘       └────┬─────┘
         │                  │                  │
         └──────────────────┼──────────────────┘
                            │
                            ▼
                    ┌──────────────┐
                    │  mastra-kit  │  (Agent coordination)
                    └──────────────┘
```

---

## 4. Agent Architecture

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
│                         PHASE 2: RESEARCH (Parallel)                        │
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
│                     PHASE 4: APPROVAL (Dual-Gate)                           │
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
│                    EXECUTE     ITERATE (max 3x)                             │
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

## 5. Data Flow & OODA Loop

### Trading Cycle (Hourly)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                            OODA LOOP                                      │
└──────────────────────────────────────────────────────────────────────────┘

OBSERVE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━►
    │
    ├── fetchMarketSnapshot()
    │   ├── OHLCV candles (1m, 5m, 15m, 1h, 1d)
    │   ├── Real-time quotes (bid/ask/volume)
    │   └── Option chains (if enabled)
    │
    └── fetchExternalEvents()
        ├── News articles (FMP, Benzinga)
        ├── Earnings calendars
        └── Macro releases (CPI, NFP, FOMC)

ORIENT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━►
    │
    ├── loadMemoryContext()
    │   └── HelixDB: Similar historical trades
    │
    ├── buildFeatureSnapshot()
    │   ├── Technical indicators (RSI, ATR, SMA, BB)
    │   ├── Regime classification
    │   └── Normalized features (z-scores, percentiles)
    │
    └── fetchPredictionMarkets()
        ├── Kalshi (Fed rates, macro events)
        └── Polymarket (elections, geopolitical)

DECIDE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━►
    │
    ├── runAnalysts() [Parallel]
    │   ├── Technical Analyst → TechnicalAnalysisOutput
    │   ├── News Analyst → SentimentAnalysisOutput
    │   └── Fundamentals Analyst → FundamentalsAnalysisOutput
    │
    ├── runResearchers() [Parallel]
    │   ├── Bullish Researcher → BullishResearchOutput
    │   └── Bearish Researcher → BearishResearchOutput
    │
    ├── runTrader() [Sequential]
    │   └── DecisionPlan (actions, sizes, stops, rationales)
    │
    └── runApproval() [Dual-Gate Loop]
        ├── Risk Manager → APPROVE/REJECT
        ├── Critic → APPROVE/REJECT
        └── Iterate up to 3x if rejected

ACT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━►
    │
    ├── checkConstraints() [gRPC → Rust]
    │   └── Final validation in execution engine
    │
    ├── submitOrders() [gRPC → Rust → Alpaca]
    │   ├── Market/Limit orders
    │   └── Multi-leg options (up to 4 legs)
    │
    └── saveCheckpoint()
        └── Turso: Cycle state for recovery
```

### Feature Snapshot Structure

```typescript
interface FeatureSnapshot {
  symbol: string;
  timestamp: number;

  // Multi-timeframe candles
  candlesByTimeframe: {
    "1m"?: Candle[];
    "5m"?: Candle[];
    "15m"?: Candle[];
    "1h"?: Candle[];
    "1d"?: Candle[];
  };

  // Computed indicators (key format: {indicator}_{param}_{timeframe})
  indicators: {
    "rsi_14_1h": number;
    "atr_14_1d": number;
    "sma_20_1d": number;
    "sma_50_1d": number;
    // ...
  };

  // Normalized values (z-scores, percentiles)
  normalized: {
    "zscore_rsi_14_1h": number;
    "percentile_volume_1d": number;
    // ...
  };

  // Market state
  regime: RegimeClassification;
  externalEvents: ExternalEventSummary[];
  metadata: UniverseMetadata;
}
```

---

## 6. Protobuf Schema Layer

### Schema Structure

```
packages/schema/cream/v1/
├── common.proto          # Enums, shared messages
├── decision.proto        # DecisionPlan, Decision, RiskLevels
├── execution.proto       # Orders, positions, gRPC service
├── events.proto          # External events (news, earnings, macro)
└── market_snapshot.proto # Quotes, bars, option chains
```

### Code Generation (buf.gen.yaml)

```yaml
plugins:
  # TypeScript (ESM)
  - buf.build/bufbuild/es          → packages/schema-gen/ts
  - buf.build/bufbuild/connect-es  → packages/schema-gen/ts

  # Python
  - buf.build/protocolbuffers/python → packages/schema-gen/python
  - buf.build/protocolbuffers/pyi    → packages/schema-gen/python

  # Rust
  - buf.build/community/neoeinstein-prost → packages/schema-gen/rust
  - buf.build/community/neoeinstein-tonic → packages/schema-gen/rust
```

### Key Message Types

```protobuf
// DecisionPlan - Output of Trader agent
message DecisionPlan {
  string cycle_id = 1;
  google.protobuf.Timestamp as_of_timestamp = 2;
  Environment environment = 3;
  repeated Decision decisions = 4;
  optional string portfolio_notes = 5;
}

// Decision - Single trading action
message Decision {
  Instrument instrument = 1;
  Action action = 2;              // BUY, SELL, HOLD, INCREASE, REDUCE
  Size size = 3;                  // Quantity + unit (SHARES, CONTRACTS)
  OrderPlan order_plan = 4;
  RiskLevels risk_levels = 5;     // MANDATORY: stop_loss + take_profit
  StrategyFamily strategy_family = 6;
  string rationale = 7;
  double confidence = 8;
  References references = 9;
}

// RiskLevels - Required for every decision
message RiskLevels {
  double stop_loss_level = 1;
  double take_profit_level = 2;
  RiskDenomination denomination = 3;  // UNDERLYING_PRICE or OPTION_PRICE
}
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

---

## 7. Database Layer

### Turso (SQLite-compatible)

**Purpose:** Transactional storage for positions, orders, cycles, decisions

**Connection:** HTTP (port 8080) or gRPC (port 5001)

**Key Tables:**

```sql
-- Runtime configuration (Plan 22)
CREATE TABLE trading_config (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL,
  version INTEGER NOT NULL,
  max_consensus_iterations INTEGER DEFAULT 3,
  conviction_delta_hold REAL DEFAULT 0.2,
  conviction_delta_action REAL DEFAULT 0.3,
  min_risk_reward_ratio REAL DEFAULT 1.5,
  status TEXT DEFAULT 'draft',  -- draft | testing | active | archived
  created_at TEXT NOT NULL
);

CREATE TABLE agent_configs (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL,
  agent_type TEXT NOT NULL,
  model TEXT NOT NULL,
  temperature REAL NOT NULL,
  system_prompt_override TEXT,
  enabled INTEGER DEFAULT 1
);

CREATE TABLE universe_configs (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL,
  source TEXT NOT NULL,  -- static | index | screener
  static_symbols TEXT,   -- JSON array
  status TEXT DEFAULT 'draft'
);

-- Cycle tracking
CREATE TABLE cycles (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'started'
);

-- Checkpoints for recovery
CREATE TABLE checkpoints (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL REFERENCES cycles(id),
  phase TEXT NOT NULL,
  data TEXT NOT NULL,  -- JSON serialized state
  created_at TEXT NOT NULL
);

-- Decision history
CREATE TABLE decisions (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL REFERENCES cycles(id),
  instrument_id TEXT NOT NULL,
  action TEXT NOT NULL,
  direction TEXT NOT NULL,
  size_value REAL NOT NULL,
  size_unit TEXT NOT NULL,
  stop_loss REAL NOT NULL,
  take_profit REAL NOT NULL,
  confidence REAL NOT NULL,
  rationale TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Order tracking
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  broker_order_id TEXT,
  decision_id TEXT REFERENCES decisions(id),
  instrument_id TEXT NOT NULL,
  side TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  order_type TEXT NOT NULL,
  limit_price REAL,
  status TEXT NOT NULL,
  filled_quantity INTEGER DEFAULT 0,
  avg_fill_price REAL,
  submitted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### HelixDB (Graph + Vector)

**Purpose:** Memory storage for pattern matching and semantic search

**Connection:** HTTP (port 6969)

**Schema (schema.hx):**

```
// Trade memory for pattern matching
Node TradeMemory {
  trade_id: String @unique
  symbol: String @index
  entry_date: DateTime
  exit_date: DateTime?
  direction: String  // "LONG" | "SHORT"
  entry_price: Float
  exit_price: Float?
  pnl_pct: Float?
  regime: String
  rationale: String
  rationale_embedding: Vector[1536]  // For semantic search
  outcome: String  // "WIN" | "LOSS" | "OPEN"
}

// Market pattern nodes
Node MarketPattern {
  pattern_id: String @unique
  pattern_type: String  // "BREAKOUT" | "REVERSAL" | "TREND"
  symbols: [String]
  detected_at: DateTime
  confidence: Float
  features_embedding: Vector[1536]
}

// Edges for relationships
Edge SimilarTo {
  from: TradeMemory
  to: TradeMemory
  similarity: Float
}

Edge TriggeredBy {
  from: TradeMemory
  to: MarketPattern
}
```

**Query Examples:**

```typescript
// Find similar past trades
const similarTrades = await helix.query(`
  MATCH (t:TradeMemory)
  WHERE t.symbol = $symbol
    AND t.regime = $regime
  ORDER BY vector_similarity(t.rationale_embedding, $embedding) DESC
  LIMIT 5
`, { symbol: "AAPL", regime: "BULL_TREND", embedding });

// Pattern matching
const patterns = await helix.vectorSearch("MarketPattern", {
  vector: currentFeaturesEmbedding,
  topK: 10,
  filter: { confidence: { $gte: 0.7 } }
});
```

---

## 8. Rust Execution Engine

### Architecture

```
apps/execution-engine/src/
├── main.rs              # Entry point, server startup
├── lib.rs               # Library exports
├── config.rs            # Configuration loading
├── server/
│   ├── mod.rs           # Server module
│   ├── http.rs          # Axum HTTP server
│   └── grpc.rs          # Tonic gRPC server
├── execution/
│   ├── mod.rs           # Order routing
│   ├── alpaca.rs        # Alpaca broker adapter
│   └── backtest.rs      # Backtest adapter
├── risk/
│   ├── mod.rs           # Risk validation
│   ├── constraints.rs   # Constraint definitions
│   └── validator.rs     # Constraint checking
├── models/
│   ├── mod.rs           # Domain models
│   ├── order.rs         # Order types
│   └── position.rs      # Position tracking
└── backtest/
    ├── mod.rs           # Backtest simulation
    └── engine.rs        # Event-driven backtester
```

### Key Dependencies

```toml
[dependencies]
# Async runtime
tokio = { version = "1.49", features = ["full"] }

# gRPC
tonic = { version = "0.14.2", features = ["tls-ring", "tls-native-roots"] }
prost = "0.14.1"

# High-performance data transport
arrow = { version = "57.0.0", features = ["ipc", "json"] }
arrow-flight = { version = "57.0.0", features = ["flight-sql-experimental"] }

# Financial precision
rust_decimal = { version = "1.39", features = ["serde", "serde-with-str"] }

# Database
turso = "0.4.0-pre.19"

# Observability
tracing = "0.1.44"
metrics = "0.24.3"
opentelemetry = "0.31"
```

### Constraint Validation

```rust
pub struct ConstraintValidator {
    config: RiskConfig,
}

impl ConstraintValidator {
    pub fn validate(&self, request: &CheckConstraintsRequest) -> CheckConstraintsResponse {
        let mut checks = vec![];
        let mut violations = vec![];

        // Position size limits
        checks.push(self.check_position_size(&request.decision_plan, &request.account_state));

        // Sector concentration
        checks.push(self.check_sector_exposure(&request.decision_plan, &request.positions));

        // Options Greeks limits
        checks.push(self.check_greeks_limits(&request.decision_plan, &request.positions));

        // PDT rule
        checks.push(self.check_pdt_compliance(&request.account_state));

        // Stop-loss validation
        for decision in &request.decision_plan.decisions {
            if decision.risk_levels.is_none() {
                violations.push(ConstraintViolation {
                    code: "MISSING_STOP_LOSS".to_string(),
                    severity: ViolationSeverity::Critical,
                    message: "Every decision must have stop-loss levels".to_string(),
                    instrument_id: Some(decision.instrument.instrument_id.clone()),
                    ..Default::default()
                });
            }
        }

        CheckConstraintsResponse {
            approved: violations.is_empty(),
            checks,
            violations,
            validated_at: Some(Timestamp::now()),
            rejection_reason: if violations.is_empty() { None } else {
                Some(format!("{} constraint violations", violations.len()))
            },
        }
    }
}
```

### Lint Configuration

```toml
[lints.rust]
unsafe_code = "forbid"      # No unsafe Rust allowed
missing_docs = "warn"

[lints.clippy]
pedantic = "warn"
nursery = "warn"
unwrap_used = "warn"        # Prefer expect() or ?
expect_used = "warn"        # Prefer proper error handling
```

---

## 9. Trading Packages

### packages/broker/ - Alpaca Integration

```typescript
interface AlpacaClient {
  // Account
  getAccount(): Promise<Account>;

  // Positions
  getPositions(): Promise<Position[]>;
  getPosition(symbol: string): Promise<Position | null>;
  closePosition(symbol: string, qty?: number): Promise<Order>;
  closeAllPositions(): Promise<Order[]>;

  // Orders
  submitOrder(request: OrderRequest): Promise<Order>;
  cancelOrder(orderId: string): Promise<void>;
  getOrder(orderId: string): Promise<Order | null>;
  getOrders(status?: "open" | "closed" | "all"): Promise<Order[]>;

  // Market
  isMarketOpen(): Promise<boolean>;
  getEnvironment(): TradingEnvironment;
}

// Multi-leg options support (up to 4 legs)
interface OrderRequest {
  clientOrderId: string;
  symbol?: string;           // Single-leg
  legs?: OrderLeg[];         // Multi-leg (2-4 legs)
  qty: number;
  side: OrderSide;
  type: OrderType;
  timeInForce: TimeInForce;
  limitPrice?: number;
  extendedHours?: boolean;
}

interface OrderLeg {
  symbol: string;
  ratio: number;             // Positive = buy, negative = sell
  optionType?: "call" | "put";
  strike?: number;
  expiration?: string;
}
```

### packages/marketdata/ - Multi-Provider Data

**Providers:**
- **Polygon** - REST API for aggregates, snapshots
- **Databento** - Execution-grade real-time feed
- **FMP** - Fundamentals, transcripts
- **AlphaVantage** - Macro indicators
- **Massive** - WebSocket streaming

**Key Features:**
- Rate limiting with token bucket
- Exponential backoff retry
- Corporate action adjustments
- Options Greeks (Black-Scholes)
- Anomaly detection

```typescript
// Greeks calculation
interface OptionGreeks {
  delta: number;
  gamma: number;
  theta: number;     // Per day
  vega: number;
  rho: number;
  theoreticalPrice: number;
}

function calculateGreeks(position: OptionPosition): OptionGreeks;
function calculateOptionsExposure(positions: OptionPosition[]): OptionsExposure;
```

### packages/indicators/ - Technical Analysis

```typescript
// Momentum
function calculateRSI(candles: Candle[], params?: { period: number }): RSIResult[];
function calculateStochastic(candles: Candle[], params: StochasticParams): StochasticResult[];

// Trend
function calculateSMA(candles: Candle[], params?: { period: number }): MAResult[];
function calculateEMA(candles: Candle[], params: { period: number }): MAResult[];

// Volatility
function calculateATR(candles: Candle[], params?: { period: number }): ATRResult[];
function calculateBollingerBands(candles: Candle[], params: BollingerParams): BollingerBandsResult[];

// Volume
function calculateVolumeSMA(candles: Candle[], params: { period: number }): VolumeSMAResult[];

// Pipeline orchestration
function calculateIndicators(
  candles: Candle[],
  timeframe: Timeframe,
  config: IndicatorPipelineConfig
): IndicatorSnapshot;

function calculateMultiTimeframeIndicators(
  candlesByTimeframe: Record<Timeframe, Candle[]>,
  config: IndicatorPipelineConfig
): Record<Timeframe, IndicatorSnapshot>;
```

### packages/regime/ - Market Classification

```typescript
type RegimeLabel =
  | "BULL_TREND"
  | "BEAR_TREND"
  | "RANGE_BOUND"
  | "HIGH_VOL"
  | "LOW_VOL"
  | "UNKNOWN";

interface RegimeClassification {
  regime: RegimeLabel;
  confidence: number;          // 0-1
  reasoning: string;
  metrics: {
    fastMa: number;
    slowMa: number;
    maDiff: number;
    maDiffPct: number;
    currentAtr: number;
    atrPercentile: number;
  };
}

// Rule-based classifier
function classifyRegime(input: RegimeInput, config?: RuleBasedConfig): RegimeClassification;

// GMM classifier (for backtesting)
function trainGMM(candles: Candle[], config: GMMConfig): GMMModel;
function classifyWithGMM(model: GMMModel, candles: Candle[]): GMMClassification;
```

### packages/metrics/ - Performance Analytics

```typescript
interface PerformanceMetrics {
  rawReturn: number;          // Cumulative %
  sharpe: number | null;      // Risk-adjusted return
  sortino: number | null;     // Downside risk-adjusted
  calmar: number | null;      // Return / max drawdown
  window: string;             // "1d", "1w", "1m"
  timestamp: string;
}

// Core calculations
function calculateSharpe(returns: number[], riskFreeRate: number, periodsPerYear: number): number | null;
function calculateSortino(returns: number[], targetReturn: number, periodsPerYear: number): number | null;
function calculateCalmar(returns: number[], periodsPerYear: number): number | null;
function calculateMaxDrawdown(values: number[]): number;
```

### packages/external-context/ - News & Sentiment

```typescript
// Extraction pipeline
class ExtractionPipeline {
  async processNews(articles: FMPNewsArticle[]): Promise<PipelineResult>;
  async processTranscripts(transcripts: FMPTranscript[]): Promise<PipelineResult>;
  async processMacroReleases(releases: FMPEconomicEvent[]): Promise<PipelineResult>;
}

// Scoring system
interface ContentScores {
  sentiment: number;          // -1 to 1
  surprise: number;           // 0 to 1
  importance: number;         // 0 to 1
  recency: number;            // 0 to 1
  reliability: number;        // 0 to 1
}

// Entity linking
class EntityLinker {
  async linkEntity(entityName: string, type: EntityType): Promise<EntityLink | null>;
}
```

### packages/prediction-markets/ - Kalshi & Polymarket

```typescript
interface PredictionMarketScores {
  // Fed policy
  fedRateCut: number;
  fedRateHike: number;

  // Economic data
  strongJobs: number;
  inflationHigh: number;
  gdpGrowth: number;

  // Risk signals
  recessionProbability: number;
  macroUncertainty: number;    // 0-1

  // Aggregate
  riskDirection: "UP" | "DOWN" | "NEUTRAL";
}

// Unified client
class UnifiedPredictionMarketClient {
  async fetchAggregated(marketTypes: MarketType[]): Promise<UnifiedMarketData>;
  async getArbitrageOpportunities(): Promise<ArbitrageAlert[]>;
}
```

---

## 10. Dashboard & API

### Dashboard (Next.js 16)

```
apps/dashboard/src/
├── app/
│   ├── page.tsx              # Main dashboard
│   ├── portfolio/            # Position management
│   ├── decisions/            # Decision history
│   ├── agents/               # Agent monitoring
│   └── settings/             # Configuration
├── components/
│   ├── charts/               # TradingView-style charts
│   ├── portfolio/            # Portfolio widgets
│   ├── agents/               # Agent status cards
│   └── ui/                   # Design system components
└── stores/
    ├── portfolio.ts          # Zustand portfolio state
    ├── websocket.ts          # WebSocket connection
    └── decisions.ts          # Decision history
```

### Dashboard API (Hono)

```typescript
// apps/dashboard-api/src/index.ts
const app = new Hono()
  .basePath("/api")
  .route("/market", marketRoutes)
  .route("/portfolio", portfolioRoutes)
  .route("/decisions", decisionsRoutes)
  .route("/agents", agentsRoutes)
  .route("/settings", settingsRoutes);

// WebSocket streaming
export const websocket = {
  open(ws: ServerWebSocket<WebSocketData>) {
    ws.subscribe("market");
    ws.subscribe("portfolio");
  },
  message(ws, message) {
    // Handle subscriptions
  },
  close(ws) {
    ws.unsubscribe("market");
    ws.unsubscribe("portfolio");
  },
};

// Market data streaming
class MarketDataStreamer {
  async startStreaming(symbols: string[]) {
    // Connect to Massive WebSocket
    // Broadcast to dashboard clients
  }
}
```

### API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/market/snapshot` | GET | Current market snapshot |
| `/api/market/quotes/:symbol` | GET | Real-time quote |
| `/api/portfolio/positions` | GET | Current positions |
| `/api/portfolio/orders` | GET | Order history |
| `/api/decisions/history` | GET | Past decisions |
| `/api/decisions/:cycleId` | GET | Specific cycle |
| `/api/agents/status` | GET | Agent health |
| `/api/settings` | GET/PUT | Configuration |
| `/api/config/draft` | GET/PUT | Draft config editing |
| `/api/config/promote` | POST | Promote config (PAPER → LIVE) |
| `/api/system/trigger-cycle` | POST | On-demand OODA cycle |
| `/api/backtest` | POST | Create & execute backtest |

---

## 11. Python Services

### packages/research/ - Backtesting

**VectorBT Runner** (`cream/backtest/runner.py`):
- Standalone Python script spawned as subprocess
- Streams JSON events over stdout (progress, trades, equity, completion)
- No gRPC required - works in docker-compose

```python
# Usage (called from dashboard-api)
python -m cream.backtest.runner --config '{"backtestId": "...", "dataPath": "..."}'

# Output: One JSON object per line
{"type": "progress", "pct": 30, "phase": "running_simulation"}
{"type": "trade", "timestamp": "...", "symbol": "AAPL", ...}
{"type": "completed", "metrics": {"sharpeRatio": 1.2, ...}}
```

### apps/evals/ - Agent Evaluations

```python
# DeepEval integration
from deepeval.metrics import GEval
from deepeval.test_case import LLMTestCase

class AgentEvaluator:
    def evaluate_decision_quality(self, decision: DecisionPlan) -> EvalResult:
        """Evaluate decision against golden dataset."""
        pass

    def evaluate_rationale_coherence(self, rationale: str) -> float:
        """LLM-as-judge for rationale quality."""
        pass
```

### apps/filings-service/ - SEC Ingestion

```python
# SEC EDGAR pipeline
class FilingsService:
    async def fetch_10k(self, cik: str) -> Filing:
        """Fetch annual report."""
        pass

    async def fetch_10q(self, cik: str) -> Filing:
        """Fetch quarterly report."""
        pass

    async def extract_financials(self, filing: Filing) -> Financials:
        """Extract key financial metrics."""
        pass
```

### packages/research/ - Backtesting

```python
# VectorBT integration
from vectorbt import Portfolio

class VectorBTRunner:
    def run_backtest(
        self,
        signals: pd.DataFrame,
        prices: pd.DataFrame,
        config: BacktestConfig
    ) -> BacktestResult:
        """Run vectorized backtest."""
        portfolio = Portfolio.from_signals(
            close=prices,
            entries=signals["entry"],
            exits=signals["exit"],
            fees=config.commission_pct,
        )
        return BacktestResult(
            total_return=portfolio.total_return(),
            sharpe_ratio=portfolio.sharpe_ratio(),
            max_drawdown=portfolio.max_drawdown(),
        )

# NautilusTrader integration
from nautilus_trader.backtest import BacktestEngine

class NautilusRunner:
    def run_event_driven(
        self,
        strategy: Strategy,
        data: MarketData,
        config: BacktestConfig
    ) -> BacktestResult:
        """Run event-driven backtest."""
        pass
```

---

## 12. Testing Strategy

### Test Pyramid

```
                    ┌─────────────────────┐
                    │   Agent Evals       │  (LLM-as-Judge)
                    │   (Golden Dataset)  │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
       ┌──────────┐     ┌──────────┐     ┌──────────┐
       │Integration│     │Integration│     │Integration│
       │  (Turso)  │     │ (HelixDB) │     │  (gRPC)  │
       └─────┬─────┘     └─────┬─────┘     └─────┬─────┘
             │                 │                 │
             └─────────────────┼─────────────────┘
                               │
    ┌──────────────────────────┼──────────────────────────┐
    │                          │                          │
    ▼                          ▼                          ▼
┌──────────┐            ┌──────────┐            ┌──────────┐
│  Unit    │            │  Unit    │            │  Unit    │
│   (TS)   │            │  (Rust)  │            │  (Python)│
└──────────┘            └──────────┘            └──────────┘
```

### CI Workflows

| Workflow | Trigger | Jobs |
|----------|---------|------|
| `test.yml` | Push/PR | TS tests, Rust tests, Python tests, Lint |
| `buf-check.yml` | Push/PR | Proto lint, breaking changes, codegen |
| `agent-evals.yml` | PR | Deterministic tests, LLM evaluations, regression |

---

## 13. Observability

### Prometheus Metrics

```yaml
# Scrape targets
- execution-engine:9090
- otel-collector:8888
- prometheus:9090

# SLO targets
Order Execution Success: 99.9% (43.2 min/month error budget)
Order Execution P99: <500ms
Market Data Availability: 99.95% (21.6 min/month error budget)
Market Data P99: <10ms
```

### Alert Rules

```yaml
# Fast burn (critical)
- alert: OrderExecutionFastBurn
  expr: |
    (
      sum(rate(order_execution_errors_total[1h])) /
      sum(rate(order_execution_total[1h]))
    ) > (14.4 * (1 - 0.999))
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "Order execution error budget burning fast"

# Operational alerts
- alert: OrderRejectionRate
  expr: |
    sum(rate(order_rejections_total[5m])) /
    sum(rate(order_submissions_total[5m])) > 0.01
  for: 5m
```

### Alert Routing

```yaml
# Critical → PagerDuty + Slack (1h repeat)
# SLO Violations → Slack #alerts-slo (2h repeat)
# Warnings → Email (12h repeat)
```

---

## 14. Build & Deployment

### Local Development

```bash
# Start infrastructure
docker-compose up -d

# Install dependencies
bun install

# Start all services
bun run dev

# Run tests
bun test                    # TypeScript
cargo test --workspace      # Rust
pytest                      # Python (in service directories)
```

### Docker Compose Services

| Service | Image | Ports |
|---------|-------|-------|
| turso | ghcr.io/tursodatabase/libsql-server | 8080, 5001 |
| prometheus | prom/prometheus:v3.4.0 | 9090 |
| alertmanager | prom/alertmanager:v0.28.0 | 9093 |
| otel-collector | otel/opentelemetry-collector-contrib:0.122.0 | 4317, 4318 |
| redis | redis:7-alpine | 6379 |
| dashboard | apps/dashboard/Dockerfile | 3000 |
| dashboard-api | apps/dashboard-api/Dockerfile | 3001 |

### Environment Variables

```bash
# Core
CREAM_ENV=BACKTEST|PAPER|LIVE

# Database
TURSO_DATABASE_URL=http://localhost:8080
HELIX_URL=http://localhost:6969

# Market Data
POLYGON_KEY=xxx
DATABENTO_KEY=xxx
FMP_KEY=xxx

# Broker
ALPACA_KEY=xxx
ALPACA_SECRET=xxx

# LLM
GOOGLE_API_KEY=xxx
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
      "dependsOn": ["build"],
      "outputs": ["coverage/**"],
      "passThroughEnv": ["CREAM_ENV"]
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
bun run dev                 # All services
cargo build --workspace     # Rust
buf generate                # Protobuf

# Testing
CREAM_ENV=BACKTEST bun test
cargo test --workspace
pytest

# Linting
bun run lint                # All
biome check .               # TS
cargo clippy --all-targets  # Rust
ruff check                  # Python

# Coverage
cargo cov                   # Rust → lcov.info
cargo cov-html              # Rust → coverage/
```

### Key File Locations

| Component | Path |
|-----------|------|
| Agent definitions | `/packages/mastra-kit/src/agents/index.ts` |
| Consensus logic | `/packages/mastra-kit/src/consensus.ts` |
| Proto schemas | `/packages/schema/cream/v1/*.proto` |
| Rust engine | `/apps/execution-engine/src/` |
| Dashboard | `/apps/dashboard/src/` |
| API routes | `/apps/dashboard-api/src/routes/` |
| Alerts | `/packages/infra/prometheus/alerts.yml` |
| Runtime config service | `/packages/config/src/runtime-config.ts` |
| Backtest runner | `/packages/research/cream/backtest/runner.py` |
| Config editor | `/apps/dashboard/src/app/(auth)/config/edit/` |
| Config promotion | `/apps/dashboard/src/app/(auth)/config/promote/` |

---

*This document is auto-maintained. Last generated: 2026-01-08*
