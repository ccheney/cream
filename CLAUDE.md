# CLAUDE.md

Cream is an agentic trading system for US equities and options combining LLM reasoning with deterministic Rust execution. Runs hourly OODA loops (Observe → Orient → Decide → Act).

## Environment

Single switch controls environment: `CREAM_ENV=PAPER|LIVE`

- **PAPER**: Paper trading with simulated orders but real market data
- **LIVE**: Live trading with real orders and real money

Tests use `NODE_ENV=test` with `CREAM_ENV=PAPER` and `ctx.source="test"` to identify test contexts.

## Tech Stack

| Layer | Technology |
|-------|------------|
| TypeScript | Bun |
| Rust | Edition 2024 |
| Databases | PostgreSQL (Drizzle ORM), HelixDB |
| Serialization | Protobuf (Buf CLI) + Zod |
| Monorepo | Turborepo |
| Linting | Biome, Clippy |
| Infra | OpenTofu |

**Tooling**: asdf manages versions via `.tool-versions` (bun, rust, hcloud, opentofu, postgres).

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
  schema/               # Protobuf definitions (.proto files)
  schema-gen/           # Generated Protobuf stubs (TS/Rust)
  storage/              # PostgreSQL + Drizzle ORM repositories
  tsconfig/             # Shared TypeScript configs
  universe/             # Trading universe resolution
  validation/           # Research-to-production parity validation
```

## Commands

```bash
# Development
bun install # Install TS dependencies
cargo build --workspace # Build all Rust packages
bun run db:migrate  # Run PostgreSQL migrations via Drizzle

# Testing, Linting, formatting, type checking
bun run test # run all tests via turbo
bun run check # TypeScript linting & formatting
bun run lint # All linters for TS + Rust
bun run format # All formatters for TS + Rust
bun run typecheck # TypeScript type checking

# Code Generation
buf generate # Protobuf → TS + Rust stubs
```

## Important

- **Do Your Own Exploration** - Verify assumptions against actual codebase, tests, and documentation
- **Use Context7 for Documentation** - Always query context7 for up-to-date library/API docs (Drizzle, PostgreSQL extensions, pg driver etc.)
- **Ground Assumptions with Research** - Use web search to verify syntax, patterns, version compatibility, and best practices instead of making assumptions

## Code Conventions

- Prefer Bun APIs over Node.js equivalents including websockets (`Bun.file()`, `Bun.serve()`, `Bun.env`, etc.)
- Use `workspace:*` for internal package dependencies
- **Trust self-documenting code.** Do not add comments that restate what the code does. Only add comments when explaining *why* something non-obvious is necessary.
- **Do NOT modify linting rules** without explicit approval
- **Do NOT modify code coverage requirements** or thresholds without explicit approval

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
Use your web search tool to ground all your assumptions and findings.

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
