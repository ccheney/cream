# broker

Alpaca Markets integration for equities and multi-leg options trading. Handles account management, order submission, position tracking, and real-time updates via WebSocket.

## Skills
Always activate: `modern-javascript`, `clean-ddd-hexagonal`

## Key Dependencies

- **Native Fetch API** - All HTTP requests use Web Fetch (no external HTTP client)
  - Web search for Alpaca Trading API v2 endpoints, authentication patterns
  - Use context7 for latest Alpaca API changes (order types, options support)

## Related Plans

- `/docs/plans/08-options.md` - Multi-leg options architecture
- `/docs/plans/07-execution.md` - Order routing and fill simulation

## Structure

- `src/client/` - Alpaca API client and type mappers
- `src/types.ts` - Broker-agnostic domain types
- `src/client/alpaca-types.ts` - Alpaca-specific API types
