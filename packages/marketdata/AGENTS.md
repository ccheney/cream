# marketdata

Alpaca market data integration (real-time bars, quotes, trades) with unified provider interface. Supports historical and streaming data.

## Skills
Always activate: `modern-javascript`, `clean-ddd-hexagonal`

## Key Dependencies

- **@msgpack/msgpack** - Binary serialization for efficient data transfer
  - Use context7 for @msgpack/msgpack encoding patterns
  - Web search for Alpaca Data API v2, WebSocket message formats, market data best practices

## Related Plans

- `/docs/plans/03-market-snapshot.md` - Market snapshot architecture
- `/docs/plans/31-alpaca-data-consolidation.md` - SIP vs IEX data feeds

## Structure

- `src/client/` - Alpaca Data API client
- `src/stream/` - WebSocket streaming client
- `src/provider.ts` - Unified market data interface
