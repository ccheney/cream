# universe

Trading universe resolution and filtering. Determines eligible symbols based on liquidity, market cap, sector constraints, and runtime config.

## Skills
Always activate: `modern-javascript`, `clean-ddd-hexagonal`

## Key Dependencies

- **@cream/storage** - Retrieves stock metadata and historical liquidity
  - Web search for stock screening criteria, liquidity metrics, universe construction best practices

## Related Plans

- `/docs/plans/45-alpaca-native-universe.md` - Alpaca-native universe filtering

## Structure

- `src/resolver.ts` - Universe resolution logic
- `src/filters/` - Individual filter implementations (liquidity, market cap, etc.)
- `src/cache.ts` - Universe caching and invalidation
