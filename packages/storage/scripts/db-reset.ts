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
	console.log("🗄️  Database Reset Script");
	console.log("========================\n");

	// Parse database name from URL
	const url = new URL(DATABASE_URL);
	const dbName = url.pathname.slice(1); // Remove leading /
	const adminUrl = `${url.protocol}//${url.username}:${url.password}@${url.host}/postgres`;

	console.log(`Target database: ${dbName}`);
	console.log(`Host: ${url.host}\n`);

	// Connect to postgres database (admin)
	const adminClient = new pg.Client({ connectionString: adminUrl });
	await adminClient.connect();

	try {
		// Terminate existing connections to the target database
		console.log("Terminating existing connections...");
		await adminClient.query(`
			SELECT pg_terminate_backend(pid)
			FROM pg_stat_activity
			WHERE datname = '${dbName}' AND pid <> pg_backend_pid()
		`);

		// Drop the database if it exists
		console.log(`Dropping database ${dbName}...`);
		await adminClient.query(`DROP DATABASE IF EXISTS "${dbName}"`);

		// Create fresh database
		console.log(`Creating database ${dbName}...`);
		await adminClient.query(`CREATE DATABASE "${dbName}"`);

		console.log("✓ Database recreated\n");
	} finally {
		await adminClient.end();
	}

	// Connect to the new database and set up extensions
	const client = new pg.Client({ connectionString: DATABASE_URL });
	await client.connect();

	try {
		// Create required extensions and functions
		console.log("Creating extensions and functions...");

		// Try pg_uuidv7 extension first, fallback to custom function
		try {
			await client.query("CREATE EXTENSION IF NOT EXISTS pg_uuidv7");
			console.log("  ✓ pg_uuidv7 extension installed");
		} catch {
			console.log("  ⚠ pg_uuidv7 not available, creating fallback function...");
			// Create a UUIDv7-compatible function using gen_random_uuid() as base
			// This generates time-ordered UUIDs (not strictly UUIDv7 but compatible)
			await client.query(`
				CREATE OR REPLACE FUNCTION uuidv7() RETURNS uuid AS $$
				DECLARE
					unix_ts_ms bytea;
					uuid_bytes bytea;
				BEGIN
					unix_ts_ms = substring(int8send(floor(extract(epoch from clock_timestamp()) * 1000)::bigint) from 3);
					uuid_bytes = unix_ts_ms || gen_random_uuid()::text::bytea;
					-- Set version to 7 and variant to RFC 4122
					uuid_bytes = set_byte(uuid_bytes, 6, (get_byte(uuid_bytes, 6) & 15) | 112);
					uuid_bytes = set_byte(uuid_bytes, 8, (get_byte(uuid_bytes, 8) & 63) | 128);
					RETURN encode(substring(uuid_bytes from 1 for 16), 'hex')::uuid;
				END;
				$$ LANGUAGE plpgsql VOLATILE;
			`);
			console.log("  ✓ uuidv7() fallback function created");
		}

		console.log("✓ Database setup complete\n");
	} finally {
		await client.end();
	}

	// Run migrations using drizzle-kit
	console.log("Running migrations...");
	const proc = Bun.spawn(["bun", "--bun", "x", "drizzle-kit", "migrate"], {
		cwd: `${import.meta.dir}/..`,
		env: { ...process.env, DATABASE_URL },
		stdout: "inherit",
		stderr: "inherit",
	});

	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		console.error("\n✗ Migration failed");
		process.exit(1);
	}

	console.log("\n✓ Database reset complete!");
	console.log("\nNext steps:");
	console.log("  - Run 'bun run db:seed' to populate initial data");
	console.log("  - Or start your application");
}

main().catch((err) => {
	console.error("Error:", err);
	process.exit(1);
});
