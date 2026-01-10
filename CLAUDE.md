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
  worker/               # Hourly scheduler
  dashboard/            # Next.js 16 trading dashboard
  dashboard-api/        # Hono REST + WebSocket API
  execution-engine/     # Rust gRPC server (order routing, risk)
  vision-service/       # Python chart analysis

packages/
  domain/               # Zod schemas, environment, time utilities
  config/               # Runtime config service, Zod schemas, secrets
  schema/               # Protobuf definitions (.proto files)
  schema-gen/           # Generated Protobuf stubs (TS/Rust)
  storage/              # Turso client wrapper
  helix/                # HelixDB client
  helix-schema/         # HelixDB schema definitions
  broker/               # Alpaca Markets integration
  marketdata/           # Polygon/Massive adapters
  universe/             # Trading universe resolution
  indicators/           # Technical indicators (RSI, ATR, SMA)
  regime/               # Market regime classification
  metrics/              # Risk-adjusted performance metrics
  mastra-kit/           # Agent prompts, tools, evaluations
  external-context/     # News, sentiment, fundamentals extraction
  filings/              # SEC EDGAR filing ingestion (10-K, 10-Q, 8-K)
  prediction-markets/   # Kalshi integration
  dashboard-types/      # Shared dashboard/API types
  tsconfig/             # Shared TypeScript configs
  infra/                # OpenTelemetry, OpenTofu infrastructure
  research/             # Python backtesting (VectorBT subprocess runner)
```

## Commands

```bash
# Development
bun install                         # Install TS dependencies
bun run dev                         # Start all services (Turborepo)
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
| `ALPACA_KEY` | - | ✓ | ✓ | Alpaca API key |
| `ALPACA_SECRET` | - | ✓ | ✓ | Alpaca API secret |
| `POLYGON_KEY` | - | - | ✓ | Polygon/Massive API key |
| `DATABENTO_KEY` | - | - | ✓ | Databento API key |
| `ANTHROPIC_API_KEY` or `GOOGLE_API_KEY` | - | - | ✓ | LLM API key |
| `GOOGLE_CLIENT_ID` | - | ✓ | ✓ | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | - | ✓ | ✓ | Google OAuth client secret |

### All Environment Variables

```bash
# Core (required)
CREAM_ENV=BACKTEST           # BACKTEST | PAPER | LIVE
CREAM_BROKER=ALPACA          # Broker (default: ALPACA)

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

# Market Data
POLYGON_KEY=                 # Polygon/Massive API key
DATABENTO_KEY=               # Databento execution-grade data
FMP_KEY=                     # FMP fundamentals/transcripts
ALPHAVANTAGE_KEY=            # Alpha Vantage macro indicators

# LLM
ANTHROPIC_API_KEY=           # Anthropic Claude API key
GOOGLE_API_KEY=              # Google Gemini API key

# Prediction Markets
KALSHI_API_KEY_ID=           # Kalshi API key ID
KALSHI_PRIVATE_KEY_PATH=     # Path to Kalshi private key

# Web Search
TAVILY_API_KEY=              # Tavily API key for web search

# Authentication (OAuth)
GOOGLE_CLIENT_ID=            # Google OAuth client ID
GOOGLE_CLIENT_SECRET=        # Google OAuth client secret
BETTER_AUTH_URL=             # Better Auth base URL for OAuth callbacks

# Dashboard API
ALLOWED_ORIGINS=             # Comma-separated CORS origins (default: localhost:3000,3001)
```

## Authentication

Dashboard uses **better-auth** with Google OAuth for authentication:

- **Google OAuth**: Single sign-on via Google accounts
- **Session-based**: Cookies, not JWTs (sessions stored in Turso)
- **No RBAC**: All authenticated users have full access
- **MFA required for LIVE**: Two-factor authentication enforced in production

### Environment Requirements

| Environment | Auth Required | MFA Required |
|-------------|---------------|--------------|
| BACKTEST | No | No |
| PAPER | Yes | No |
| LIVE | Yes | Yes |

### Protected Routes

```typescript
import { requireAuth, liveProtection } from "./auth/session.js";

// Require authentication
app.use("/api/*", sessionMiddleware(), requireAuth());

// LIVE environment: require MFA + confirmation header
app.post("/api/orders", liveProtection({ requireMFA: true, requireConfirmation: true }));
```

**Loading config:**
```typescript
import { createRuntimeConfigService } from "@cream/config";

const service = createRuntimeConfigService(tradingRepo, agentRepo, universeRepo);
const config = await service.getActiveConfig("PAPER");
```

**Config promotion workflow:** DRAFT → TEST → ACTIVE (via dashboard UI at `/config`)

**Dashboard config pages:**
- `/config` - Overview of current active configuration
- `/config/edit` - Edit draft configuration
- `/config/promote` - Test draft in sandbox and promote to active
- `/config/history` - Version history and rollback

### Startup Validation

Services validate environment at startup using `@cream/domain`:

```typescript
import { validateEnvironmentOrExit } from "@cream/domain";

// At service startup - fails fast with clear error messages
validateEnvironmentOrExit("dashboard-api", ["TURSO_DATABASE_URL"]);
```

## Testing Conventions

- **IMPORTANT:** Always set `CREAM_ENV=BACKTEST` when running tests
- TS tests use `bun:test` (not Jest/Vitest)
- Rust tests use `cargo test` with `mockall` for mocking
- Python tests use `pytest` with `pytest-asyncio`
- Use dependency injection patterns for external services (see `setSDKProvider` in claudeCodeIndicator.ts)

### Integration Tests with Testcontainers

Use [testcontainers](https://github.com/testcontainers/testcontainers-node) for integration tests requiring real infrastructure:

**When to use testcontainers:**
- HelixDB integration tests (graph queries, vector search)
- Turso/SQLite integration tests (migrations, complex queries)
- Redis/caching integration tests
- Any test requiring real database behavior vs mocks

**When NOT to use testcontainers:**
- Unit tests (use mocks/stubs)
- External API clients (use dependency injection + mocks)
- Tests that can run with in-memory alternatives

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
