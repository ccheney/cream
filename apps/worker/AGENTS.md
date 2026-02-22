# Worker

Hourly scheduler orchestrating trading cycles and data ingestion pipelines.

## Skills
Always activate: `modern-javascript`, `clean-ddd-hexagonal`

## Key Dependencies
- **croner** — cron scheduler → web search for `croner` npm docs
- **@mastra/core** → use context7 for `mastra` docs

## Related Plans
- [docs/plans/13-operations.md](../../docs/plans/13-operations.md)
- [docs/plans/15-implementation.md](../../docs/plans/15-implementation.md)

## Notes
- Session-aware scheduling respects market hours
- Health API endpoints for monitoring
- OpenTelemetry instrumented
