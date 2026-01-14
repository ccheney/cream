import { readdir, stat } from "node:fs/promises";
import { log } from "./logger.js";
import type { TursoClient } from "./turso.js";

export interface Migration {
	version: number;
	name: string;
	filename: string;
	sql: string;
	/** For init/ directory migrations, lists component files */
	sourceFiles?: string[];
}

export interface AppliedMigration {
	version: number;
	name: string;
	applied_at: string;
	[key: string]: unknown; // Row compatibility
}

export interface MigrationResult {
	applied: Migration[];
	rolledBack: Migration[];
	currentVersion: number;
	durationMs: number;
}

export interface MigrationOptions {
	migrationsDir?: string;
	targetVersion?: number;
	dryRun?: boolean;
	logger?: (message: string) => void;
}

const DEFAULT_MIGRATIONS_DIR = `${import.meta.dir}/../migrations`;

const MIGRATION_FILE_PATTERN = /^(\d{3})_(.+)\.sql$/;
const ROLLBACK_FILE_PATTERN = /^(\d{3})_(.+)_down\.sql$/;

export async function runMigrations(
	client: TursoClient,
	options: MigrationOptions = {}
): Promise<MigrationResult> {
	const {
		migrationsDir = DEFAULT_MIGRATIONS_DIR,
		targetVersion,
		dryRun = false,
		logger = (msg: string) => log.info({}, msg),
	} = options;

	const startTime = Date.now();

	await ensureMigrationsTable(client);

	const appliedMigrations = await getAppliedMigrations(client);
	const appliedVersions = new Set(appliedMigrations.map((m) => m.version));
	const currentVersion = Math.max(0, ...appliedVersions);

	const availableMigrations = await loadMigrations(migrationsDir, "up");

	const pendingMigrations = availableMigrations
		.filter((m) => !appliedVersions.has(m.version))
		.filter((m) => (targetVersion !== undefined ? m.version <= targetVersion : true))
		.sort((a, b) => a.version - b.version);

	if (pendingMigrations.length === 0) {
		logger("No pending migrations");
		return {
			applied: [],
			rolledBack: [],
			currentVersion,
			durationMs: Date.now() - startTime,
		};
	}

	const applied: Migration[] = [];

	for (const migration of pendingMigrations) {
		logger(`Applying migration ${migration.version}: ${migration.name}`);

		if (!dryRun) {
			try {
				await executeSqlStatements(client, migration.sql);
				applied.push(migration);
			} catch (error) {
				logger(`Failed to apply migration ${migration.version}: ${error}`);
				throw new MigrationError(
					`Migration ${migration.version} (${migration.name}) failed`,
					migration,
					error
				);
			}
		} else {
			logger(`[DRY RUN] Would apply: ${migration.filename}`);
			applied.push(migration);
		}
	}

	const lastApplied = applied[applied.length - 1];
	const newVersion = applied.length > 0 && lastApplied ? lastApplied.version : currentVersion;

	logger(`Applied ${applied.length} migration(s). Current version: ${newVersion}`);

	return {
		applied,
		rolledBack: [],
		currentVersion: newVersion,
		durationMs: Date.now() - startTime,
	};
}

export async function rollbackMigrations(
	client: TursoClient,
	options: MigrationOptions = {}
): Promise<MigrationResult> {
	const {
		migrationsDir = DEFAULT_MIGRATIONS_DIR,
		targetVersion = 0,
		dryRun = false,
		logger = (msg: string) => log.info({}, msg),
	} = options;

	const startTime = Date.now();

	const appliedMigrations = await getAppliedMigrations(client);
	const currentVersion = Math.max(0, ...appliedMigrations.map((m) => m.version));

	if (currentVersion <= targetVersion) {
		logger(`Already at version ${currentVersion}, nothing to rollback`);
		return {
			applied: [],
			rolledBack: [],
			currentVersion,
			durationMs: Date.now() - startTime,
		};
	}

	const rollbackMigrations = await loadMigrations(migrationsDir, "down");

	const toRollback = rollbackMigrations
		.filter((m) => m.version > targetVersion && m.version <= currentVersion)
		.sort((a, b) => b.version - a.version);

	if (toRollback.length === 0) {
		logger("No rollback migrations found");
		return {
			applied: [],
			rolledBack: [],
			currentVersion,
			durationMs: Date.now() - startTime,
		};
	}

	const rolledBack: Migration[] = [];

	for (const migration of toRollback) {
		logger(`Rolling back migration ${migration.version}: ${migration.name}`);

		if (!dryRun) {
			try {
				await executeSqlStatements(client, migration.sql);
				rolledBack.push(migration);
			} catch (error) {
				logger(`Failed to rollback migration ${migration.version}: ${error}`);
				throw new MigrationError(
					`Rollback of migration ${migration.version} (${migration.name}) failed`,
					migration,
					error
				);
			}
		} else {
			logger(`[DRY RUN] Would rollback: ${migration.filename}`);
			rolledBack.push(migration);
		}
	}

	const newVersion = targetVersion;

	logger(`Rolled back ${rolledBack.length} migration(s). Current version: ${newVersion}`);

	return {
		applied: [],
		rolledBack,
		currentVersion: newVersion,
		durationMs: Date.now() - startTime,
	};
}

export async function getMigrationStatus(
	client: TursoClient,
	options: Pick<MigrationOptions, "migrationsDir"> = {}
): Promise<{
	currentVersion: number;
	applied: AppliedMigration[];
	pending: Migration[];
	available: Migration[];
}> {
	const { migrationsDir = DEFAULT_MIGRATIONS_DIR } = options;

	await ensureMigrationsTable(client);

	const applied = await getAppliedMigrations(client);
	const appliedVersions = new Set(applied.map((m) => m.version));
	const currentVersion = Math.max(0, ...appliedVersions);

	const available = await loadMigrations(migrationsDir, "up");
	const pending = available.filter((m) => !appliedVersions.has(m.version));

	return {
		currentVersion,
		applied,
		pending,
		available,
	};
}

async function ensureMigrationsTable(client: TursoClient): Promise<void> {
	await client.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

async function getAppliedMigrations(client: TursoClient): Promise<AppliedMigration[]> {
	try {
		return await client.execute<AppliedMigration>(
			"SELECT version, name, applied_at FROM schema_migrations ORDER BY version"
		);
	} catch {
		// Table might not exist yet
		return [];
	}
}

async function loadMigrations(dir: string, direction: "up" | "down"): Promise<Migration[]> {
	const pattern = direction === "up" ? MIGRATION_FILE_PATTERN : ROLLBACK_FILE_PATTERN;
	const migrations: Migration[] = [];

	try {
		const files = await readdir(dir);

		// Check for init/ directory (version 1)
		if (direction === "up" && files.includes("init")) {
			const initDir = `${dir}/init`;
			const initStat = await stat(initDir);

			if (initStat.isDirectory()) {
				const initMigration = await loadInitDirectory(initDir);
				if (initMigration) {
					migrations.push(initMigration);
				}
			}
		}

		// Load numbered migrations (002+, or 001+ if no init/ directory)
		for (const file of files) {
			const match = file.match(pattern);
			if (!match) {
				continue;
			}

			if (direction === "up" && file.includes("_down.sql")) {
				continue;
			}

			const versionStr = match[1];
			if (versionStr === undefined) {
				continue;
			}
			const version = parseInt(versionStr, 10);

			// Skip 001_init.sql if we have init/ directory
			if (version === 1 && migrations.some((m) => m.version === 1)) {
				continue;
			}

			const name = match[2]?.replace(/_down$/, "") ?? "";
			const sql = await Bun.file(`${dir}/${file}`).text();

			migrations.push({
				version,
				name,
				filename: file,
				sql,
			});
		}
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			throw new Error(`Migrations directory not found: ${dir}`);
		}
		throw error;
	}

	return migrations.sort((a, b) => a.version - b.version);
}

/**
 * Load all SQL files from init/ directory and combine them into a single migration.
 * Files are sorted alphabetically (00_schema.sql, 01_core.sql, etc.)
 */
async function loadInitDirectory(initDir: string): Promise<Migration | null> {
	const files = await readdir(initDir);
	const sqlFiles = files.filter((f) => f.endsWith(".sql")).sort();

	if (sqlFiles.length === 0) {
		return null;
	}

	const sqlParts: string[] = [];

	for (const file of sqlFiles) {
		const content = await Bun.file(`${initDir}/${file}`).text();
		sqlParts.push(`-- Source: init/${file}\n${content}`);
	}

	return {
		version: 1,
		name: "init",
		filename: "init/",
		sql: sqlParts.join("\n\n"),
		sourceFiles: sqlFiles,
	};
}

async function executeSqlStatements(client: TursoClient, sql: string): Promise<void> {
	const withoutComments = sql.replace(/--[^\n]*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

	// Simple semicolon split works for migration files (no semicolons in string literals)
	const statements = withoutComments
		.split(";")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);

	for (const statement of statements) {
		if (!statement || /^\s*$/.test(statement)) {
			continue;
		}
		await client.run(statement);
	}
}

export class MigrationError extends Error {
	constructor(
		message: string,
		public readonly migration: Migration,
		public override readonly cause: unknown
	) {
		super(message);
		this.name = "MigrationError";
	}
}
