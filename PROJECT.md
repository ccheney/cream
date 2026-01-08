# Cream

Agentic trading system for US equities and options combining LLM-based reasoning with deterministic Rust execution. Runs hourly OODA loops (Observe → Orient → Decide → Act) through an 8-agent consensus network.

## Status

**Pre-production** - Core infrastructure implemented, agents in development (Phase 4).

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              OODA Loop (Hourly)                              │
├─────────────────┬─────────────────┬─────────────────┬───────────────────────┤
│     OBSERVE     │      ORIENT     │      DECIDE     │          ACT          │
├─────────────────┼─────────────────┼─────────────────┼───────────────────────┤
│ Market data     │ HelixDB         │ 8-agent         │ Rust execution        │
│ OHLCV candles   │ retrieval       │ consensus       │ engine validates      │
│ Positions       │ Indicators      │ network         │ & routes orders       │
│ News/events     │ Regime classify │ produces plan   │ via Alpaca            │
└─────────────────┴─────────────────┴─────────────────┴───────────────────────┘

                         ┌──────────────────────┐
                         │   Decision Plan      │
                         │   requires DUAL      │
                         │   approval from      │
                         │   Risk Manager AND   │
                         │   Critic             │
                         └──────────────────────┘
```

### Agent Consensus Network (8 Agents)

The system uses an 8-agent network with parallel and sequential execution phases:

| Phase | Agent | Role | Model |
|-------|-------|------|-------|
| **Analysis** (parallel) | Technical Analyst | Price patterns, support/resistance, indicators | Gemini 3 Pro |
| | News Analyst | Breaking news, social sentiment | Gemini 3 Pro |
| | Fundamentals Analyst | Earnings, economic indicators, prediction markets | Gemini 3 Pro |
| **Research** (parallel) | Bullish Researcher | Constructs strongest bull case | Gemini 3 Pro |
| | Bearish Researcher | Constructs strongest bear case | Gemini 3 Pro |
| **Decision** (sequential) | Trader | Synthesizes inputs into DecisionPlan | Gemini 3 Pro |
| **Approval** (parallel) | Risk Manager | Validates against risk constraints | Gemini 3 Flash |
| | Critic | Validates logical consistency, anti-hallucination | Gemini 3 Flash |

**Consensus Rule**: Plans execute only when **both** Risk Manager and Critic approve. Up to 3 revision iterations if rejected.

---

## Technology Stack

| Layer | Technology | Version |
|-------|------------|---------|
| **TypeScript Runtime** | Bun | 1.3+ |
| **TypeScript Compiler** | tsgo (`@typescript/native-preview`) | 7.0+ |
| **Rust** | Edition 2024 | 1.92+ |
| **Python** | uv package manager | 3.14+ |
| **Agent Orchestration** | Mastra | 0.24+ |
| **LLM Provider** | Google Gemini | gemini-3-pro-preview, gemini-3-flash-preview |
| **Graph + Vector DB** | HelixDB | HNSW indexing, 3072D embeddings |
| **Relational DB** | Turso (SQLite) | libsql-server |
| **Serialization** | Protobuf (Buf CLI) + Zod v4 | - |
| **Monorepo** | Turborepo | 2.7+ |
| **Linting** | Biome (TS), Clippy (Rust), Ruff (Python) | - |

---

## Project Structure

```
cream/
├── apps/                           # Applications
│   ├── api/                        # Mastra server (agents + workflows)
│   ├── worker/                     # Hourly scheduler
│   ├── dashboard/                  # Next.js 16 trading dashboard
│   ├── dashboard-api/              # Hono REST + WebSocket API
│   ├── execution-engine/           # Rust gRPC server (~36K lines)
│   ├── evals/                      # Python DeepEval agent evaluations
│   ├── filings-service/            # Python SEC filings ingestion
│   └── vision-service/             # Python chart analysis
│
├── packages/                       # Shared libraries (20 packages)
│   ├── domain/                     # Zod schemas, environment, time utilities
│   ├── config/                     # YAML config loading with Zod validation
│   ├── schema/                     # Protobuf definitions (.proto files)
│   ├── schema-gen/                 # Generated Protobuf stubs (TS/Rust/Python)
│   ├── storage/                    # Turso client, repositories, migrations
│   ├── helix/                      # HelixDB client
│   ├── helix-schema/               # HelixDB schema, CBR logic
│   ├── broker/                     # Alpaca Markets integration
│   ├── marketdata/                 # Polygon/Databento adapters
│   ├── universe/                   # Trading universe resolution
│   ├── indicators/                 # Technical indicators (RSI, ATR, SMA)
│   ├── regime/                     # Market regime classification
│   ├── metrics/                    # Risk-adjusted performance metrics
│   ├── mastra-kit/                 # Agent prompts, tools, evaluations
│   ├── external-context/           # News, sentiment, fundamentals extraction
│   ├── prediction-markets/         # Kalshi integration
│   ├── validation/                 # Schema parity validation
│   ├── dashboard-types/            # Shared dashboard/API types
│   ├── tsconfig/                   # Shared TypeScript configs
│   ├── infra/                      # Prometheus, Alertmanager configs
│   └── research/                   # Python backtesting (VectorBT, NautilusTrader)
│
└── docs/plans/                     # Architecture documentation
```

---

## Applications

### API (`apps/api`)
Mastra server orchestrating agents and workflows. Implements the OODA loop with 8 stub agents (Phase 4).

**Entry**: `bun run --watch src/index.ts`
**Port**: 4111

### Worker (`apps/worker`)
Hourly scheduler triggering trading cycles aligned to candle closes.

**Entry**: `bun run --watch src/index.ts`
**Schedule**: Every hour at minute 0

### Dashboard (`apps/dashboard`)
Next.js 16 React 19 frontend with Turbopack HMR.

**Tech**: React 19, Zustand, TanStack Query, Lightweight Charts, Framer Motion
**Entry**: `bun run dev`
**Port**: 3000

### Dashboard API (`apps/dashboard-api`)
Hono REST + WebSocket API with JWT auth and OpenAPI docs.

**Entry**: `PORT=3001 bun run --watch src/index.ts`
**Endpoints**: `/health`, `/api/*`, `/ws`, `/docs`

### Execution Engine (`apps/execution-engine`)
Rust gRPC server for deterministic order validation and routing (~36,115 lines).

**Entry**: `cargo run --bin execution-engine`
**Ports**: 50051 (gRPC), 50052 (Arrow Flight)

**Capabilities**:
- DecisionPlan validation against risk constraints
- Order routing to Alpaca Markets
- Position sizing (shares, contracts, dollars, % equity)
- Options Greeks calculation
- Execution tactics (PASSIVE_LIMIT, TWAP, VWAP, ICEBERG)
- Backtest simulation with fill models
- Crash recovery and reconciliation

### Evals (`apps/evals`)
DeepEval agent evaluation framework with LLM-as-Judge.

**Entry**: `pytest tests/`
**Framework**: DeepEval, Google Gemini/GPT-4o as judge

### Python Services
- **filings-service**: SEC EDGAR filing retrieval (10-K, 10-Q, 8-K)
- **vision-service**: Chart pattern recognition (Pillow, OpenCV)

---

## Key Packages

### Core Domain
| Package | Purpose |
|---------|---------|
| `@cream/domain` | Zod schemas, calendar, clock validation, decision types |
| `@cream/config` | YAML loading, feature flags, secrets management |
| `@cream/schema` | Protobuf definitions (common, decision, execution, events) |
| `@cream/schema-gen` | Generated stubs for TS, Rust, Python |

### Data Layer
| Package | Purpose |
|---------|---------|
| `@cream/storage` | Turso client, repositories, migrations (26 tables) |
| `@cream/helix` | HelixDB client (vector search, graph traversal) |
| `@cream/helix-schema` | 9 node types, 11 edge types, CBR logic |
| `@cream/marketdata` | Polygon, Databento, FMP adapters |

### Trading Logic
| Package | Purpose |
|---------|---------|
| `@cream/broker` | Alpaca adapter with multi-leg options |
| `@cream/indicators` | RSI, MACD, ATR, SMA, Bollinger Bands |
| `@cream/regime` | Market regime classification (rule-based, GMM) |
| `@cream/universe` | Universe resolution with survivorship bias prevention |
| `@cream/metrics` | Sharpe, Sortino, Calmar ratios, drawdown |

### Agent System
| Package | Purpose |
|---------|---------|
| `@cream/mastra-kit` | 8-agent configs, prompts, consensus gate, tools |
| `@cream/external-context` | Claude extraction pipeline for news/sentiment |
| `@cream/prediction-markets` | Kalshi/Polymarket integration |

### Testing
| Package | Purpose |
|---------|---------|
| `@cream/validation` | Research→production parity checks |

---

## Database Architecture

### Dual Database Design

| Database | Purpose | Data |
|----------|---------|------|
| **HelixDB** | Graph + Vector | Trade memory, semantic relationships, document embeddings |
| **Turso** | Relational | Decisions, orders, positions, config, backtests |

### HelixDB Schema

**9 Node Types**: TradeDecision, TradeLifecycleEvent, ExternalEvent, FilingChunk, TranscriptChunk, NewsItem, Company, MacroEntity, ThesisMemory

**11 Edge Types**: INFLUENCED_DECISION, FILED_BY, TRANSCRIPT_FOR, MENTIONS_COMPANY, RELATES_TO_MACRO, RELATED_TO, DEPENDS_ON, AFFECTED_BY, MENTIONED_IN, HAS_EVENT, THESIS_INCLUDES

**Vector Search**: HNSW indexing with Gemini 3072D embeddings, <2ms latency, 90% recall@k10

**Retrieval**: Hybrid GraphRAG with Reciprocal Rank Fusion (k=60)

### Turso Schema (26 Tables)

**Migration 001**: decisions, agent_outputs, orders, positions, position_history, portfolio_snapshots, config_versions

**Migration 002**: alerts, system_state, backtests, backtest_trades, backtest_equity, user_preferences

**Migration 003**: candles, corporate_actions, universe_cache, features, regime_labels

**Migration 004**: thesis_state, thesis_state_history

**Migration 005**: index_constituents, ticker_changes, universe_snapshots

**Migration 006**: prediction_market_snapshots, prediction_market_signals, prediction_market_arbitrage

---

## Commands

### Development
```bash
bun install                         # Install TS dependencies
cargo build --workspace             # Build Rust
uv pip install -e ".[dev]"          # Install Python (in app/package dir)
bun run dev                         # Start all services (Turborepo)
```

### Testing
```bash
bun test                            # All TS tests (CREAM_ENV=BACKTEST)
bun test packages/domain            # Single package
cargo test --workspace              # Rust tests
pytest                              # Python tests
```

### Linting & Formatting
```bash
bun run lint                        # All linters (TS + Rust + Python)
bun run format                      # All formatters
biome check .                       # TS/JS only
cargo clippy --all-targets          # Rust only
ruff check                          # Python only
```

### Coverage
```bash
cargo cov                           # Rust → lcov.info
cargo cov-html                      # Rust → coverage/
cargo cov-check                     # Verify 80% threshold
```

### Code Generation
```bash
buf generate                        # Protobuf → TS + Rust + Python stubs
```

### Docker
```bash
docker compose up -d                # Start infrastructure (Turso, Prometheus, Redis)
docker compose logs -f              # View logs
docker compose down -v              # Stop and remove
```

---

## Environment Variables

### Core
```bash
CREAM_ENV=BACKTEST                  # BACKTEST | PAPER | LIVE
CREAM_BROKER=ALPACA                 # Broker selection
```

### Databases
```bash
TURSO_DATABASE_URL=file:local.db    # Local SQLite or Turso URL
HELIX_URL=http://localhost:6969    # HelixDB endpoint
```

### Market Data
```bash
DATABENTO_KEY=                      # Execution-grade market data
POLYGON_KEY=                        # Candles and options (Massive.com)
FMP_KEY=                            # Fundamentals
```

### Broker
```bash
ALPACA_KEY=                         # Alpaca API key
ALPACA_SECRET=                      # Alpaca API secret
```

### LLM
```bash
GOOGLE_API_KEY=                     # Gemini models
```

### Dashboard API
```bash
PORT=3001                           # Server port
JWT_SECRET=                         # Auth secret
RUST_GRPC_URL=http://localhost:50051
MASTRA_API_URL=http://localhost:4111
```

---

## Testing Infrastructure

### Test Frameworks
| Language | Framework | Config |
|----------|-----------|--------|
| TypeScript | bun:test | bunfig.toml |
| Rust | cargo test + mockall | Cargo.toml |
| Python | pytest + pytest-asyncio | pyproject.toml |

### Coverage Tiers
| Tier | Packages | Line/Branch/Function |
|------|----------|---------------------|
| Critical | execution-engine, broker, domain | 90/85/90% |
| Core | indicators, helix, schema | 80/75/80% |
| Standard | api, research | 70/65/70% |
| Agent | mastra-kit | 60/50/60% |

### Test Data
- **Golden datasets**: Snapshot-based regression testing
- **Testcontainers**: Docker-based integration tests

### Agent Evaluations
- **DeepEval**: Task completion, G-Eval, answer relevancy
- **Braintrust**: Experiment tracking, custom scorers
- **LLM-as-Judge**: Gemini/GPT-4o for semantic evaluation

---

## CI/CD

### GitHub Actions Workflows

**test.yml** (main CI):
- Path-based filtering (only run affected tests)
- Parallel jobs: unit-ts, unit-rust, unit-python, integration, lint
- Test gate for merge requirements

**buf-check.yml**:
- Proto linting and breaking change detection
- Code generation verification

**agent-evals.yml**:
- Deterministic tests (mock LLM)
- LLM-as-Judge evaluations (non-draft PRs)
- Semantic similarity validation

---

## Decision Plan Schema

All trading decisions follow this structure:

```typescript
interface DecisionPlan {
  cycleId: string;
  asOfTimestamp: ISO8601Timestamp;
  environment: "BACKTEST" | "PAPER" | "LIVE";
  decisions: Decision[];
}

interface Decision {
  instrument: Instrument;
  action: "BUY" | "SELL" | "HOLD" | "INCREASE" | "REDUCE" | "NO_TRADE";
  direction: "LONG" | "SHORT" | "FLAT";
  size: { quantity: number; unit: "SHARES" | "CONTRACTS"; };
  riskLevels: {
    stopLossLevel: number;      // MANDATORY
    takeProfitLevel: number;    // MANDATORY
  };
  strategyFamily: "TREND" | "MEAN_REVERSION" | "EVENT_DRIVEN" | "VOLATILITY";
  rationale: string;
  confidence: number;           // [0.0, 1.0]
}
```

**Validation**: Minimum 1.5:1 risk-reward ratio enforced.

---

## Risk Constraints

The execution engine enforces these limits before order submission:

### Per-Instrument
- Max units: 1,000 shares/contracts
- Max notional: $50,000
- Max % equity: 10%

### Portfolio
- Max gross notional: $500,000
- Max net notional: $250,000
- Max leverage: 2.0x

### Options Greeks
- Max delta notional: $100,000
- Max gamma: 1,000
- Max vega: $5,000
- Max theta: -$500/day

### Prediction Markets
- No new entries within 24h of high-uncertainty events
- Reduce sizing 30% when macro uncertainty > 0.6

---

## Development Workflow

### Starting All Services

```bash
# Terminal 1: Execution Engine
cd apps/execution-engine && cargo run

# Terminal 2: API
cd apps/api && bun run --watch src/index.ts

# Terminal 3: Worker
cd apps/worker && bun run --watch src/index.ts

# Terminal 4: Dashboard API
cd apps/dashboard-api && PORT=3001 bun run --watch src/index.ts

# Terminal 5: Dashboard
cd apps/dashboard && bun run dev
```

### Building for Production

```bash
# TypeScript
bun build src/index.ts --outdir dist --target bun

# Next.js Dashboard
cd apps/dashboard && bun run build

# Rust
cargo build --release

# Python
uv pip install -e "."
```

---

## Documentation

Detailed architecture docs in `docs/plans/`:

| Document | Content |
|----------|---------|
| `00-overview.md` | System overview, constraints |
| `01-architecture.md` | Component design, data flow |
| `05-agents.md` | Agent specifications, prompts |
| `09-rust-core.md` | Execution engine design |
| `14-testing.md` | Testing strategy |
| `15-implementation.md` | Build phases |
| `16-tech-stack.md` | Technology decisions |

---

## License

AGPL-3.0-only
