# @cream/dashboard-api

REST + WebSocket API server for the Cream trading dashboard. Built with Hono and Bun.

## Overview

Provides the backend for the trading dashboard:

- **REST API** - 14 route modules for dashboard features
- **WebSocket Server** - Real-time streaming (quotes, trades, backtest results)
- **Authentication** - Google OAuth with better-auth + TOTP 2FA
- **Event Broadcasting** - Publishes domain events to connected clients

## API Routes

| Route | Purpose |
|-------|---------|
| `/api/system` | Health checks, server metrics, version info |
| `/api/decisions` | Trading decisions, consensus data |
| `/api/portfolio` | Positions, cash balance, P&L |
| `/api/alerts` | Alert history, settings |
| `/api/agents` | Agent status and outputs |
| `/api/config` | Trading config management |
| `/api/market` | OHLCV data, quotes |
| `/api/options` | Options chain, Greeks |
| `/api/risk` | Risk metrics, VaR |
| `/api/backtests` | Backtest runs and results |
| `/api/theses` | Trading theses |
| `/api/indicators` | Technical indicators |
| `/api/filings` | SEC EDGAR filings |

## WebSocket Channels

- **quote** - Stock/options quotes
- **backtest** - Backtest progress/results
- **system** - Health checks, alerts, orders

## Authentication

- **Provider**: Google OAuth via better-auth
- **Session**: httpOnly cookies (Turso storage)
- **2FA**: TOTP-based (required for LIVE)

| Environment | Auth | MFA |
|-------------|------|-----|
| BACKTEST | No | No |
| PAPER | Yes | No |
| LIVE | Yes | Yes |

## Configuration

```bash
CREAM_ENV=BACKTEST|PAPER|LIVE
TURSO_DATABASE_URL=http://localhost:8080
PORT=3001
ALLOWED_ORIGINS=http://localhost:3000
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

## Development

```bash
# Install dependencies
bun install

# Start dev server (port 3001)
bun run dev

# Access API docs
open http://localhost:3001/docs

# Run tests
bun test

# Type check
bun run typecheck
```

## Key Modules

- `src/index.ts` - Server entry point
- `src/db.ts` - Database context and repositories
- `src/auth/` - Authentication (better-auth, sessions)
- `src/routes/` - API route modules
- `src/websocket/` - WebSocket server
- `src/streaming/` - Market data subscriptions
- `src/events/` - Event publisher

## Dependencies

- `hono` - HTTP framework
- `better-auth` - Authentication
- `@libsql/client` - Turso database
- `zod` - Schema validation
- `@cream/storage` - Database repositories
- `@cream/marketdata` - Market data adapters
