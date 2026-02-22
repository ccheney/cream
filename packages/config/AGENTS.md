# config

Central runtime configuration management with Zod validation, environment-aware secrets, and hot-reload support.

## Skills
Always activate: `modern-javascript`

## Key Dependencies

- **zod v4** - Runtime schema validation and type inference
  - Use context7 for Zod v4 API changes, schema composition, error handling
  - Web search for Zod v4 migration guide and best practices

## Related Plans

- `/docs/plans/11-configuration.md` - Configuration architecture
- `/docs/plans/32-yaml-to-runtime-config-migration.md` - YAML → runtime config migration

## Structure

- `src/schemas/` - Zod schemas for all config sections
- `src/loader.ts` - Config loading and validation logic
- `src/secrets.ts` - Environment-aware secret resolution
