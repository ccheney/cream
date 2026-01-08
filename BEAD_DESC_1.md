## Overview
Properly implement the `/api/risk/exposure` endpoint. The previous bead (`cream-lj151`) was closed as "Implemented", but the actual route handler in `apps/dashboard-api/src/routes/risk.ts` is explicitly stubbed with a 503 error.

## Plan Reference
- **Source**: `docs/plans/ui/05-api-endpoints.md` - Risk API Endpoints (line 267-288)
- **Source**: `docs/plans/ui/40-streaming-data-integration.md` - Streaming Data Integration

## Current State
- `GET /api/risk/exposure` returns 503 "Risk endpoints not yet implemented".
- The function `requireRiskService()` is called in the route handler, preventing any data return.
- `services/risk/exposure.ts` may exist but is not connected.

## Objective
Remove the 503 stub and connect the route to a working service that calculates portfolio exposure metrics using Turso positions and real-time market data.

## API Specification
**Endpoint**: `GET /api/risk/exposure`

**Response Schema**:
```typescript
interface ExposureMetrics {
  gross: { current: number; limit: number; pct: number };
  net: { current: number; limit: number; pct: number };
  long: number;     // Total long exposure ($)
  short: number;    // Total short exposure ($)
  concentrationMax: { symbol: string; pct: number };
  sectorExposure: { [sector: string]: number };
}
```

## Technical Architecture
1.  **Data Retrieval**:
    - Fetch open positions from Turso using `getPositionsRepo()`.
    - Fetch latest NAV from `getPortfolioSnapshotsRepo()`.
2.  **Market Data**:
    - Use cached real-time quotes if available, or fallback to snapshot prices.
3.  **Calculation Logic**:
    - **Gross Exposure**: `Sum(|position_value|)`
    - **Net Exposure**: `Sum(position_value_long) - Sum(|position_value_short|)`
    - **Concentration**: `Max(position_value) / NAV`
    - **Sector Exposure**: Group positions by sector and sum values.
4.  **Limits**:
    - Compare calculated values against `DEFAULT_EXPOSURE_LIMITS` (or config).

## Implementation Files
- **Modify**: `apps/dashboard-api/src/routes/risk.ts` (Remove stub, instantiate service, return JSON).
- **Create/Update**: `apps/dashboard-api/src/services/risk/exposure.ts` (Ensure calculation logic is complete and robust).

## Success Criteria
- [ ] `GET /api/risk/exposure` returns 200 OK.
- [ ] Response matches `ExposureMetrics` schema.
- [ ] 503 Stub is removed.
- [ ] Calculations accurately reflect the positions in the Turso database.

## Dependencies
- `cream-lj151` (Previous attempt, now reference).
