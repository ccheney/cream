# Seed Fixtures Scripts

**Purpose:** One-time use scripts to capture API fixtures for development/testing.

> **Note:** These scripts are throwaway infrastructure. Delete after fixtures are captured.
> See: `docs/plans/17-mock-data-layer.md`

## Overview

These scripts fetch real API responses and save them as JSON fixtures in `packages/marketdata/fixtures/`. The fixtures enable deterministic testing without hitting external APIs.

## Prerequisites

### API Keys Required

Create `.env.local` in project root with:

```bash
# Alpaca Paper Trading (free)
# Sign up: https://app.alpaca.markets/signup
ALPACA_KEY=your_key
ALPACA_SECRET=your_secret

# Financial Modeling Prep - Free tier: 250 req/day
# Sign up: https://site.financialmodelingprep.com/register
FMP_KEY=your_key

# Alpha Vantage - Free tier: 25 req/day
# Sign up: https://www.alphavantage.co/support/#api-key
ALPHAVANTAGE_KEY=your_key
```

## Execution Order

Run scripts in this order to respect rate limits:

1. **fetch-alpaca.ts** - No rate limits on paper trading
2. **fetch-fmp.ts** - 250 req/day, run early in day
3. **fetch-alphavantage.ts** - 25 req/day, run after FMP

```bash
# From project root
bun scripts/seed-fixtures/fetch-alpaca.ts
bun scripts/seed-fixtures/fetch-fmp.ts
bun scripts/seed-fixtures/fetch-alphavantage.ts
```

## Fixtures Output

```
packages/marketdata/fixtures/
├── alpaca/           # Account, positions, orders, candles, quotes
├── fmp/              # Fundamentals, transcripts, sentiment
└── alphavantage/     # Macro indicators (GDP, inflation, etc.)
```

## Rate Limit Reference

| Provider       | Limit           | Notes                      |
| -------------- | --------------- | -------------------------- |
| Alpaca         | Unlimited\*     | Paper trading only         |
| FMP            | 250 req/day     | Reset at midnight UTC      |
| Alpha Vantage  | 25 req/day      | Reset at midnight UTC      |

## Cleanup

After fixtures are captured:

1. Commit fixture JSON files to git
2. Delete this `scripts/seed-fixtures/` directory
3. Remove `@alpacahq/alpaca-trade-api` from devDependencies
4. Keep `.env.local` for future API testing (not committed)

## Verification

Run fixture loading tests to verify:

```bash
bun test packages/marketdata/tests/fixtures.test.ts
```
