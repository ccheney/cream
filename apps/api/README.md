# @cream/api

Mastra orchestration server for the Cream trading system. Runs the hourly OODA loop (Observe → Orient → Decide → Act) with an 8-agent consensus network.

## Overview

This is the core API server that orchestrates trading decisions through:

- **Trading Cycle Workflow** - Hourly OODA loop with 8-agent consensus
- **Prediction Markets Workflow** - 15-minute macro signal fetching from Kalshi/Polymarket
- **Agent Network** - Technical, news, fundamentals analysts; bullish/bearish researchers; trader; risk manager; critic
- **HelixDB Memory** - Case-based reasoning with vector embeddings for decision context
- **gRPC Execution** - Order routing to Rust execution engine

## Architecture

### Workflows

**Trading Cycle** (`src/workflows/trading-cycle.ts`)
- Phase 1: Analysts (technical, news, fundamentals) run in parallel
- Phase 2: Researchers (bullish/bearish debate) run in parallel
- Phase 3: Trader synthesizes initial decision plan
- Phase 4: Consensus loop (risk manager + critic approval) with iteration support
- Phase 5: HelixDB memory update, constraints check, order submission

**Prediction Markets** (`src/workflows/prediction-markets.ts`)
- Fetches macro signals (Fed rate, recession probability, etc.)
- Runs on 15-minute intervals

### Agents

Located in `src/agents/`:
- **stub-agents.ts** - Mock agents returning hardcoded data (BACKTEST mode)
- **mastra-agents.ts** - Real agents using Mastra + Google Gemini (PAPER/LIVE)

### Workflow Steps (`src/steps/`)

- `buildSnapshot.ts` - Market data aggregation
- `retrieveMemory.ts` - HelixDB GraphRAG retrieval
- `persistMemory.ts` - Store decisions to HelixDB
- `loadState.ts` - Load portfolio/config state
- `executeOrders.ts` - Submit orders via execution engine
- `fetchPredictionMarkets.ts` - Get Kalshi/Polymarket data
- `gatherExternalContext.ts` - Aggregate news, sentiment, macro

## Mode Selection

| Mode | Agents | Market Data | Execution |
|------|--------|-------------|-----------|
| BACKTEST | Stub (no LLM) | Deterministic fixtures | Mock orders |
| PAPER | Real Mastra + Gemini | Live via adapters | Real orders (paper) |
| LIVE | Real Mastra + Gemini | Live via adapters | Real orders |

## Configuration

### Environment Variables

```bash
CREAM_ENV=BACKTEST|PAPER|LIVE
TURSO_DATABASE_URL=http://localhost:8080
HELIX_URL=http://localhost:6969
GOOGLE_API_KEY=...  # For LLM agents (PAPER/LIVE)
```

### Runtime Configuration

Loaded from Turso database via `RuntimeConfigService`:
- Agent settings (enabled/disabled, prompt overrides)
- Model selection (`gemini-3-flash-preview` or `gemini-3-pro-preview`)
- Timeouts and consensus parameters
- Trading universe and risk limits

## Development

```bash
# Install dependencies
bun install

# Type-check (watch mode)
bun run dev

# Build
bun run build

# Start server
bun run start

# Run tests
bun test

# Lint
bun run lint
```

## Key Exports

```typescript
export * from "./agents/index.js";
export * from "./grpc/index.js";
export { agents, mastra, tradingCycleWorkflow } from "./mastra/index.js";
export * from "./workflows/index.js";
```

## Dependencies

**Workspace:**
- `@cream/agents` - Agent prompts, tools, consensus logic
- `@cream/helix` - HelixDB GraphRAG client
- `@cream/storage` - Turso repositories
- `@cream/marketdata` - Market data adapters
- `@cream/config` - Runtime config service
- `@cream/domain` - Types, environment validation
- `@cream/broker` - Alpaca integration

**External:**
- `@mastra/core` (1.0.0-beta.14) - Workflow orchestration
- `zod` (4.3.5) - Schema validation

## Important Notes

1. **Consensus Loop** - Risk Manager + Critic must both approve (max 3 iterations)
2. **HelixDB Memory** - Gracefully degrades if unavailable
3. **Error Handling** - Fail-closed for execution failures
4. **Audit Trail** - All decisions logged with config version ID
