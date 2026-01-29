# prediction-markets

Kalshi and Polymarket integration for extracting probability-weighted market expectations on economic events, policy outcomes, and sector trends.

## Skills
Always activate: `modern-javascript`, `clean-ddd-hexagonal`

## Key Dependencies

- **kalshi-typescript** - Official Kalshi API client
  - Use context7 for kalshi-typescript API patterns
  - Web search for Kalshi market data, Polymarket API (if available), prediction market interpretation

## Related Plans

- `/docs/plans/18-prediction-markets.md` - Prediction market integration architecture

## Structure

- `src/kalshi/` - Kalshi API client and market parsers
- `src/polymarket/` - Polymarket API client (if implemented)
- `src/aggregator.ts` - Cross-platform market aggregation
