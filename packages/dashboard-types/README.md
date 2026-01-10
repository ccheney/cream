# @cream/dashboard-types

Shared TypeScript types and Zod schemas for the Cream trading dashboard.

## Overview

Single source of truth for all dashboard data structures between `apps/dashboard` and `apps/dashboard-api`.

## API Schemas (`src/api.ts`)

### System
- `SystemStatus` - Environment, status, uptime
- `Alert` - Severity levels, acknowledgment

### Decisions
- `Decision` - Action, direction, size
- `DecisionDetail` - Extended with strategy, rationale, agent outputs
- `AgentOutput` - Individual agent vote

### Portfolio
- `PortfolioSummary` - NAV, cash, equity, P&L
- `Position` - Holdings with P&L
- `PerformanceMetrics` - Returns, Sharpe, Sortino

### Risk
- `ExposureMetrics` - Gross/net exposure
- `GreeksSummary` - Portfolio Greeks
- `VaRMetrics` - Value-at-Risk

### Market Data
- `Quote` - Bid/ask/last/volume
- `Candle` - OHLCV bars
- `Indicators` - Technical indicators

### Configuration
- `Config` - Environment, schedule, universe
- `ConstraintsConfig` - Risk limits

## WebSocket Schemas (`src/websocket.ts`)

Message types:
1. `quote` - Market price updates
2. `order` - Order status changes
3. `decision` - New trading decisions
4. `agent` - Agent votes
5. `cycle` - OODA loop progress
6. `alert` - System alerts
7. `system` - Status changes
8. `heartbeat` - Keepalive

## Usage

```typescript
import { DecisionSchema, WSMessageSchema } from "@cream/dashboard-types";

// Validate API response
const decision = DecisionSchema.parse(apiResponse);

// Handle WebSocket message
const message = WSMessageSchema.parse(JSON.parse(data));
if (message.type === "quote") {
  console.log(message.data.bid, message.data.ask);
}
```

## Type Extraction

```typescript
import type { Decision, PerformanceMetrics } from "@cream/dashboard-types";

function renderDecision(d: Decision) {
  return `${d.symbol}: ${d.action} ${d.size}`;
}
```

## Dependencies

- `zod` - Schema validation and type inference
