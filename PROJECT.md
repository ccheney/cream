# Cream

Agentic trading system for equities and options, combining LLM-based reasoning with deterministic Rust execution.

## Status

**Pre-production** - Core infrastructure implemented, agents in development.

## Quick Start

```bash
# Install dependencies
bun install
cargo build

# Run tests
bun test
cargo test

# Start development
docker-compose up -d  # HelixDB + services
bun run apps/api      # Mastra server
```

## Architecture

Cream runs an hourly OODA loop (Observe → Orient → Decide → Act):

```
┌─────────────────────────────────────────────────────────────────┐
│                         OODA Loop                               │
├─────────────┬─────────────┬─────────────┬─────────────────────┤
│   OBSERVE   │   ORIENT    │   DECIDE    │        ACT          │
├─────────────┼─────────────┼─────────────┼─────────────────────┤
│ Market data │ HelixDB     │ 8-agent     │ Rust execution      │
│ Candles     │ retrieval   │ consensus   │ engine validates    │
│ Positions   │ Indicators  │ network     │ & routes orders     │
│ News/events │ Regime      │ produces    │ via Alpaca          │
│             │ classify    │ plan        │                     │
└─────────────┴─────────────┴─────────────┴─────────────────────┘
```

### Agent Network (8 agents)

1. **Technical Analyst** - Price patterns, support/resistance
2. **News & Sentiment** - Breaking news, social sentiment
3. **Fundamentals & Macro** - Earnings, economic indicators
4. **Bullish Research** - Bull case arguments
5. **Bearish Research** - Bear case arguments
6. **Trader** - Synthesizes plan from all inputs
7. **Risk Manager** - Position sizing, portfolio limits
8. **Critic** - Challenges assumptions, final approval

Plans execute only when **both** Risk Manager and Critic approve.

## Project Structure

```
cream/
├── apps/
│   ├── api/                 # Mastra server (agents + workflows)
│   ├── dashboard/           # React dashboard
│   ├── execution-engine/    # Rust gRPC server
│   └── worker/              # Hourly scheduler
├── packages/
│   ├── broker/              # Alpaca adapter
│   ├── domain/              # Zod schemas, types
│   ├── helix/               # HelixDB client
│   ├── indicators/          # RSI, ATR, SMA, etc.
│   ├── marketdata/          # Polygon, Databento clients
│   ├── mastra-kit/          # Agent prompts, tools
│   ├── regime/              # Market regime classifier
│   ├── schema/              # Protobuf definitions
│   └── universe/            # Symbol resolution
└── docs/plans/              # Architecture documentation
```

## Technology Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun 1.3+, Rust 1.92+ |
| Orchestration | Mastra 0.24+ |
| LLM | Google Gemini |
| Graph + Vector DB | HelixDB |
| Relational DB | Turso |
| Serialization | Protobuf |
| Monorepo | Turborepo |

## Environment Variables

```bash
CREAM_ENV=BACKTEST          # BACKTEST | PAPER | LIVE
DATABENTO_KEY=              # Execution-grade market data
POLYGON_KEY=                # Candles and options data
ALPACA_KEY=                 # Broker API key
ALPACA_SECRET=              # Broker API secret
```

## Testing

```bash
# TypeScript tests
bun test

# Rust tests
cargo test

# Specific package
bun test packages/indicators
```

## Documentation

See `docs/plans/` for detailed architecture:

- `00-overview.md` - System overview
- `01-architecture.md` - Component design
- `05-agents.md` - Agent specifications
- `09-rust-core.md` - Execution engine
- `14-testing.md` - Testing strategy
- `15-implementation.md` - Build phases

## License

Proprietary - All rights reserved.
