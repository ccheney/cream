# Dashboard API

Hono REST + WebSocket API server for the trading dashboard with real-time market data streaming.

## Skills
Always activate: `modern-javascript`, `clean-ddd-hexagonal`, `postgres-drizzle`

## Key Dependencies
- **Hono 4** → use context7 for `hono` docs
- **@hono/zod-openapi** → use context7 for `hono` docs (OpenAPI plugin)
- **better-auth** → use context7 for `better-auth` docs
- **Drizzle ORM** → use context7 for `drizzle-orm` docs

## Related Plans
- [docs/plans/22-self-service-dashboard.md](../../docs/plans/22-self-service-dashboard.md)
- [docs/plans/54-legacy-api-removal.md](../../docs/plans/54-legacy-api-removal.md)

## Notes
- Shared types in `packages/dashboard-types/`
- WebSocket protocol for real-time updates
- OpenTelemetry instrumented
