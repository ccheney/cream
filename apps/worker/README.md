# @cream/worker

Hourly scheduler for the Cream trading system. Orchestrates OODA loops, prediction markets, and SEC filings ingestion.

## Overview

Runs three critical workflows:

1. **Trading Cycle** (~hourly) - Full trading decision loop with 8-agent consensus
2. **Prediction Markets** (~15 min) - Macro signals from Kalshi/Polymarket
3. **SEC Filings Sync** (daily 6 AM ET) - Filing ingestion into HelixDB

## Key Components

### Entry Point (`src/index.ts`)

- Scheduler state machine
- Runtime config loading from database
- Config reload on SIGHUP
- Health endpoint on port 3002

### Database (`src/db.ts`)

- Turso client singleton
- RuntimeConfigService for active config
- HelixDB client initialization

### Market Data (`src/marketdata.ts`)

- gRPC subscription to execution engine
- Real-time market data streaming

### Monitors (`src/monitors/`)

- Options expiration handling
- DTE-based thresholds
- Pin risk detection

## Configuration

### Environment Variables

```bash
CREAM_ENV=BACKTEST|PAPER|LIVE
TURSO_DATABASE_URL=http://localhost:8080
HELIX_HOST=localhost
HELIX_PORT=6969
FMP_KEY=...                    # Required for non-BACKTEST
GOOGLE_GENERATIVE_AI_API_KEY=... # For agent execution
```

### Optional

```bash
RUN_ON_STARTUP=false           # Run cycles immediately
SCHEDULER_DISABLED=false       # Health endpoint only
HEALTH_PORT=3002              # Health endpoint port
```

## Health Endpoint

```bash
# GET /health
curl http://localhost:3002/health

# POST /reload (hot-reload config)
curl -X POST http://localhost:3002/reload
```

Returns:
- `status` - "ok" if healthy
- `uptime_ms` - Time since startup
- `intervals` - Trading cycle and prediction markets intervals
- `last_run` - Last execution times
- `running` - Currently executing workflows

## Development

```bash
# Watch mode
bun run dev

# Build
bun run build

# Start
bun run start

# Test
bun test
```

## Startup Requirements

- **Database** - Config must be seeded (`bun run db:seed`)
- **HelixDB** - Required for PAPER/LIVE
- **FMP_KEY** - Required for non-BACKTEST

## Execution Guarantee

- **At-least-once** - Each cycle runs at scheduled time
- **No overlap** - Skips if previous cycle still running
- **Graceful shutdown** - Stops schedulers on SIGINT/SIGTERM

## Dependencies

- `@cream/api` - Workflow definitions
- `@cream/config` - RuntimeConfigService
- `@cream/domain` - ExecutionContext, gRPC clients
- `@cream/filings` - SEC filing ingestion
- `@cream/helix` - HelixDB client
- `@mastra/core` - Workflow orchestration
