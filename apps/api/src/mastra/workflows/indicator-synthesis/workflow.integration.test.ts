/**
 * Indicator Synthesis Workflow Integration Tests
 *
 * @deprecated These tests need to be migrated to use PostgreSQL/Drizzle.
 * The storage layer now uses Drizzle ORM with PostgreSQL instead of in-memory SQLite.
 * Skipping until migration is complete.
 *
 * @see docs/plans/36-dynamic-indicator-synthesis-workflow.md
 */

import { describe, test } from "bun:test";

describe.skip("Indicator Synthesis Workflow Integration", () => {
	test("TODO: migrate tests to PostgreSQL/Drizzle", () => {
		// Tests need to be rewritten to use PostgreSQL test database
		// instead of in-memory SQLite
	});
});
