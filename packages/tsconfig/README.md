# @cream/tsconfig

Shared TypeScript configuration for the Cream monorepo.

## Overview

Centralized TypeScript compiler configurations:

- **base.json** - Strict type checking, ES2024 target
- **bun.json** - Extends base with Bun runtime types
- **react.json** - Extends base with React/DOM types

## Usage

### Backend Services (Bun)

```json
{
  "extends": "@cream/tsconfig/bun.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  }
}
```

### React Applications

```json
{
  "extends": "@cream/tsconfig/react.json",
  "compilerOptions": {
    "paths": { "@/*": ["./src/*"] }
  }
}
```

## Configuration Details

### Base Configuration

**Target & Module:**
- Target: ES2024
- Module: "Preserve"
- Module resolution: "bundler"

**Type Safety:**
- `strict: true`
- `noImplicitAny: true`
- `noUncheckedIndexedAccess: true`
- `noImplicitReturns: true`

**Module Compatibility:**
- `esModuleInterop: true`
- `resolveJsonModule: true`
- `isolatedModules: true`
- `verbatimModuleSyntax: true`

**Output:**
- `declaration: true`
- `declarationMap: true`
- `sourceMap: true`
- `noEmit: true` (type checking only)

### Bun Configuration

Adds Bun runtime types:
```json
{ "types": ["bun"] }
```

### React Configuration

Adds React/DOM support:
```json
{
  "jsx": "preserve",
  "lib": ["ES2024", "DOM", "DOM.Iterable"],
  "types": ["react", "react-dom"]
}
```

## Used By

- `apps/mastra`, `apps/worker`, `apps/dashboard-api` → bun.json
- `apps/dashboard` → react.json
- `packages/*` → bun.json
