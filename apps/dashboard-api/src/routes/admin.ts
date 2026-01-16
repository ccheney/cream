/**
 * Admin Routes
 *
 * Administrative endpoints for database monitoring and management.
 * Exposes pg_stat_statements data for query performance analysis.
 *
 * @see docs/plans/46-postgres-drizzle-migration.md
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { sql } from "drizzle-orm";
import { getDrizzleDb } from "../db.js";

const app = new OpenAPIHono();

// ============================================
// Schema Definitions
// ============================================

const QueryStatSchema = z.object({
	query: z.string(),
	calls: z.number(),
	totalSeconds: z.number(),
	avgMs: z.number(),
	rows: z.number(),
	sharedBlksHit: z.number(),
	sharedBlksRead: z.number(),
	hitRatio: z.number(),
});

const QueryStatsResponseSchema = z.object({
	stats: z.array(QueryStatSchema),
	summary: z.object({
		totalQueries: z.number(),
		avgResponseMs: z.number(),
		overallHitRatio: z.number(),
		slowQueryCount: z.number(),
	}),
	timestamp: z.string(),
});

const ResetStatsResponseSchema = z.object({
	success: z.boolean(),
	message: z.string(),
	timestamp: z.string(),
});

// ============================================
// Routes
// ============================================

// GET /admin/query-stats - Get pg_stat_statements data
const getQueryStatsRoute = createRoute({
	method: "get",
	path: "/query-stats",
	request: {
		query: z.object({
			limit: z.coerce.number().min(1).max(100).default(50).optional(),
			sortBy: z.enum(["total_time", "avg_time", "calls"]).default("total_time").optional(),
		}),
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: QueryStatsResponseSchema,
				},
			},
			description: "Query performance statistics",
		},
		503: {
			content: {
				"application/json": {
					schema: z.object({
						error: z.string(),
					}),
				},
			},
			description: "pg_stat_statements not available",
		},
	},
	tags: ["Admin"],
});

// @ts-expect-error - zod-openapi multi-response type inference limitation
app.openapi(getQueryStatsRoute, async (c) => {
	const { limit = 50, sortBy = "total_time" } = c.req.valid("query");
	const db = getDrizzleDb();

	try {
		// Check if pg_stat_statements is available
		const extensionCheck = await db.execute(sql`
			SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'
		`);

		if (extensionCheck.rows.length === 0) {
			return c.json({ error: "pg_stat_statements extension not installed" }, 503);
		}

		// Build ORDER BY clause based on sortBy parameter
		const orderByClause =
			sortBy === "avg_time"
				? sql`mean_exec_time DESC`
				: sortBy === "calls"
					? sql`calls DESC`
					: sql`total_exec_time DESC`;

		// Query pg_stat_statements
		const result = await db.execute(sql`
			SELECT
				query,
				calls::bigint as calls,
				total_exec_time / 1000 AS total_seconds,
				mean_exec_time AS avg_ms,
				rows::bigint as rows,
				shared_blks_hit::bigint as shared_blks_hit,
				shared_blks_read::bigint as shared_blks_read,
				CASE WHEN shared_blks_hit + shared_blks_read > 0
					THEN shared_blks_hit::float / (shared_blks_hit + shared_blks_read)
					ELSE 1.0
				END AS hit_ratio
			FROM pg_stat_statements
			WHERE query NOT LIKE '%pg_stat_statements%'
				AND query NOT LIKE '%pg_extension%'
				AND userid = (SELECT usesysid FROM pg_user WHERE usename = current_user)
			ORDER BY ${orderByClause}
			LIMIT ${limit}
		`);

		// Calculate summary stats
		const summaryResult = await db.execute(sql`
			SELECT
				SUM(calls)::bigint as total_calls,
				AVG(mean_exec_time) as avg_response_ms,
				CASE WHEN SUM(shared_blks_hit + shared_blks_read) > 0
					THEN SUM(shared_blks_hit)::float / SUM(shared_blks_hit + shared_blks_read)
					ELSE 1.0
				END AS overall_hit_ratio,
				COUNT(*) FILTER (WHERE mean_exec_time > 100) as slow_count
			FROM pg_stat_statements
			WHERE query NOT LIKE '%pg_stat_statements%'
				AND userid = (SELECT usesysid FROM pg_user WHERE usename = current_user)
		`);

		const summaryRow = summaryResult.rows[0] as {
			total_calls: string | number | null;
			avg_response_ms: string | number | null;
			overall_hit_ratio: string | number | null;
			slow_count: string | number | null;
		};

		const stats = result.rows.map((row) => {
			const r = row as {
				query: string;
				calls: string | number;
				total_seconds: string | number;
				avg_ms: string | number;
				rows: string | number;
				shared_blks_hit: string | number;
				shared_blks_read: string | number;
				hit_ratio: string | number;
			};
			return {
				query: r.query,
				calls: Number(r.calls),
				totalSeconds: Number(r.total_seconds),
				avgMs: Number(r.avg_ms),
				rows: Number(r.rows),
				sharedBlksHit: Number(r.shared_blks_hit),
				sharedBlksRead: Number(r.shared_blks_read),
				hitRatio: Number(r.hit_ratio),
			};
		});

		return c.json({
			stats,
			summary: {
				totalQueries: Number(summaryRow.total_calls ?? 0),
				avgResponseMs: Number(summaryRow.avg_response_ms ?? 0),
				overallHitRatio: Number(summaryRow.overall_hit_ratio ?? 1),
				slowQueryCount: Number(summaryRow.slow_count ?? 0),
			},
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return c.json({ error: `Failed to query pg_stat_statements: ${message}` }, 503);
	}
});

// POST /admin/query-stats/reset - Reset pg_stat_statements
const resetQueryStatsRoute = createRoute({
	method: "post",
	path: "/query-stats/reset",
	responses: {
		200: {
			content: {
				"application/json": {
					schema: ResetStatsResponseSchema,
				},
			},
			description: "Statistics reset successfully",
		},
		503: {
			content: {
				"application/json": {
					schema: z.object({
						error: z.string(),
					}),
				},
			},
			description: "Failed to reset statistics",
		},
	},
	tags: ["Admin"],
});

// @ts-expect-error - zod-openapi multi-response type inference limitation
app.openapi(resetQueryStatsRoute, async (c) => {
	const db = getDrizzleDb();

	try {
		await db.execute(sql`SELECT pg_stat_statements_reset()`);

		return c.json({
			success: true,
			message: "Query statistics reset successfully",
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return c.json({ error: `Failed to reset pg_stat_statements: ${message}` }, 503);
	}
});

export default app;
