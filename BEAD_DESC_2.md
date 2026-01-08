## Overview
Implement the missing `/api/portfolio/options` endpoint required by the Dashboard's Options Positions Widget (`cream-3qwxv`).

## Plan Reference
- **Source**: `docs/plans/ui/40-streaming-data-integration.md` Part 2.2 (Options Positions Widget)
- **Related Bead**: `cream-3qwxv` (Frontend Widget Implementation)

## Current State
- Frontend `useOptionsPositions` hook calls `GET /api/portfolio/options`.
- Backend returns **404 Not Found** because the route is undefined in `apps/dashboard-api`.
- No backend bead previously tracked this specific endpoint.

## Objective
Create a specific endpoint for retrieving options positions with enhanced metadata (Greeks, expiry, underlying) to power the options widget.

## API Specification
**Endpoint**: `GET /api/portfolio/options`

**Response Schema**:
```typescript
interface OptionsPosition {
  contractSymbol: string;      // OCC format (e.g., AAPL240117C00190000)
  underlying: string;          // e.g., AAPL
  expiration: string;          // ISO date
  strike: number;
  right: "CALL" | "PUT";
  quantity: number;
  avgCost: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  greeks?: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
  };
}
```

## Technical Architecture
1.  **Route Definition**:
    - Add `/options` route to `apps/dashboard-api/src/routes/portfolio.ts` (or create `routes/options.ts`).
2.  **Data Retrieval**:
    - Query Turso positions table for `asset_type = 'OPTION'`.
    - Parse OCC symbols to extract details (Underlying, Expiry, Strike, Right).
3.  **Market Data Enrichment**:
    - Fetch current option price (mid-point of bid/ask) from Market Data Service.
    - Fetch/Calculate Greeks (using `packages/marketdata/src/options/greeks.ts` or Rust gRPC service).
4.  **Response Formatting**:
    - Map database entities + live market data to `OptionsPosition` schema.

## Implementation Files
- **Modify**: `apps/dashboard-api/src/routes/portfolio.ts` (Add route).
- **Modify**: `apps/dashboard-api/src/services/portfolio.ts` (Add `getOptionsPositions` logic).

## Success Criteria
- [ ] `GET /api/portfolio/options` returns 200 OK.
- [ ] Returns list of option positions with correct schema.
- [ ] Greeks are populated (or null if unavailable).
- [ ] Frontend widget (`OptionsPositionsWidget`) loads data correctly without 404s.

## Dependencies
- `cream-3qwxv` (Frontend dependency).
