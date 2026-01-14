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
```

## Commands

```bash
# Development
bun install                         # Install TS dependencies
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

# Database
bun run db:migrate                  # Run Turso migrations
bun run db:status                   # Show migration status
```

## Environment

Single switch controls environment: `CREAM_ENV=BACKTEST|PAPER|LIVE`

### Required by Environment

| Variable | BACKTEST | PAPER | LIVE | Description |
|----------|----------|-------|------|-------------|
| `CREAM_ENV` | ✓ | ✓ | ✓ | Trading environment |
| `ALPACA_KEY` | - | ✓ | ✓ | Alpaca API key (market data + trading) |
| `ALPACA_SECRET` | - | ✓ | ✓ | Alpaca API secret |
| `GOOGLE_GENERATIVE_AI_API_KEY` | - | - | ✓ | Gemini API key (OODA agents) |
| `ANTHROPIC_API_KEY` | - | - | ✓ | Anthropic API key (claude-agent-sdk) |
| `GOOGLE_CLIENT_ID` | - | ✓ | ✓ | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | - | ✓ | ✓ | Google OAuth client secret |
| `FRED_API_KEY` | - | Optional | Recommended | FRED economic calendar API key |

### All Environment Variables

```bash
# Core (required)
CREAM_ENV=BACKTEST           # BACKTEST | PAPER | LIVE

# Database
TURSO_DATABASE_URL=          # Turso URL (default: http://localhost:8080)
TURSO_AUTH_TOKEN=            # Turso Cloud auth token
HELIX_URL=                   # HelixDB URL (default: http://localhost:6969)
HELIX_HOST=                  # HelixDB host (alternative)
HELIX_PORT=                  # HelixDB port (alternative)

# Broker
ALPACA_KEY=                  # Alpaca API key
ALPACA_SECRET=               # Alpaca API secret
ALPACA_BASE_URL=             # Alpaca base URL (auto-set by environment)

# Market Data (Alpaca is the unified provider via ALPACA_KEY/ALPACA_SECRET above)
FMP_KEY=                     # FMP fundamentals/transcripts
ALPHAVANTAGE_KEY=            # Alpha Vantage macro indicators
FRED_API_KEY=                # FRED economic data (Federal Reserve)

# LLM
ANTHROPIC_API_KEY=           # Anthropic Claude API key
GOOGLE_GENERATIVE_AI_API_KEY=  # Google Gemini API key

# Prediction Markets
KALSHI_API_KEY_ID=           # Kalshi API key ID
KALSHI_PRIVATE_KEY_PATH=     # Path to Kalshi private key

# Authentication (OAuth)
GOOGLE_CLIENT_ID=            # Google OAuth client ID
GOOGLE_CLIENT_SECRET=        # Google OAuth client secret
BETTER_AUTH_URL=             # Better Auth base URL for OAuth callbacks

# Dashboard API
ALLOWED_ORIGINS=             # Comma-separated CORS origins (default: localhost:3000,3001)
```

## Environment Requirements

| Environment | Auth Required | MFA Required |
|-------------|---------------|--------------|
| BACKTEST | No | No |
| PAPER | Yes | No |
| LIVE | Yes | Yes |
## Code Conventions

- **NEVER run `bun run dev` or `bun dev`** - unless explicitly told to, the user manages their own dev servers
- Prefer Bun APIs over Node.js equivalents (`Bun.file()`, `Bun.serve()`, etc.)
- Use `workspace:*` for internal package dependencies
- Financial calculations use `rust_decimal` (Rust) or handle precision carefully (TS)
- All trading decisions flow through the 8-agent consensus network
- DecisionPlans require: action, direction, size with unit, stop-loss, take-profit
- **Trust self-documenting code.** Do not add comments that restate what the code does. Only add comments when explaining *why* something non-obvious is necessary (e.g., workarounds, business rules, or domain-specific constraints). Good names and clear structure are better than comments.
- **Do NOT modify linting rules** (Biome, Clippy, Ruff configs) without explicit approval
- **Do NOT modify code coverage requirements** or thresholds without explicit approval

## ES2024 TypeScript Patterns

This codebase uses ES2024 features with TypeScript 7 (tsgo). tsgo provides 10x faster type-checking.

### Non-Mutating Array Methods

Prefer ES2024 non-mutating methods over their mutating counterparts:

```typescript
// ✅ Good - non-mutating
const sorted = items.toSorted((a, b) => a.value - b.value);
const reversed = items.toReversed();
const modified = items.toSpliced(1, 1, newItem);

// ❌ Bad - mutating
items.sort((a, b) => a.value - b.value);  // mutates in place
items.reverse();                           // mutates in place
items.splice(1, 1, newItem);              // mutates in place
```

### Grouping with Object.groupBy / Map.groupBy

Use native grouping methods instead of manual reduce patterns:

```typescript
// ✅ Good - Object.groupBy for string keys
const byCategory = Object.groupBy(items, (item) => item.category);

// ✅ Good - Map.groupBy for computed keys or when Map is needed
const byDate = Map.groupBy(events, (event) => event.date.toISOString());

// Handle undefined keys with sentinel pattern
const UNGROUPED = "__ungrouped__";
const grouped = Object.groupBy(items, (item) => item.group ?? UNGROUPED);
const ungrouped = grouped[UNGROUPED] ?? [];
delete grouped[UNGROUPED];

// ❌ Bad - manual reduce
const byCategory = items.reduce((acc, item) => {
  (acc[item.category] ??= []).push(item);
  return acc;
}, {});
```

### Set Methods

Use ES2024 Set methods for set operations:

```typescript
// ✅ Good - ES2024 Set methods
const intersection = setA.intersection(setB);
const union = setA.union(setB);
const difference = setA.difference(setB);

// Multi-set intersection with reduce
const allIntersection = sets.slice(1).reduce(
  (acc, set) => acc.intersection(set),
  sets[0]
);

// ❌ Bad - manual implementation
const intersection = new Set([...setA].filter(x => setB.has(x)));
const union = new Set([...setA, ...setB]);
```

### Promise.withResolvers

Use `Promise.withResolvers()` for deferred promises:

```typescript
// ✅ Good - Promise.withResolvers
const { promise, resolve, reject } = Promise.withResolvers<string>();

ws.addEventListener("open", () => resolve("connected"));
ws.addEventListener("error", () => reject(new Error("failed")));

return promise;

// ❌ Bad - executor pattern with external variables
let resolve: (value: string) => void;
let reject: (error: Error) => void;
const promise = new Promise<string>((res, rej) => {
  resolve = res;
  reject = rej;
});
```

### TypeScript Configuration

The base tsconfig includes ES2024 and ESNext.Collection for all modern features:

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "lib": ["ES2024", "ESNext.Collection"]
  }
}
```

## Database Limitations (Turso)

**IMPORTANT: Do NOT use CHECK constraints in SQL migrations.**

Turso does not support CHECK constraints. Migrations using `CHECK (...)` will fail with:
```
SqliteError: prepare failed: Parse error: CHECK constraints are not supported yet
```

**Workarounds:**
- Document allowed values in comments: `category TEXT NOT NULL, -- Valid: 'a', 'b', 'c'`
- Validate at the application layer using Zod schemas
- Use triggers if database-level enforcement is required

See: [tursodatabase/turso#3753](https://github.com/tursodatabase/turso/issues/3753) - CHECK constraints not yet implemented
