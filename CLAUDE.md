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

```bash
CREAM_ENV=PAPER              # Environment mode
TURSO_DATABASE_URL=          # Database URL
POLYGON_KEY=                 # Market data (Massive.com)
ALPACA_KEY=                  # Broker API key
ALPACA_SECRET=               # Broker API secret
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
