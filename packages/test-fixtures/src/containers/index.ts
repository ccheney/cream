/**
 * Testcontainers Setup for Integration Tests
 *
 * Provides container management for integration testing with:
 * - Turso (libsql-server) for relational storage
 *
 * Usage:
 * ```typescript
 * import { startTursoContainer, stopAllContainers } from "@cream/test-fixtures/containers";
 *
 * beforeAll(async () => {
 *   const turso = await startTursoContainer();
 *   process.env.TURSO_DATABASE_URL = turso.getConnectionUrl();
 * });
 *
 * afterAll(async () => {
 *   await stopAllContainers();
 * });
 * ```
 */

export { getRunningContainers, stopAllContainers } from "./manager";
export { type StartedTursoContainer, startTursoContainer, TursoContainer } from "./turso";
