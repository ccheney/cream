# validation

Research-to-production parity validation. Ensures backtested strategies match live execution behavior (indicator values, decision logic, order generation).

## Skills
Always activate: `modern-javascript`

## Key Dependencies

- **@cream/indicators** - Indicator comparison
- **@cream/storage** - Historical decision/order retrieval
  - Web search for backtest validation techniques, production parity testing

## Related Plans

- `/docs/plans/20-research-to-production-pipeline.md` - Research → production workflow

## Structure

- `src/indicators/` - Indicator value comparison
- `src/decisions/` - Decision logic validation
- `src/orders/` - Order generation validation
