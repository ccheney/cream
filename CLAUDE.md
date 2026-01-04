# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cream is an **agentic trading system** for equities and options that combines LLM-based reasoning with deterministic Rust execution. It runs an hourly OODA loop (Observe → Orient → Decide → Act) to make trading decisions.

**Status:** Pre-implementation (planning/documentation complete, ready to build)

**Key characteristics:**
- Environments: BACKTEST, PAPER, LIVE (single switch via `CREAM_ENV`)
- Trading scope: US equities + listed options (no crypto)
- Decision cadence: Hourly, aligned to 1-hour candle closes
- Decision method: 8-agent consensus with deterministic Rust validation

## Technology Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun v1.3+ (TypeScript), Rust 1.92+, Python 3.15+ (uv) |
| Orchestration | Mastra v0.18+ (agents + workflows) |
| LLM | Google Gemini (gemini-3-pro-preview, gemini-3-flash-preview) |
| Graph + Vector DB | HelixDB (HelixQL queries) |
| Relational DB | Turso (SQLite-compatible, embedded replicas, encryption) |
| Serialization | Protobuf (Buf CLI) + Zod v4 mirrors |
| Monorepo | Turborepo v2.0+ |

### Turso Database

Turso Database is our SQLite-compatible database - a Rust rewrite of SQLite with async-first design:

| Feature | Description |
|---------|-------------|
| **Architecture** | In-process embedded database (not a server) |
| **TypeScript SDK** | `@tursodatabase/database` with `connect()` |
| **Sync SDK** | `@tursodatabase/sync` for remote sync capability |
| **Rust SDK** | `turso` crate |
| **Storage wrapper** | `@cream/storage` package with `createTursoClient()` |
| **Embedded sync** | Local-first with remote sync via `@tursodatabase/sync` |
| **Encryption** | At-rest encryption support |

**Note:** Turso Database is the Rust rewrite of SQLite (beta), replacing the older libSQL fork approach.

**Environment variables:**
- `TURSO_DATABASE_URL` - Remote sync URL (optional, for sync mode)
- `TURSO_AUTH_TOKEN` - Auth token for remote sync

**Usage:**
```typescript
import { createTursoClient, createInMemoryClient } from "@cream/storage";

// Production: auto-configured based on CREAM_ENV
const client = await createTursoClient();

// Testing: in-memory database
const testClient = await createInMemoryClient();

// Execute queries
const users = await client.execute<{ id: number; name: string }>(
  "SELECT * FROM users WHERE active = ?",
  [true]
);

// Cleanup
client.close();
```

**References:**
- [Turso Database](https://github.com/tursodatabase/turso)
- [@tursodatabase/database](https://www.npmjs.com/package/@tursodatabase/database)

### Bun Ecosystem (All-in-One)

Bun is our unified TypeScript toolchain. Use Bun for **everything** in TypeScript/JavaScript:

| Capability | Bun Feature | Replaces |
|------------|-------------|----------|
| **Runtime** | `bun run` | Node.js |
| **Package Manager** | `bun install`, `bun add` | npm, yarn, pnpm |
| **Test Runner** | `bun test`, `bun:test` | Jest, Vitest, Mocha |
| **Bundler** | `bun build` | Webpack, esbuild, Rollup |
| **HTTP Server** | `Bun.serve()` | Express, Fastify (for simple servers) |
| **Environment** | `Bun.env`, `process.env` (native) | dotenv package |
| **File I/O** | `Bun.file()`, `Bun.write()` | fs module (for Bun-optimized I/O) |

**Key principles:**
- Always prefer `bun` commands over `npm`/`yarn`/`pnpm`
- Use `bun:test` for all TypeScript tests (built-in coverage with `--coverage`)
- Use `Bun.serve()` for HTTP endpoints where appropriate
- Access environment variables via `Bun.env` or `process.env` (no dotenv needed)
- Use `bun build` for any bundling needs

## Build Commands (Planned)

```bash
# Infrastructure
docker-compose up -d           # Start HelixDB + Turso
bun install                    # Install TS dependencies
cargo build                    # Build Rust execution engine

# Development
bun run apps/api               # Start Mastra server
bun run apps/worker            # Start hourly scheduler
cargo run --bin execution-engine  # Start Rust gRPC server (port 50051)

# Testing
bun test                       # Run all TS tests
bun test packages/domain       # Run specific package tests
cargo test                     # Run Rust tests
pytest                         # Run Python tests

# Code generation
buf generate                   # Generate Protobuf stubs (TS + Rust)

# Linting
biome check                    # TypeScript/JS linting
cargo clippy                   # Rust linting
ruff check                     # Python linting
```

## Monorepo Structure

**Note:** The following structure represents the planned architecture. The project is currently in pre-implementation status. Directories will be created during the phased implementation (see Phase 1-2 in `docs/plans/15-implementation.md`).

```
cream/
  apps/                     [Phase 1-12: To be created]
    api/                    # Mastra server (agents + workflows + HTTP) [Phase 4]
    worker/                 # Hourly scheduler for tradingCycleWorkflow [Phase 4]
    evals/                  # Replay + ablation harness [Phase 12]
    execution-engine/       # Rust core (gRPC, order routing, constraints) [Phase 3]
    filings-service/        # Python (transcripts/filings → HelixDB) [Phase 10]
    vision-service/         # Python (chart features, computer vision) [Phase 10]

  packages/                 [Phase 2-11: To be created]
    schema/                 # Protobuf definitions (.proto) + Buf config [Phase 2]
    domain/                 # Zod schemas (mirrors Protobuf) [Phase 2]
    helix-schema/           # HelixDB schema + HelixQL helpers [Phase 7]
    storage/                # Turso client wrapper (@tursodatabase/database) [Phase 5]
    marketdata/             # Polygon/Massive adapters [Phase 5]
    universe/               # Universe resolution (index constituents, ETF holdings, screeners) [Phase 5]
    indicators/             # Technical indicators (RSI, ATR, SMA, etc.) [Phase 6]
    regime/                 # Regime classification [Phase 6]
    broker/                 # Broker adapters (Alpaca) [Phase 3]
    mastra-kit/             # Agent prompts, tools, utilities [Phase 4]

  infrastructure/           [Phase 1: To be created]
    docker-compose.yml      # HelixDB + Turso + services

  docs/plans/               [Existing: Complete]
    00-overview.md          # Architecture documentation (16 documents)
    ...
```

## Architecture

### Polyglot OODA Loop

- **Observe:** Rust ingests execution signals; TypeScript gathers candle + semantic context
- **Orient:** HelixDB retrieval (vector + graph); deterministic indicators + regime classification
- **Decide:** 8-agent Mastra network produces plan; Rust validates constraints
- **Act:** Limit orders for entries, market orders for exits; atomic multi-leg for options

### Agent Network (8 agents)

1. Technical Analyst
2. News & Sentiment Analyst
3. Fundamentals & Macro Analyst
4. Bullish Research Agent
5. Bearish Research Agent
6. Trader Agent (synthesizes plan)
7. Risk Manager Agent (APPROVE/REJECT)
8. Critic Agent (APPROVE/REJECT)

**Consensus rule:** Plan proceeds only when BOTH Risk Manager AND Critic approve.

### DecisionPlan

Every decision must include:
- Action: BUY, SELL, HOLD, CLOSE
- Direction: LONG, SHORT, FLAT
- Size: Always explicit with unit (SHARES, CONTRACTS, DOLLARS, PCT_EQUITY)
- Stop-loss: Mandatory for all new positions
- Take-profit: Target price
- Strategy family and time horizon
- Rationale with bullish/bearish factors

## Data Providers

| Provider | Role |
|----------|------|
| Databento | Execution-grade feed (quotes, order book) → Rust |
| Massive.com (Polygon) | Cognitive feed (candles, option chains) → TypeScript |
| FMP | Transcripts, filings, sentiment, **index constituents** → HelixDB + Universe |
| Alpha Vantage | Macro indicators → regime context |

**Note:** Polygon.io rebranded to Massive.com (Oct 2025). API endpoints remain compatible but will transition to api.massive.com.

**Universe Selection:** Configurable trading universe supporting static ticker lists, index constituents (S&P 500, NASDAQ-100, Dow Jones, Russell), ETF holdings, and dynamic screeners. See `docs/plans/11-configuration.md` for details.

## Brokerage

- **Primary:** Alpaca Markets (commission-free, multi-leg options, paper + live)

## Environment Variables

```bash
CREAM_ENV=PAPER              # BACKTEST | PAPER | LIVE
CREAM_BROKER=ALPACA          # ALPACA
TURSO_DATABASE_URL=          # Database URL (http://turso:8080 or file:local.db)
TURSO_AUTH_TOKEN=            # Optional: Turso Cloud auth token
DATABENTO_KEY=               # Execution-grade market data
POLYGON_KEY=                 # Cognitive market data
FMP_KEY=                     # Fundamentals & transcripts
ALPHAVANTAGE_KEY=            # Macro indicators
ALPACA_KEY=                  # Broker API key
ALPACA_SECRET=               # Broker API secret
```

## Implementation Phases

The project follows a 12-phase implementation plan (see `docs/plans/15-implementation.md`):

1. Infrastructure (Docker + monorepo)
2. Schema & Contracts (Protobuf + Zod)
3. Rust Core (gRPC + Alpaca paper)
4. TS Workflow Skeleton (Mastra hourly cycle)
5. Data Pipeline (candles → snapshot)
6. Feature Stack (indicators + regime)
7. Memory & Retrieval (HelixDB operational)
8. Agent Network (multi-agent consensus)
9. Options Support (multi-leg strategies)
10. Ingestion Pipeline (filings/transcripts)
11. Research Stack (NautilusTrader + Vectorbt)
12. Evaluator & Replay (evaluation harness)

## Known Risks & Mitigations

- **HelixDB:** Early-stage (released Feb 2025). Implement export mechanisms for data portability.
- **Bun workspaces:** Known hoisting issues. Use `--cwd` flag for workspace-specific installs.
- **Mastra v1:** Limited production testing before Jan 2026 release. Have Temporal as fallback.

## Key Documentation

Start with `docs/plans/00-overview.md`, then reference:
- `01-architecture.md` — Component design
- `05-agents.md` — Agent specs + prompts
- `06-decision-contract.md` — DecisionPlan schema
- `09-rust-core.md` — Execution engine
- `14-testing.md` — Testing strategy
- `15-implementation.md` — Build phases
- `16-tech-stack.md` — Technology choices
