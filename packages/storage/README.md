# @cream/storage

PostgreSQL persistence layer for the Cream trading system using Drizzle ORM. Provides type-safe database access, environment-isolated connections, and domain-specific repositories.

## Architecture

```mermaid
flowchart TB
    subgraph Apps["Applications"]
        Dashboard[dashboard-api]
        Worker[worker]
        Mastra[mastra]
    end

    subgraph Storage["@cream/storage"]
        Repos[Repositories]
        Schema[Schema Definitions]
        DB[Database Client]
        Pool[Connection Pool]
    end

    subgraph PostgreSQL["PostgreSQL"]
        Paper[(cream_paper)]
        Live[(cream)]
    end

    Apps --> Repos
    Repos --> Schema
    Repos --> DB
    DB --> Pool
    Pool -->|CREAM_ENV=PAPER| Paper
    Pool -->|CREAM_ENV=LIVE| Live
```

## Environment Isolation

All data is scoped by `CREAM_ENV` environment variable:

| Environment | Database | Purpose |
|-------------|----------|---------|
| `PAPER` | `cream_paper` | Paper trading, testing, development |
| `LIVE` | `cream` | Live trading with real money |

Connection routing:
- `CREAM_ENV=PAPER` uses `DATABASE_URL_PAPER` (fallback: `DATABASE_URL`)
- `CREAM_ENV=LIVE` uses `DATABASE_URL`
- `NODE_ENV=test` uses `TEST_DATABASE_URL`

## Database Schema

```mermaid
erDiagram
    cycles ||--o{ decisions : triggers
    cycles ||--o{ cycle_events : logs
    decisions ||--o{ agent_outputs : has
    decisions ||--o{ orders : generates
    thesis_state ||--o{ thesis_state_history : transitions

    user ||--o{ session : has
    user ||--o{ account : links
    user ||--|| alert_settings : configures
    user ||--|| user_preferences : sets

    cycles {
        uuid id PK
        environment environment
        cycle_status status
        timestamp started_at
        cycle_phase current_phase
        integer decisions_count
    }

    decisions {
        uuid id PK
        uuid cycle_id FK
        text symbol
        decision_action action
        decision_direction direction
        numeric confidence_score
        decision_status status
    }

    orders {
        uuid id PK
        uuid decision_id FK
        text symbol
        order_side side
        numeric qty
        order_status status
        text broker_order_id
    }

    thesis_state {
        uuid thesis_id PK
        text instrument_id
        thesis_state_value state
        numeric conviction
        numeric current_stop
        numeric current_target
    }
```

### Schema Modules

| Module | Tables | Purpose |
|--------|--------|---------|
| `core-trading` | decisions, orders, cycles, cycle_events, portfolio_snapshots | OODA loop execution |
| `thesis` | thesis_state, thesis_state_history | Position thesis tracking |
| `config` | trading_config, agent_configs, universe_configs, constraints_config | Runtime configuration |
| `auth` | user, session, account, verification, two_factor | Authentication (better-auth) |
| `market-data` | candles, corporate_actions, features, regime_labels, universe_cache | Price and indicator data |
| `indicators` | fundamental_indicators, short_interest_indicators, sentiment_indicators, options_indicators_cache | Computed signals |
| `external` | prediction_market_snapshots, external_events, filings, macro_watch_entries | External data sources |
| `dashboard` | alerts, system_state | UI state |
| `audit` | audit_log, parity_validation_history | Compliance tracking |
| `universe` | index_constituents, ticker_changes, universe_snapshots | Point-in-time universe |
| `user-settings` | alert_settings, user_preferences | Per-user preferences |

## Repository Pattern

Repositories provide domain-specific data access with type-safe queries:

```mermaid
classDiagram
    class Repository {
        -db: Database
        +create(input) T
        +findById(id) T | null
        +findByIdOrThrow(id) T
        +findMany(filters, pagination) PaginatedResult
        +update(id, data) T
        +delete(id) boolean
    }

    class DecisionsRepository {
        +findByCycle(cycleId) Decision[]
        +findRecent(env, limit) Decision[]
        +updateStatus(id, status) Decision
        +countByStatus(env) Record
        +getDecisionAnalytics(filters) Analytics
        +getConfidenceCalibration(filters) Bin[]
    }

    class CyclesRepository {
        +findRunning(env) Cycle
        +findRecent(env, limit) Cycle[]
        +complete(id, result) Cycle
        +fail(id, error) Cycle
        +addEvent(input) CycleEvent
        +reconstructStreamingState(id) State
    }

    Repository <|-- DecisionsRepository
    Repository <|-- CyclesRepository
```

### Usage

```typescript
import { getDb, DecisionsRepository, OrdersRepository } from "@cream/storage";

// Singleton database client (lazy initialization)
const db = getDb();

// Repository with injected database (testable)
const decisions = new DecisionsRepository(db);
const orders = new OrdersRepository(db);

// Create a decision
const decision = await decisions.create({
  cycleId: "...",
  symbol: "AAPL",
  action: "BUY",
  direction: "LONG",
  size: 100,
  environment: "PAPER",
});

// Query with filters
const { data, total } = await decisions.findMany(
  { status: "pending", environment: "PAPER" },
  { limit: 20, offset: 0 }
);

// Analytics
const analytics = await decisions.getDecisionAnalytics({
  environment: "PAPER",
  fromDate: "2024-01-01",
});
```

## Data Flow

```mermaid
sequenceDiagram
    autonumber
    participant W as Worker
    participant M as Mastra
    participant S as @cream/storage
    participant DB as PostgreSQL

    W->>S: CyclesRepository.create()
    S->>DB: INSERT cycles
    DB-->>S: cycle

    loop OODA Phases
        M->>S: DecisionsRepository.create()
        S->>DB: INSERT decisions
        M->>S: AgentOutputsRepository.create()
        S->>DB: INSERT agent_outputs
    end

    alt Decision Approved
        M->>S: OrdersRepository.create()
        S->>DB: INSERT orders
    end

    W->>S: CyclesRepository.complete()
    S->>DB: UPDATE cycles
```

## Configuration Tables

Runtime configuration uses a draft/test/active/archived workflow:

```mermaid
stateDiagram-v2
    [*] --> draft : create
    draft --> testing : validate
    testing --> active : promote
    testing --> draft : fix issues
    active --> archived : new version
    archived --> [*]
```

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `trading_config` | Global trading parameters | kelly_fraction, conviction thresholds, timeouts |
| `agent_configs` | Per-agent settings | enabled, system_prompt_override |
| `universe_configs` | Trading universe | static_symbols, index_source, filters |
| `constraints_config` | Risk limits | max_positions, max_drawdown, greek limits |

Each config table enforces one active config per environment via partial unique index.

## Execution Engine Recovery

The Rust execution engine uses dedicated snapshot tables for crash recovery:

| Table | Purpose |
|-------|---------|
| `execution_order_snapshots` | Order state for recovery |
| `execution_position_snapshots` | Position state for recovery |
| `execution_recovery_state` | Recovery status tracking |

## Commands

```bash
# Install dependencies
bun install

# Push schema to database (no migration files)
CREAM_ENV=PAPER bun run db:push

# Reset database (DROP + CREATE + migrate)
bun run db:reset

# Seed configuration
bun run db:seed                  # Seed both environments
bun run db:seed --env=PAPER      # Seed PAPER only
bun run db:seed --force          # Overwrite existing

# Open Drizzle Studio (browser UI)
bun run dev

# Type checking
bun run typecheck

# Run tests
bun test
```

## Exports

```typescript
// Database client
import { db, getDb, closeDb, withTransaction } from "@cream/storage";
import type { Database } from "@cream/storage";

// Schema (for direct queries)
import * as schema from "@cream/storage/schema";
import { decisions, orders, thesisState } from "@cream/storage/schema";

// Repositories
import {
  DecisionsRepository,
  CyclesRepository,
  OrdersRepository,
  ThesisStateRepository,
  // ... 25+ repositories
} from "@cream/storage";

// Utilities
import { sql, RepositoryError, QueryBuilder, query } from "@cream/storage";
```

## Connection Pool

Default pool configuration:
- Max connections: 10
- Idle timeout: 20 seconds
- Connection timeout: 10 seconds

```typescript
import { getPoolStats, healthCheck } from "@cream/storage/db";

// Health check
const healthy = await healthCheck();

// Pool statistics
const stats = getPoolStats();
// { totalCount: 5, idleCount: 3, waitingCount: 0 }
```

## Type Safety

All repositories use Drizzle's inferred types with domain mapping:

```typescript
// Database row type (from schema)
type DecisionRow = typeof decisions.$inferSelect;

// Domain type (mapped in repository)
interface Decision {
  id: string;
  symbol: string;
  action: DecisionAction;  // Union type
  confidenceScore: number | null;  // Numeric converted
  metadata: Record<string, unknown>;  // JSONB typed
  createdAt: string;  // ISO string
}

// Row mapper handles conversions
function mapDecisionRow(row: DecisionRow): Decision {
  return {
    ...row,
    confidenceScore: row.confidenceScore ? Number(row.confidenceScore) : null,
    createdAt: row.createdAt.toISOString(),
  };
}
```

## PostgreSQL Features

- **UUIDv7** primary keys for time-ordered IDs (via `pg_uuidv7` extension)
- **Partial unique indexes** for enforcing one active config per environment
- **Check constraints** for data validation (confidence 0-1, positive quantities)
- **JSONB columns** for flexible metadata storage
- **Timestamp with timezone** for all temporal data

## Testing

Repositories accept optional database instance for dependency injection:

```typescript
import { getDb } from "@cream/storage";
import { DecisionsRepository } from "@cream/storage";

// Production: uses singleton
const repo = new DecisionsRepository();

// Testing: inject test database
const testDb = getDb(); // uses TEST_DATABASE_URL
const repo = new DecisionsRepository(testDb);
```
