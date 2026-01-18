# Execution Engine

The Execution Engine is the Rust-based deterministic core of the Cream trading system. It validates trading decisions from TypeScript agents, enforces risk constraints, routes orders to brokers, and manages portfolio state with crash recovery and reconciliation.

## Overview

The execution engine runs as a standalone service with multiple API surfaces:

- **HTTP/REST** (port 50051): Health checks and JSON endpoints for basic operations
- **gRPC** (port 50053): Structured execution and market data services

It operates in two environments:

| Environment | Purpose | Broker | Credentials |
|---|---|---|---|
| **PAPER** | Paper trading (dry-run) | Alpaca Paper | ALPACA_KEY, ALPACA_SECRET |
| **LIVE** | Real money trading | Alpaca Live | ALPACA_KEY, ALPACA_SECRET |

## Key Components

### Core Modules

- **`execution/`** - Order routing, broker adapters (Alpaca/Backtest), state management
  - `gateway.rs` - Unified broker interface
  - `alpaca.rs` - Alpaca Markets integration
  - `backtest.rs` - Simulated order execution
  - `state.rs` - Order state tracking
  - `persistence.rs` - State snapshots and crash recovery
  - `reconciliation.rs` - Periodic broker state sync
  - `recovery.rs` - Crash recovery on startup
  - `stops.rs` - Stop-loss and take-profit enforcement
  - `tactics.rs` - Order execution tactics (TWAP, VWAP, adaptive, etc.)

- **`risk/`** - Constraint validation and position sizing
  - `constraints.rs` - Per-instrument, portfolio, options, and margin checks
  - `sizing.rs` - Position size calculations (SHARES, CONTRACTS, DOLLARS, PCT_EQUITY)

- **`models/`** - Core domain types
  - `order.rs` - Order and fill types
  - `decision.rs` - DecisionPlan structures (mirrored from TypeScript agents)
  - `constraint.rs` - Constraint request/response types
  - `environment.rs` - PAPER/LIVE enum


- **`options/`** - Options trading support
  - Greeks calculation (delta, gamma, vega, theta)
  - Early exercise risk assessment
  - Multi-leg order validation
  - Assignment risk evaluation

- **`pricing/`** - Options pricing
  - Implied volatility solver
  - Options strategy builders
  - Greeks aggregation

- **`feed/`** - Market data ingestion
  - Alpaca integration for live market data
  - Feed health monitoring
  - Microstructure analysis

- **`safety/`** - Safety mechanisms
  - Mass cancel on broker disconnect
  - Connection monitoring with heartbeat
  - GTC order handling policies

- **`resilience/`** - Fault tolerance
  - Circuit breaker pattern for broker/feed failures
  - Automatic recovery with backoff

- **`server/`** - API servers
  - `http.rs` - REST/JSON endpoints
  - `grpc.rs` - gRPC service implementations
  - `tls.rs` - TLS/mTLS support

### Configuration

The engine loads configuration from `config.yaml` with environment variable interpolation:

```yaml
server:
  http_port: 50051
  grpc_port: 50053

brokers:
  alpaca:
    api_key: ${ALPACA_KEY}
    api_secret: ${ALPACA_SECRET}

constraints:
  per_instrument:
    max_notional: 50000
    max_units: 1000
  portfolio:
    max_gross_notional: 500000
    max_leverage: 2.0

persistence:
  enabled: true
  db_path: "./data/orders.db"
  snapshot_interval_secs: 60

recovery:
  enabled: true
  auto_resolve_orphans: true
  sync_positions: true

reconciliation:
  enabled: true
  interval_secs: 300
  protection_window_secs: 1800

safety:
  enabled: true
  grace_period_seconds: 30
  heartbeat_interval_ms: 30000
```

See `src/config.rs` for complete configuration schema and defaults.

## Building and Running

### Build

```bash
# Build the binary
cargo build -p execution-engine

# Build with optimizations
cargo build -p execution-engine --release

# Build Rust workspace
cargo build --workspace
```

### Run

```bash
# With default config.yaml
cargo run --bin execution-engine

# With custom config
cargo run --bin execution-engine -- --config /path/to/config.yaml

# Set environment
CREAM_ENV=PAPER ALPACA_KEY=... ALPACA_SECRET=... cargo run --bin execution-engine
```

### Testing

```bash
# Run all tests (requires CREAM_ENV=PAPER)
CREAM_ENV=PAPER cargo test -p execution-engine

# Run specific test module
CREAM_ENV=PAPER cargo test -p execution-engine risk::

# Run with output
CREAM_ENV=PAPER cargo test -p execution-engine -- --nocapture

# Run integration tests
CREAM_ENV=PAPER cargo test -p execution-engine --test tactics_integration_test
```

### Coverage

```bash
# Generate coverage report
cargo cov

# View HTML report
cargo cov-html

# Check coverage meets 90% threshold
cargo cov-check
```

## API Endpoints

### HTTP/REST (port 50051)

```bash
# Health check
GET /health

# Validate constraints without executing
POST /v1/check-constraints
Content-Type: application/json
{
  "decision_plan": {...},
  "portfolio_state": {...}
}

# Submit orders for execution
POST /v1/submit-orders
Content-Type: application/json
{
  "decision_plan": {...},
  "execution_params": {...}
}

# Get order states
POST /v1/order-state
Content-Type: application/json
{
  "order_ids": ["order-1", "order-2"]
}
```

### gRPC Services

**ExecutionService** (port 50053)
- `CheckConstraints` - Validate decision plan
- `SubmitOrder` - Execute single order
- `SubmitOrders` - Execute multiple orders
- `GetOrderState` - Query order status
- `CancelOrder` - Cancel active order
- `GetPortfolioState` - Query positions and P&L

**MarketDataService**
- `GetSnapshot` - Current market snapshot for symbol
- `GetOptionChain` - Option chain for underlying
- `SubscribeMarketData` - Stream market data updates

## Environment Variables

### Required

| Variable | Required for | Description |
|---|---|---|
| `CREAM_ENV` | All | PAPER or LIVE |
| `ALPACA_KEY` | PAPER, LIVE | Alpaca API key |
| `ALPACA_SECRET` | PAPER, LIVE | Alpaca API secret |

### Optional

| Variable | Default | Description |
|---|---|---|
| `RUST_LOG` | info | Logging level (trace, debug, info, warn, error) |
| `GRPC_TLS_ENABLED` | false | Enable TLS for gRPC |
| `GRPC_TLS_CERT_PATH` | - | Server certificate path |
| `GRPC_TLS_KEY_PATH` | - | Server private key path |

## Key Workflows

### Order Submission Flow

1. **Validation** (`ConstraintValidator`)
   - Check per-instrument limits (notional, units, equity %)
   - Check portfolio limits (gross/net notional, leverage)
   - Validate options Greeks and assignment risk
   - Verify buying power/margin

2. **Decision Plan Routing**
   - Parse DecisionPlan from TypeScript agents
   - Extract orders with action, direction, size, stops, targets

3. **Order Execution**
   - Route to broker adapter (Alpaca or simulated)
   - Track order state locally
   - Persist state snapshot

4. **Risk Enforcement**
   - Monitor stops and targets
   - Enforce bracket orders on entry
   - Trigger mass cancel on disconnect

### Crash Recovery (Startup)

1. Load persisted orders and positions from local DB
2. Fetch broker state from Alpaca
3. Reconcile: find orphaned orders, closed positions, discrepancies
4. Auto-resolve orphans or alert if critical
5. Sync portfolio state
6. Resume normal operation

### Reconciliation (Periodic)

1. Fetch broker state (orders, positions, buying power)
2. Compare with local state
3. Detect: missing orders, extra orders, quantity mismatches, price divergence
4. Auto-resolve per config or alert
5. Log discrepancies for audit

## Important Notes

### Precision and Financial Calculations

- Uses `rust_decimal::Decimal` for all financial math (precise to many decimal places)
- Avoids floating-point rounding errors in price and quantity calculations
- Leverage calculations use precise decimal arithmetic

### Determinism

- Slippage models are parameterized (fixed BPS, spread-based, volume impact)
- Commission includes SEC, TAF, and ORF regulatory fees
- Stop/target triggers have configurable priority (stop_first, target_first, high_low_order)

### Persistence

- PAPER/LIVE modes: SQLite-backed persistence in `./data/orders.db`
- Periodic snapshots on configurable interval (default 60s)
- Enables crash recovery on service restart

### Safety

- Circuit breaker on broker API failures
- Mass cancel on connection loss (configurable grace period)
- GTC order handling (configurable: include or exclude from cancel)
- Heartbeat monitoring with timeout detection
- Manual kill switch via gRPC/HTTP endpoints

### Options Support

- Multi-leg order validation (spreads, straddles, etc.)
- Greeks aggregation (portfolio-level delta, gamma, vega, theta)
- Assignment risk assessment
- Early exercise detection
- Options-specific constraint checks

## Troubleshooting

### Startup fails: Missing credentials

**Error**: "Missing required environment variables: ALPACA_KEY, ALPACA_SECRET"

**Fix**: Set environment variables or update `config.yaml`:
```bash
export ALPACA_KEY=your-key
export ALPACA_SECRET=your-secret
cargo run --bin execution-engine
```

### Crashes on restart: Orphaned orders

**Logs**: "Reconciliation detected critical discrepancies - orphans_resolved: N"

**Fix**: Set `recovery.auto_resolve_orphans: true` in config to auto-cleanup, or manually review broker account.

### Orders not executing: Circuit breaker open

**Logs**: "Circuit breaker is open for Alpaca"

**Fix**: Wait for the configured wait duration (default 30s) or restart the service. Check broker API status.

### High latency on market data

**Logs**: "Data gap detected for symbol XYZ"

**Fix**: Check Alpaca connectivity. Verify network connectivity to data feed. Check `feeds.alpaca` config.

## Dependencies

Key external dependencies:

- `tokio` - Async runtime
- `tonic` - gRPC server
- `axum` - HTTP server
- `rust_decimal` - Precise decimal arithmetic
- `sqlx` - SQLite/PostgreSQL client for persistence
- `alpaca-websocket` - Market data feed
- `reqwest` - HTTP client
- `tracing` - Observability

See `Cargo.toml` for complete dependency list and versions.

## Development

### Adding New Features

1. Add domain models in `models/` if needed
2. Implement constraint/validation logic in `risk/`
3. Add execution logic in `execution/` with adapter implementations
4. Expose via `server/` endpoints (HTTP or gRPC)
5. Write tests with mocks for external dependencies
6. Update `config.rs` if configuration is needed

### Code Organization Principles

- **No unsafe code** (forbidden by lint)
- **Self-documenting code** - clear names, minimal comments
- **Strict error handling** - no `.unwrap()` in production paths
- **Trait-based adapters** - support multiple brokers/feeds
- **Configuration-driven** - behavior configurable without code changes
- **Comprehensive testing** - 90% coverage threshold

### Testing Strategy

- Use `mockall` for mocking broker/feed APIs
- Use `proptest` for property-based testing
- Use `wiremock` for HTTP mock servers
- Integration tests use `testcontainers` for real infrastructure when needed

## Related Documentation

- **Cream Overview**: See `/Users/ccheney/Projects/cream/CLAUDE.md`
- **Architecture Plans**: `docs/plans/09-rust-core.md` (order routing, risk)
- **Testing Plans**: `docs/plans/14-testing.md` (coverage, strategies)
- **Tactics Implementation**: `TACTICS_IMPLEMENTATION.md` (execution algorithms)

## License

AGPL-3.0-only

