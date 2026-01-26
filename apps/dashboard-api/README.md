# @cream/dashboard-api

REST + WebSocket API server for the Cream trading dashboard. Serves the Next.js dashboard with real-time market data, trading cycle visibility, and portfolio management.

## Architecture

```mermaid
flowchart TB
    subgraph Clients["Dashboard Clients"]
        Browser["Next.js Dashboard"]
    end

    subgraph API["Hono API Server :3001"]
        direction TB
        subgraph Middleware["Middleware Layer"]
            CORS --> RateLimit --> Session["Session (better-auth)"]
        end

        subgraph Routes["Route Modules"]
            direction LR
            Portfolio & Decisions & Market & Options
            Risk & Config & System & Cycles
        end

        subgraph WS["WebSocket Server"]
            Handler["Bun.serve websocket"]
            Channels["Channel Manager"]
            Broadcast["Broadcast Engine"]
        end

        subgraph Streaming["Streaming Services"]
            MarketData["Market Data"]
            OptionsData["Options Data"]
            TradingUpdates["Trading Updates"]
        end

        subgraph Events["Event Publisher"]
            Publisher["Event Hub"]
            Batching["Quote Batching"]
        end
    end

    subgraph External["External Services"]
        Alpaca["Alpaca API"]
        Proxy["alpaca-stream-proxy (gRPC)"]
        Postgres[(PostgreSQL)]
        Helix[(HelixDB)]
        Worker["Worker Process"]
    end

    Browser -->|HTTP| Middleware
    Browser -->|WSS| Handler
    Middleware --> Routes
    Routes --> Postgres
    Routes --> Helix
    Routes --> Alpaca

    Handler --> Channels
    Channels --> Broadcast

    Streaming --> Proxy
    Proxy --> Alpaca
    Streaming --> Broadcast

    Worker -->|POST /worker-events| Routes
    Publisher --> Broadcast
    Broadcast --> Browser
```

## WebSocket Channels

```mermaid
flowchart LR
    subgraph Client["WebSocket Client"]
        Sub["Subscribe"]
    end

    subgraph Channels["Available Channels"]
        quotes["quotes"]
        trades["trades"]
        options["options"]
        cycles["cycles"]
        portfolio["portfolio"]
        orders["orders"]
        agents["agents"]
        alerts["alerts"]
        indicators["indicators"]
        filings["filings"]
        workers["workers"]
        system["system"]
    end

    subgraph Data["Broadcast Messages"]
        Q["quote, trade, aggregate"]
        O["option_quote"]
        C["cycle_progress, cycle_result"]
        A["agent_output, agent_tool_call"]
        P["position_update, account_update"]
        OR["order_update"]
        AL["alert"]
        S["system_status, health_check"]
    end

    Sub --> quotes & trades & options & cycles
    Sub --> portfolio & orders & agents & alerts

    quotes --> Q
    options --> O
    cycles --> C
    agents --> A
    portfolio --> P
    orders --> OR
    alerts --> AL
    system --> S
```

## Request Flow

```mermaid
sequenceDiagram
    autonumber
    participant C as Dashboard
    participant M as Middleware
    participant A as Auth (better-auth)
    participant R as Route Handler
    participant DB as PostgreSQL
    participant B as Alpaca Broker

    C->>+M: GET /api/portfolio/summary
    M->>M: CORS check
    M->>M: Rate limit (100/min)
    M->>+A: Validate session cookie
    A-->>-M: Session + User

    alt LIVE environment
        M->>M: Check 2FA enabled
        M->>M: Check X-Confirm-Action
        M->>M: Audit log (async)
    end

    M->>+R: Forward request
    R->>+DB: Get positions
    DB-->>-R: Position data
    R->>+B: Get account
    B-->>-R: Account data
    R-->>-M: JSON response
    M-->>-C: 200 OK
```

## Streaming Data Flow

```mermaid
flowchart LR
    subgraph Alpaca["Alpaca Markets"]
        WS["WebSocket Feeds"]
        REST["REST API"]
    end

    subgraph Proxy["alpaca-stream-proxy"]
        gRPC["gRPC Server"]
        Mux["Multiplexer"]
    end

    subgraph API["dashboard-api"]
        ProxyClient["Proxy Client"]
        MarketStream["Market Data Stream"]
        OptionsStream["Options Stream"]
        TradingStream["Trading Updates"]
        Cache["Quote Cache"]
        Broadcaster["WebSocket Broadcaster"]
    end

    subgraph Clients["Dashboard Clients"]
        D1["Client 1 (AAPL, TSLA)"]
        D2["Client 2 (SPY)"]
    end

    WS --> Mux
    Mux --> gRPC
    REST --> Cache

    gRPC --> ProxyClient
    ProxyClient --> MarketStream & OptionsStream & TradingStream

    MarketStream --> Cache
    Cache --> Broadcaster
    OptionsStream --> Broadcaster
    TradingStream --> Broadcaster

    Broadcaster -->|symbol filter| D1
    Broadcaster -->|symbol filter| D2
```

## API Routes

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/portfolio` | GET, POST | Positions, account, orders, history, performance |
| `/api/decisions` | GET | Trading decisions with agent outputs, citations |
| `/api/market` | GET | Quotes, candles, indicators, regime |
| `/api/options` | GET | Options chain, expirations, quotes with Greeks |
| `/api/risk` | GET | Exposure, Greeks, VaR, correlation, limits |
| `/api/cycles` | GET | Cycle analytics, decision metrics, calibration |
| `/api/config` | GET, PUT | Trading, agents, universe, constraints config |
| `/api/system` | GET, POST | Health, status, start/stop/pause, environment |
| `/api/alerts` | GET, POST | Alert history, settings, acknowledgment |
| `/api/agents` | GET | Agent configs and recent outputs |
| `/api/theses` | GET, PUT | Trading theses and state |
| `/api/filings` | GET | SEC EDGAR filings (10-K, 10-Q, 8-K) |
| `/api/snapshots` | GET | Portfolio snapshots for equity curve |
| `/api/economic-calendar` | GET | Economic events |
| `/api/workers` | GET | Worker run history |
| `/api/search` | GET | Symbol/filing search |
| `/api/traces` | GET | OpenTelemetry trace lookup |
| `/api/ai` | GET | AI-generated status summaries |
| `/api/admin` | GET | Admin-only operations |
| `/health` | GET | Basic health check |
| `/docs` | GET | Swagger UI |

## WebSocket Protocol

### Connection

```typescript
// Connect with session cookie authentication
const ws = new WebSocket('wss://api.example.com/ws');

// On connect, receive system status
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  // { type: "system_status", data: { health, connections, environment } }
};
```

### Client Messages

```typescript
// Subscribe to channels
{ type: "subscribe", channels: ["quotes", "cycles", "portfolio"] }

// Subscribe to specific symbols
{ type: "subscribe_symbols", symbols: ["AAPL", "TSLA"] }

// Subscribe to options contracts
{ type: "subscribe_options", contracts: ["AAPL240119C00150000"] }

// Request current state
{ type: "request_state", channel: "portfolio" }

// Keep-alive
{ type: "ping" }

// Acknowledge alert
{ type: "acknowledge_alert", alertId: "alert-123" }
```

### Server Messages

| Type | Channel | Description |
|------|---------|-------------|
| `quote` | quotes | Real-time stock quotes |
| `trade` | trades | Trade executions |
| `aggregate` | quotes | OHLCV bars |
| `option_quote` | options | Options quotes with Greeks |
| `cycle_progress` | cycles | OODA loop phase updates |
| `cycle_result` | cycles | Cycle completion |
| `agent_output` | cycles | Agent completion |
| `agent_text_delta` | cycles | Streaming agent text |
| `agent_tool_call` | cycles | Tool invocation |
| `agent_tool_result` | cycles | Tool result |
| `agent_source` | cycles | Citation sources |
| `position_update` | portfolio | Position changes |
| `account_update` | portfolio | Account balance changes |
| `order_update` | orders | Order status changes |
| `alert` | alerts | System alerts |
| `system_status` | system | Health checks (30s) |
| `pong` | - | Ping response |

## Authentication

| Feature | Implementation |
|---------|----------------|
| Provider | Google OAuth via better-auth |
| Session | httpOnly cookies, PostgreSQL storage |
| 2FA | TOTP-based, required for LIVE |
| Session TTL | 7 days, refresh after 1 day |
| Cookie cache | 5 minutes to reduce DB lookups |

### LIVE Environment Protection

When `CREAM_ENV=LIVE`:
- 2FA must be enabled
- `X-Confirm-Action: true` header required for mutations
- All actions audit logged
- Optional IP whitelist

## Rate Limiting

| Endpoint Pattern | Limit |
|------------------|-------|
| `/api/*` (default) | 100 req/min |
| `/api/auth/get-session` | 60 req/min |
| `/api/auth/*` (other) | 10 req/min |

## Configuration

```bash
# Required
DATABASE_URL=postgresql://user:pass@localhost:5432/cream
CREAM_ENV=PAPER|LIVE

# Authentication
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
BETTER_AUTH_URL=http://localhost:3001

# Alpaca (trading + market data)
ALPACA_KEY=...
ALPACA_SECRET=...

# Optional
PORT=3001                              # Default: 3001
ALLOWED_ORIGINS=http://localhost:3000  # Comma-separated
WORKER_INTERNAL_SECRET=...             # For worker->API auth
EXECUTION_ENGINE_HOST=localhost        # Rust execution engine
HELIX_URL=http://localhost:9090        # HelixDB for citations
```

## Development

```bash
# Start dev server (port 3001)
bun run dev

# Run tests
bun test

# Type check
bun run typecheck

# Lint
bun run lint

# Access API docs
open http://localhost:3001/docs
```

## Docker

```bash
# Build (from monorepo root)
docker build -t cream-dashboard-api -f apps/dashboard-api/Dockerfile .

# Run
docker run -p 3001:3001 \
  -e DATABASE_URL=... \
  -e CREAM_ENV=PAPER \
  cream-dashboard-api
```

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `hono` | HTTP framework with OpenAPI |
| `better-auth` | OAuth + session + 2FA |
| `@hono/zod-openapi` | Request/response validation |
| `@cream/storage` | Drizzle ORM repositories |
| `@cream/marketdata` | Alpaca market data client |
| `@cream/broker` | Alpaca trading client |
| `@cream/helix` | HelixDB graph queries |

## Module Structure

```
src/
  index.ts              # Server entry, route mounting
  db.ts                 # Repository factories
  logger.ts             # Pino logger
  tracing.ts            # OpenTelemetry setup
  auth/
    better-auth.ts      # OAuth + 2FA config
    session.ts          # Session middleware, LIVE protection
  middleware/
    rate-limit.ts       # Token bucket rate limiter
  routes/
    portfolio.ts        # Positions, orders, performance
    decisions.ts        # Decision detail with citations
    market/             # Quotes, candles, indicators
    options.ts          # Options chain, Greeks
    risk.ts             # Exposure, VaR, limits
    config/             # Trading config management
    system/             # Health, status, worker events
    ...
  websocket/
    handler.ts          # Connection lifecycle
    routing.ts          # Message dispatch
    channels.ts         # Broadcast by channel/symbol
    handlers/           # Per-channel message handlers
  streaming/
    market-data.ts      # Stock quote/trade streams
    options-data.ts     # Options quote streams
    trading-updates.ts  # Order/position updates
    proxy-client.ts     # gRPC client for alpaca-stream-proxy
  events/
    publisher.ts        # Event hub, quote batching
    mappers.ts          # Event to WebSocket message
  services/
    portfolio.ts        # Portfolio calculations
    risk/               # Exposure, VaR, correlation
```

## Integration Points

| Service | Protocol | Purpose |
|---------|----------|---------|
| PostgreSQL | TCP/SQL | Primary data store |
| HelixDB | HTTP | Graph queries, citations |
| alpaca-stream-proxy | gRPC | Multiplexed market data |
| Alpaca Trading API | REST | Account, positions, orders |
| Alpaca Data API | REST + WS | Quotes, snapshots, history |
| Worker | HTTP POST | Cycle events for real-time UI |
| Dashboard | HTTP + WS | UI serving |
