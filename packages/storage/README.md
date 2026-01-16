# @cream/storage

Database abstraction layer for the Cream trading system.

## Overview

Provides:

- **Drizzle ORM** - Type-safe PostgreSQL client
- **Connection Pooling** - Configurable pool with health checks
- **25+ Repositories** - Type-safe data access
- **Migration System** - drizzle-kit for schema changes

## Database Client

```typescript
import { getDb } from "@cream/storage";

const db = getDb();

// Use Drizzle's type-safe query builder
const orders = await db.select().from(ordersTable).where(eq(ordersTable.symbol, "AAPL"));
```

## Repositories

```typescript
import { OrdersRepository, PositionsRepository } from "@cream/storage";

const ordersRepo = new OrdersRepository();
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
# Generate migration from schema changes
bun run db:generate

# Apply migrations
bun run db:migrate

# Push schema (development)
bun run db:push

# Open Drizzle Studio
bun run db:studio

# Seed config
bun run db:seed
```

## Configuration

```bash
CREAM_ENV=BACKTEST|PAPER|LIVE
DATABASE_URL=postgresql://user:pass@localhost:5432/cream
```

Database selection by environment is handled at the application level.

## Important Notes

- **PostgreSQL 18** - Using pg driver
- **Type-safe queries** - Drizzle ORM with generated types
- **Connection pooling** - Built into the database client

## Dependencies

- `drizzle-orm` - ORM and query builder
- `postgres` - PostgreSQL driver
- `drizzle-kit` - Migration tooling
- `@cream/domain` - ExecutionContext
