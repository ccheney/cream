# @cream/config

Central configuration management for the Cream trading system.

## Overview

Provides:

- **Zod Schemas** - All configuration domains (trading, agents, universe, constraints)
- **RuntimeConfigService** - Database-driven configuration management
- **Secrets Management** - Multiple providers with encryption
- **Startup Validation** - Environment and safety checks

## Key Components

### Schemas (`src/schemas/`)

- `core.ts` - Environment, LLM model, timeframes
- `agents.ts` - Agent network configuration
- `universe.ts` - Trading universe sources
- `constraints.ts` - Risk limits
- `indicators.ts` - Technical indicators
- `regime.ts` - Market regime classification

### RuntimeConfigService (`src/runtime-config.ts`)

```typescript
import { createRuntimeConfigService } from "@cream/config";

const service = createRuntimeConfigService(tradingRepo, agentRepo, universeRepo);

// Load active configuration
const config = await service.getActiveConfig("PAPER");

// Edit draft
await service.saveDraft("PAPER", { trading: { agentTimeoutMs: 15000 } });

// Promote to active
await service.promote("PAPER");
```

### Validation (`src/validate.ts`)

```typescript
import { validateConfig, validateAtStartup } from "@cream/config";

const result = validateConfig(rawConfig);
if (!result.success) {
  console.error(result.errors);
}

// Startup validation with cross-field checks
validateAtStartup(config);
```

### Secrets Management (`src/secrets.ts`)

```typescript
import { createEnvSecretsManager } from "@cream/config";

const secrets = createEnvSecretsManager();
const apiKey = await secrets.get("");
```

## Configuration Workflow

```
DRAFT (edit) → TEST (sandbox) → ACTIVE (live)
```

Version IDs tracked for audit trail.

## Usage

```typescript
import { createRuntimeConfigService, runStartupValidation } from "@cream/config";

// Startup
const { env } = await runStartupValidation("api-server", ctx);

// Load config
const configService = createRuntimeConfigService(repos);
const config = await configService.getActiveConfig("PAPER");
```

## Important Notes

- **Database-only** - No YAML fallback; config must be seeded
- **Sensitive Data** - Secrets in env vars or encrypted files
- **Global Model** - All agents share same `globalModel` setting

## Dependencies

- `zod` - Schema validation
- `@cream/domain` - Core types
