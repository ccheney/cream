# @cream/storage

Database abstraction layer for the Cream trading system.

## Overview

Provides:

- **Turso Client** - Multi-backend support (HTTP, sync, local, in-memory)
- **Connection Pooling** - Configurable pool with health checks
- **25+ Repositories** - Type-safe data access
- **Migration System** - Version-controlled schema changes

## Turso Client

```typescript
import { createTursoClient } from "@cream/storage";

const client = await createTursoClient(ctx);

const rows = await client.execute<MyRow>("SELECT * FROM table");
const row = await client.get<MyRow>("SELECT * FROM table WHERE id = ?", [id]);
```

### Connection Types

- **HTTP** (`https://...`) - Remote Turso Cloud
- **Sync** (`libsql://...`) - Local replica with sync
- **Local File** - Direct SQLite
- **In-Memory** - Testing (`:memory:`)

## Repositories

```typescript
import { OrdersRepository, PositionsRepository } from "@cream/storage";

const ordersRepo = new OrdersRepository(client);
const orders = await ordersRepo.list({ filters: { symbol: "AAPL" } });
```

### Available Repositories

| Category | Repositories |
|----------|--------------|
| Trading | Orders, Positions, Decisions, ThesisState |
| Config | TradingConfig, AgentConfigs, UniverseConfigs |
| Market | Candles, RegimeLabels, Indicators |
| External | ExternalEvents, PredictionMarkets, Filings |
| Dashboard | Alerts, AuditLog, UserPreferences |

## Migrations

```bash
# Apply migrations
bun run db:migrate

# Check status
bun run db:status

# Rollback
bun run db:rollback 5

# Seed config
bun run db:seed
```

## Configuration

```bash
CREAM_ENV=BACKTEST|PAPER|LIVE
TURSO_DATABASE_URL=http://localhost:8080
TURSO_AUTH_TOKEN=...  # Optional for cloud
```

Database auto-selected by environment:
- `BACKTEST` → `cream_backtest.db`
- `PAPER` → `cream_paper.db`
- `LIVE` → `cream_live.db`

## Important Notes

- **No CHECK constraints** - Turso doesn't support them; use Zod
- **Single-writer** - SQLite architecture; pool primarily for reads
- **Boolean mapping** - INTEGER (0/1) in database

## Dependencies

- `@libsql/client` - HTTP connections
- `@tursodatabase/database` - Local SQLite
- `@cream/domain` - ExecutionContext
