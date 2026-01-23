# Codegen Sources of Truth Refactor Plan

## Goals
- Establish explicit, layered sources of truth for: persistence, API contracts, internal RPC, and client types.
- Eliminate drift between DB schema, repository I/O types, API schemas, and client types.
- Keep API schemas explicit (Zod OpenAPI) while deriving persistence schemas from Drizzle.
- Use generated artifacts consistently across the monorepo.
- Avoid shortcuts: every layer has its own truth with explicit mappings between layers.

## Non-Goals
- No redesign of domain logic, business rules, or service boundaries.
- No replacement of Protobuf/Buf or removal of Zod/OpenAPI.
- No runtime behavior changes beyond stricter validation and typing.
- No breaking API changes without intentional versioning.

## Current State Summary
- Persistence: Drizzle schema in `packages/storage/src/schema/*`. Manual Zod schemas in some repositories.
- API: Explicit Zod/OpenAPI schemas in `apps/dashboard-api/src/routes/*` with manual mapping from DB models.
- Client: Dashboard uses hand-written types; `@cream/dashboard-types` exists with manual Zod schemas.
- RPC: Protobuf in `packages/proto` with generated outputs in `packages/schema-gen` (TS/Rust).

## Target Architecture (Sources of Truth)
1) **Persistence Source of Truth**
   - Drizzle schema (`packages/storage/src/schema/*`).
   - Repository I/O schemas generated via `drizzle-zod`.
2) **API Source of Truth**
   - Zod/OpenAPI schemas co-located with Hono routes (`apps/dashboard-api/src/routes/*`).
   - Explicit mapping from repository/DB models to API schemas.
3) **Client Types Source of Truth**
   - OpenAPI spec generated from the API server (`/openapi.json`).
   - Type generation for dashboard clients and shared types.
4) **Internal RPC Source of Truth**
   - Protobuf definitions (`packages/proto`).
   - Generated outputs in `packages/schema-gen` (TS/Rust) consumed by internal services.

## Workstreams

### A) Persistence → Zod Generation (Repository I/O)
**Objective:** Generate Zod schemas from Drizzle tables and use them in repositories instead of manual Zod definitions.

**Tasks**
- Add a schema-generation layer:
  - Create `packages/storage/src/schema/zod/` (helpers + per-domain schema files).
  - Add helpers for numeric/Date conversions and ISO string mapping.
- For each repository with manual schemas, replace with generated Zod:
  - `candles`, `corporate-actions`, `features`, `regime-labels`, `universe-cache`, `historical-universe`, etc.
- Normalize enums:
  - Use Drizzle enums as the canonical source (`pgEnum.enumValues`).
  - Remove ad-hoc enum lists in repositories.
- Re-export generated schemas from `@cream/storage` (public API for internal consumers).

**Deliverables**
- New `schema/zod` module with generated Zod schemas.
- Repository updates to consume generated schemas.
- Enum drift eliminated at the repository layer.

**Risks / Mitigations**
- **Risk:** API expects values not supported by DB enums.
  - **Mitigation:** keep API enums explicit; map/transform in API layer if broader semantics are required.

---

### B) API Schemas Explicit + DB Mapping
**Objective:** Keep API schemas explicit (Zod/OpenAPI) while mapping DB/repository models into API types.

**Tasks**
- Standardize mapping helpers per route group (e.g., `mapToResponse` in each route file).
- Ensure every API response conforms to its Zod schema using parsing in dev/test where feasible.
- Make explicit request/response schemas in each route, centralized in `types.ts` when shared.
- Document mapping conventions in API docs (include transform expectations like ISO strings, enums, derived fields).

**Deliverables**
- Consistent mapping helpers per route group.
- API schemas remain explicit and decoupled from persistence.

**Risks / Mitigations**
- **Risk:** Increased mapping boilerplate.
  - **Mitigation:** shared mappers per route group and re-use of storage Zod for shared shapes when 1:1.

---

### C) OpenAPI → Client Type Generation
**Objective:** Generate client types from the API OpenAPI spec so the dashboard mirrors the API contract.

**Tasks**
- Add an OpenAPI export step (fetch `/openapi.json`).
- Generate TypeScript types (and optionally a typed client) into a shared package:
  - Prefer `packages/dashboard-types/src/openapi.ts` or a new package `@cream/dashboard-api-types`.
- Replace or re-export dashboard types to use generated OpenAPI types.
- Update dashboard usage to rely on generated API types, leaving UI-only types local.

**Deliverables**
- OpenAPI export script.
- Generated client types committed or reproducible in CI.
- Dashboard uses generated API types for requests/responses.

**Risks / Mitigations**
- **Risk:** OpenAPI spec depends on server running.
  - **Mitigation:** generate spec in CI via a short-lived server startup or by using a build-time export if supported by Hono.

---

### D) Protobuf as Internal RPC Source of Truth
**Objective:** Confirm Protobuf remains the canonical internal RPC contract with drift checks.

**Tasks**
- Update documentation to reflect actual paths (`packages/proto`, `packages/schema-gen`).
- Add/expand schema-sync tests to validate Zod mirrors where present (optional).
- Ensure `buf generate` remains in CI pipelines and is documented.

**Deliverables**
- Docs updated to match repo structure.
- Optional tests verifying proto/Zod sync.

---

## Implementation Sequence
1) **Phase 1: Persistence Layer**
   - Add `schema/zod` generation and refactor 1–2 repositories to validate the pattern.
   - Expand to remaining repositories.
2) **Phase 2: API Layer**
   - Standardize mapping patterns per route group.
   - Add light validation in dev/test (optional).
3) **Phase 3: Client Types**
   - Implement OpenAPI export + types generation.
   - Update dashboard usage to consume generated types.
4) **Phase 4: Protobuf Hygiene**
   - Update docs and optionally add proto sync tests.

## Acceptance Criteria
- Repository I/O schemas are generated from Drizzle and used consistently.
- API schemas remain explicit and map cleanly from repository types.
- Dashboard API client types are generated from OpenAPI, not handwritten.
- Protobuf remains the source of truth for internal RPC with validated generation.

## Open Questions
- Should generated OpenAPI types live in `@cream/dashboard-types` or a dedicated `@cream/dashboard-api-types`?
- Should OpenAPI generation be committed to repo or produced during CI only?
- Should API endpoints validate responses against Zod schemas in production or dev-only?

