# tsconfig

Shared TypeScript configurations for consistent compiler settings across monorepo. Includes ES2024 base config, strict mode, and Bun-specific settings.

## Key Dependencies

- **TypeScript** - Compiler and type checker
  - Web search for TypeScript 5.x strict mode best practices, ES2024 features, Bun TypeScript configuration

## Related Plans

- `/docs/plans/16-tech-stack.md` - Tech stack decisions

## Structure

- `base.json` - Base tsconfig (ES2024, strict mode)
- `nextjs.json` - Next.js-specific config
- `bun.json` - Bun runtime config
