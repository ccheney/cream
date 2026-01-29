# storage

PostgreSQL + Drizzle ORM repositories for all persistent data (portfolio, orders, positions, trades, indicators, decisions, agents).

## Skills
Always activate: `modern-javascript`, `postgres-drizzle`, `clean-ddd-hexagonal`

## Key Dependencies

- **drizzle-orm v0.45** - Type-safe ORM with Postgres support
- **pg** - PostgreSQL client
  - Use context7 for Drizzle ORM v0.45 query builder, migrations, relations
  - Web search for Drizzle ORM v0.45 migration guide, postgres-js vs pg performance

## Related Plans

- `/docs/plans/02-data-layer.md` - Data layer architecture
- `/docs/plans/46-postgres-drizzle-migration.md` - Migration from previous ORM

## Structure

- `src/schema/` - Drizzle schema definitions
- `src/repositories/` - Repository pattern implementations
- `src/migrations/` - SQL migration files
