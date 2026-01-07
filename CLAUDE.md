# CLAUDE.md

Cream is an agentic trading system for US equities and options combining LLM reasoning with deterministic Rust execution. Runs hourly OODA loops (Observe → Orient → Decide → Act).

## Tech Stack

| Layer | Technology |
|-------|------------|
| TypeScript | Bun v1.3+, tsgo v7 (`@typescript/native-preview`) |
| Rust | Edition 2024, cargo-llvm-cov for coverage |
| Python | 3.14+ via uv |
| Orchestration | Mastra v0.24+ |
| Databases | Turso (SQLite), HelixDB (graph + vector) |
| Serialization | Protobuf (Buf CLI) + Zod v4 |
| Monorepo | Turborepo v2.7+ |
| Linting | Biome (TS), Clippy (Rust), Ruff (Python) |

## Structure

```
apps/
  api/                  # Mastra server (agents + workflows)
  worker/               # Hourly scheduler
  dashboard/            # Next.js 16 trading dashboard
  dashboard-api/        # Hono REST + WebSocket API
  execution-engine/     # Rust gRPC server (order routing, risk)
  evals/                # Python DeepEval agent evaluations
  filings-service/      # Python SEC filings ingestion
  vision-service/       # Python chart analysis

packages/
  domain/               # Zod schemas, environment, time utilities
  config/               # YAML config loading with Zod validation
  schema/               # Protobuf definitions (.proto files)
  schema-gen/           # Generated Protobuf stubs (TS/Rust)
  storage/              # Turso client wrapper
  helix/                # HelixDB client
  helix-schema/         # HelixDB schema definitions
  broker/               # Alpaca Markets integration
  marketdata/           # Polygon/Massive adapters
  universe/             # Trading universe resolution
  indicators/           # Technical indicators (RSI, ATR, SMA)
  regime/               # Market regime classification
  metrics/              # Risk-adjusted performance metrics
  mastra-kit/           # Agent prompts, tools, evaluations
  external-context/     # News, sentiment, fundamentals extraction
  prediction-markets/   # Kalshi integration
  recovery/             # State recovery utilities
  validation/           # Schema parity validation
  mocks/                # Test mocks for broker, marketdata, LLM
  test-fixtures/        # Factories, golden files, testcontainers
  design-system/        # Tailwind config, design tokens
  dashboard-types/      # Shared dashboard/API types
  tsconfig/             # Shared TypeScript configs
  infra/                # Prometheus, Alertmanager configs
  research/             # Python backtesting (VectorBT, NautilusTrader)
```

## Commands

```bash
# Development
bun install                         # Install TS dependencies
bun run dev                         # Start all services (Turborepo)
cargo build --workspace             # Build Rust
uv pip install -e ".[dev]"          # Install Python package (in app/package dir)

# Testing
bun test                            # All TS tests (sets CREAM_ENV=BACKTEST)
bun test packages/domain            # Single package
cargo test --workspace              # Rust tests
pytest                              # Python tests

# Linting & Formatting
bun run lint                        # All linters (TS + Rust + Python)
bun run format                      # All formatters
biome check .                       # TS/JS only
cargo clippy --all-targets          # Rust only
ruff check                          # Python only

# Coverage
cargo cov                           # Rust → lcov.info
cargo cov-html                      # Rust → coverage/

# Code Generation
buf generate                        # Protobuf → TS + Rust stubs

# Type Checking
bun run typecheck                   # All TS packages
```

## Environment

Single switch controls environment: `CREAM_ENV=BACKTEST|PAPER|LIVE`

### Required by Environment

| Variable | BACKTEST | PAPER | LIVE | Description |
|----------|----------|-------|------|-------------|
| `CREAM_ENV` | ✓ | ✓ | ✓ | Trading environment |
| `ALPACA_KEY` | - | ✓ | ✓ | Alpaca API key |
| `ALPACA_SECRET` | - | ✓ | ✓ | Alpaca API secret |
| `POLYGON_KEY` | - | - | ✓ | Polygon/Massive API key |
| `DATABENTO_KEY` | - | - | ✓ | Databento API key |
| `ANTHROPIC_API_KEY` or `GOOGLE_API_KEY` | - | - | ✓ | LLM API key |

### All Environment Variables

```bash
# Core (required)
CREAM_ENV=BACKTEST           # BACKTEST | PAPER | LIVE
CREAM_BROKER=ALPACA          # Broker (default: ALPACA)

# Database
TURSO_DATABASE_URL=          # Turso/libsql URL (default: http://localhost:8080)
TURSO_AUTH_TOKEN=            # Turso Cloud auth token
HELIX_URL=                   # HelixDB URL (default: http://localhost:6969)
HELIX_HOST=                  # HelixDB host (alternative)
HELIX_PORT=                  # HelixDB port (alternative)

# Broker
ALPACA_KEY=                  # Alpaca API key
ALPACA_SECRET=               # Alpaca API secret
ALPACA_BASE_URL=             # Alpaca base URL (auto-set by environment)

# Market Data
POLYGON_KEY=                 # Polygon/Massive API key
DATABENTO_KEY=               # Databento execution-grade data
FMP_KEY=                     # FMP fundamentals/transcripts
ALPHAVANTAGE_KEY=            # Alpha Vantage macro indicators

# LLM
ANTHROPIC_API_KEY=           # Anthropic Claude API key
GOOGLE_API_KEY=              # Google Gemini API key

# Prediction Markets
KALSHI_API_KEY_ID=           # Kalshi API key ID
KALSHI_PRIVATE_KEY_PATH=     # Path to Kalshi private key

# Web Search
TAVILY_API_KEY=              # Tavily API key for web search
```

### Startup Validation

Services validate environment at startup using `@cream/domain`:

```typescript
import { validateEnvironmentOrExit } from "@cream/domain";

// At service startup - fails fast with clear error messages
validateEnvironmentOrExit("dashboard-api", ["TURSO_DATABASE_URL"]);
```

## Testing Conventions

- **IMPORTANT:** Always set `CREAM_ENV=BACKTEST` when running tests
- TS tests use `bun:test` (not Jest/Vitest)
- Rust tests use `cargo test` with `mockall` for mocking
- Python tests use `pytest` with `pytest-asyncio`
- Use `@cream/test-fixtures` for factories and golden files
- Use `testcontainers` for integration tests requiring HelixDB/Turso

## Code Conventions

- Prefer Bun APIs over Node.js equivalents (`Bun.file()`, `Bun.serve()`, etc.)
- Use `workspace:*` for internal package dependencies
- Financial calculations use `rust_decimal` (Rust) or handle precision carefully (TS)
- All trading decisions flow through the 8-agent consensus network
- DecisionPlans require: action, direction, size with unit, stop-loss, take-profit

## Database Limitations (Turso/libSQL)

**IMPORTANT: Do NOT use CHECK constraints in SQL migrations.**

Turso's libsql-server does not support CHECK constraints. Migrations using `CHECK (...)` will fail with:
```
SqliteError: prepare failed: Parse error: CHECK constraints are not supported yet
```

**Workarounds:**
- Document allowed values in comments: `category TEXT NOT NULL, -- Valid: 'a', 'b', 'c'`
- Validate at the application layer using Zod schemas
- Use triggers if database-level enforcement is required

See: [tursodatabase/turso#3753](https://github.com/tursodatabase/turso/issues/3753) - CHECK constraints not yet implemented
