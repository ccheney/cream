# CLAUDE.md

Cream is an agentic trading system for US equities and options combining LLM reasoning with deterministic Rust execution. Runs hourly OODA loops (Observe → Orient → Decide → Act).

## Environment

Single switch controls environment: `CREAM_ENV=BACKTEST|PAPER|LIVE`

## Tech Stack

| Layer | Technology |
|-------|------------|
| TypeScript | Bun |
| Rust | Edition 2024 |
| Python | via uv |
| Databases | Turso (SQLite), HelixDB |
| Serialization | Protobuf (Buf CLI) + Zod |
| Monorepo | Turborepo |
| Linting | Biome, Clippy, Ruff |
| Infra | OpenTofu |

**Tooling**: asdf manages versions via `.tool-versions` (bun, rust, uv, hcloud, opentofu).

## Structure

```
apps/
  api/                  # Mastra server (agents + workflows)
  dashboard/            # Next.js 16 trading dashboard
  dashboard-api/        # Hono REST + WebSocket API
  execution-engine/     # Rust gRPC server (order routing, risk)
  worker/               # Hourly scheduler

packages/
  agents/               # Agent prompts, tools, evaluations
  broker/               # Alpaca Markets integration
  config/               # Runtime config service, Zod schemas, secrets
  dashboard-types/      # Shared dashboard/API types
  domain/               # Zod schemas, environment, time utilities
  external-context/     # News, sentiment, fundamentals extraction
  filings/              # SEC EDGAR filing ingestion (10-K, 10-Q, 8-K)
  helix/                # HelixDB client
  helix-schema/         # HelixDB schema definitions
  indicators/           # Technical indicators (RSI, ATR, SMA)
  infra/                # OpenTelemetry, OpenTofu infrastructure
  logger/               # Structured logging (pino wrapper)
  marketdata/           # Alpaca market data (unified provider)
  metrics/              # Risk-adjusted performance metrics
  prediction-markets/   # Kalshi integration
  regime/               # Market regime classification
  research/             # Python backtesting (VectorBT subprocess runner)
  schema/               # Protobuf definitions (.proto files)
  schema-gen/           # Generated Protobuf stubs (TS/Rust)
  storage/              # Turso client wrapper
  tsconfig/             # Shared TypeScript configs
  universe/             # Trading universe resolution
  validation/           # Research-to-production parity validation
```

## Commands

```bash
# Development
bun install # Install TS dependencies
cargo build --workspace # Build all Rust packages
uv pip install -e ".[dev]" # Install Python dev dependencies
bun run db:migrate  # Run Turso database migrations

# Testing, Linting, formatting, type checking
bun test # run all tests
bun run check # TypeScript linting & formatting
bun run lint # All linters for TS + Rust + Python
bun run format # All formatters for TS + Rust + Python
bun run typecheck # TypeScript type checking

# Code Generation
buf generate # Protobuf → TS + Rust stubs
```

## Code Conventions

- Prefer Bun APIs over Node.js equivalents including websockets (`Bun.file()`, `Bun.serve()`, `Bun.env`, etc.)
- Use `workspace:*` for internal package dependencies
- **Trust self-documenting code.** Do not add comments that restate what the code does. Only add comments when explaining *why* something non-obvious is necessary.
- **Do NOT modify linting rules** without explicit approval
- **Do NOT modify code coverage requirements** or thresholds without explicit approval
- **Do NOT use CHECK constraints in SQL migrations** CHECK constraints not yet implemented See: [tursodatabase/turso#3753](https://github.com/tursodatabase/turso/issues/3753)

## ES2024 TypeScript Patterns

- This codebase uses ES2024 features
- Prefer ES2024 non-mutating methods over their mutating counterparts
- The base tsconfig includes ES2024 and ESNext.Collection for all modern features:

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "lib": ["ES2024", "ESNext.Collection"]
  }
}
```

## Available Tools

Use context7 for exploring libraries and API documentation.
Use your web search tool to ground all your assumptions, findings.

| CLI Tool | Purpose |
|------|---------|
| `gh` | GitHub CLI |
| `hcloud` | Hetzner Cloud CLI |
| `agent-browser` | browser automation CLI |
| `jq` | JSON query & transform |
| `dasel` | Multi-format config (JSON/YAML/TOML/XML) |
| `qsv` | Fast CSV data-wrangling |
| `mlr` (miller) | awk/sed for structured data |
| `rg` (ripgrep) | Fast recursive text search |
| `rga` (ripgrep-all) | Search PDFs/Office/archives |
| `fd` | Modern file finder |
