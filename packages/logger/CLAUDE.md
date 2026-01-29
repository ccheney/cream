# logger

Structured logging wrapper around pino with context propagation, level filtering, and pretty-printing for dev.

## Skills
Always activate: `modern-javascript`

## Key Dependencies

- **pino v10** - Fast JSON logger
- **pino-pretty** - Human-readable log formatting
  - Use context7 for pino v10 API changes, child loggers, serializers
  - Web search for pino v10 performance tuning, async logging patterns

## Related Plans

- `/docs/plans/13-operations.md` - Logging strategy

## Structure

- `src/logger.ts` - Pino wrapper with context injection
- `src/serializers.ts` - Custom object serializers
