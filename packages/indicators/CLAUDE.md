# indicators

60+ technical indicators (RSI, ATR, SMA, Bollinger Bands, MACD, etc.) with dynamic synthesis and execution-time evaluation.

## Skills
Always activate: `modern-javascript`, `clean-ddd-hexagonal`

## Key Dependencies

- **@cream/storage** - Historical price data retrieval
  - Web search for technical indicator formulas, parameter tuning, interpretation

## Related Plans

- `/docs/plans/33-indicator-engine-v2.md` - Indicator engine architecture
- `/docs/plans/35-indicator-v2-integration.md` - Integration with agents
- `/docs/plans/19-dynamic-indicator-synthesis.md` - LLM-driven indicator creation
- `/docs/plans/36-dynamic-indicator-synthesis-workflow.md` - Synthesis workflow

## Structure

- `src/indicators/` - Individual indicator implementations
- `src/engine.ts` - Indicator evaluation engine
- `src/synthesis/` - Dynamic indicator synthesis logic
