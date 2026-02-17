/**
 * Shared PostgresStore instance for both Mastra core and agent Memory.
 *
 * Agents are constructed before the Mastra instance, so Memory cannot
 * inherit storage automatically. This module provides a single
 * PostgresStore that is passed explicitly to both.
 */

import { PostgresStore } from "@mastra/pg";

const DATABASE_URLS: Record<string, string | undefined> = {
	PAPER: Bun.env.DATABASE_URL_PAPER ?? Bun.env.DATABASE_URL,
	LIVE: Bun.env.DATABASE_URL,
};

function getDatabaseUrl(): string {
	if (Bun.env.NODE_ENV === "test" && Bun.env.TEST_DATABASE_URL) {
		return Bun.env.TEST_DATABASE_URL;
	}

	const env = Bun.env.CREAM_ENV ?? "PAPER";
	const url = DATABASE_URLS[env];

	if (!url) {
		if (Bun.env.NODE_ENV === "test") {
			return "postgres://127.0.0.1:5432/cream_test";
		}

		throw new Error(
			`DATABASE_URL not configured for environment: ${env}. ` +
				`Set DATABASE_URL_${env} or DATABASE_URL environment variable.`,
		);
	}

	return url;
}

export const storage = new PostgresStore({
	id: "cream-mastra",
	connectionString: getDatabaseUrl(),
});
