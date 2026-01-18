#!/usr/bin/env bun
/**
 * Database Reset Script
 *
 * Drops and recreates the database schema, then runs all migrations.
 * Use this for fresh installations or to completely reset the database.
 *
 * Usage:
 *   bun run db:reset
 *
 * Environment:
 *   DATABASE_URL - PostgreSQL connection string (required)
 *
 * WARNING: This will DELETE ALL DATA in the database!
 */

import pg from "pg";

const DATABASE_URL =
	process.env.DATABASE_URL ?? "postgresql://cream:cream_dev_password@localhost:5432/cream";

async function main() {
	// Parse database name from URL
	const url = new URL(DATABASE_URL);
	const dbName = url.pathname.slice(1); // Remove leading /
	const adminUrl = `${url.protocol}//${url.username}:${url.password}@${url.host}/postgres`;

	// Connect to postgres database (admin)
	const adminClient = new pg.Client({ connectionString: adminUrl });
	await adminClient.connect();

	try {
		await adminClient.query(`
			SELECT pg_terminate_backend(pid)
			FROM pg_stat_activity
			WHERE datname = '${dbName}' AND pid <> pg_backend_pid()
		`);
		await adminClient.query(`DROP DATABASE IF EXISTS "${dbName}"`);
		await adminClient.query(`CREATE DATABASE "${dbName}"`);
	} finally {
		await adminClient.end();
	}

	// Connect to the new database and set up extensions
	const client = new pg.Client({ connectionString: DATABASE_URL });
	await client.connect();

	try {
		await client.query("CREATE EXTENSION IF NOT EXISTS pg_uuidv7");
	} finally {
		await client.end();
	}
	const proc = Bun.spawn(["bun", "--bun", "x", "drizzle-kit", "migrate"], {
		cwd: `${import.meta.dir}/..`,
		env: { ...process.env, DATABASE_URL },
		stdout: "inherit",
		stderr: "inherit",
	});

	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		process.exit(1);
	}
}

main().catch((_err) => {
	process.exit(1);
});
