/**
 * Batch Status API Routes
 *
 * Endpoint for retrieving indicator batch job status from the
 * indicator_sync_runs table.
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getDbClient } from "../db.js";

const app = new OpenAPIHono();

// ============================================
// Schema Definitions
// ============================================

const SyncRunTypeSchema = z.enum([
  "fundamentals",
  "short_interest",
  "sentiment",
  "corporate_actions",
]);

const SyncRunStatusSchema = z.enum(["running", "completed", "failed"]);

const SyncRunSchema = z.object({
  id: z.string(),
  run_type: SyncRunTypeSchema,
  started_at: z.string(),
  completed_at: z.string().nullable(),
  symbols_processed: z.number(),
  symbols_failed: z.number(),
  status: SyncRunStatusSchema,
  error_message: z.string().nullable(),
  environment: z.string(),
});

const BatchStatusResponseSchema = z.object({
  runs: z.array(SyncRunSchema),
  summary: z.object({
    total_runs: z.number(),
    running: z.number(),
    completed: z.number(),
    failed: z.number(),
    last_completed: z.record(SyncRunTypeSchema, z.string().nullable()),
  }),
});

const ErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
});

type SyncRun = z.infer<typeof SyncRunSchema>;

// ============================================
// Route Definition
// ============================================

const getBatchStatusRoute = createRoute({
  method: "get",
  path: "/batch/status",
  request: {
    query: z.object({
      limit: z.coerce.number().min(1).max(100).default(20),
      type: SyncRunTypeSchema.optional(),
      status: SyncRunStatusSchema.optional(),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: BatchStatusResponseSchema } },
      description: "Recent batch job runs with summary",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Database service unavailable",
    },
  },
  tags: ["Indicators"],
});

app.openapi(getBatchStatusRoute, async (c) => {
  const { limit, type, status } = c.req.valid("query");

  try {
    const db = await getDbClient();

    // Build dynamic query with filters
    const conditions: string[] = [];
    const args: (string | number)[] = [];

    if (type) {
      conditions.push("run_type = ?");
      args.push(type);
    }
    if (status) {
      conditions.push("status = ?");
      args.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Get recent runs
    const runsQuery = `
      SELECT id, run_type, started_at, completed_at,
             symbols_processed, symbols_failed, status,
             error_message, environment
      FROM indicator_sync_runs
      ${whereClause}
      ORDER BY started_at DESC
      LIMIT ?
    `;
    args.push(limit);

    const rows = await db.execute(runsQuery, args);

    const runs: SyncRun[] = rows.map((row) => ({
      id: row.id as string,
      run_type: row.run_type as z.infer<typeof SyncRunTypeSchema>,
      started_at: row.started_at as string,
      completed_at: row.completed_at as string | null,
      symbols_processed: (row.symbols_processed as number) ?? 0,
      symbols_failed: (row.symbols_failed as number) ?? 0,
      status: row.status as z.infer<typeof SyncRunStatusSchema>,
      error_message: row.error_message as string | null,
      environment: row.environment as string,
    }));

    // Get summary statistics
    const summaryRows = await db.execute(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM indicator_sync_runs
    `);

    const summaryRow = summaryRows[0];

    // Get last completed time for each run type
    const lastCompletedRows = await db.execute(`
      SELECT run_type, MAX(completed_at) as last_completed
      FROM indicator_sync_runs
      WHERE status = 'completed'
      GROUP BY run_type
    `);

    const lastCompleted: Record<string, string | null> = {
      fundamentals: null,
      short_interest: null,
      sentiment: null,
      corporate_actions: null,
    };

    for (const row of lastCompletedRows) {
      const runType = row.run_type as string;
      lastCompleted[runType] = row.last_completed as string | null;
    }

    return c.json(
      {
        runs,
        summary: {
          total_runs: (summaryRow?.total as number) ?? 0,
          running: (summaryRow?.running as number) ?? 0,
          completed: (summaryRow?.completed as number) ?? 0,
          failed: (summaryRow?.failed as number) ?? 0,
          last_completed: lastCompleted as Record<z.infer<typeof SyncRunTypeSchema>, string | null>,
        },
      },
      200
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new HTTPException(503, {
      message: `Failed to fetch batch status: ${message}`,
    });
  }
});

// ============================================
// Get Single Run Details
// ============================================

const getSyncRunRoute = createRoute({
  method: "get",
  path: "/batch/status/:id",
  request: {
    params: z.object({
      id: z.string(),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ run: SyncRunSchema }) } },
      description: "Single sync run details",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Sync run not found",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Database service unavailable",
    },
  },
  tags: ["Indicators"],
});

app.openapi(getSyncRunRoute, async (c) => {
  const { id } = c.req.valid("param");

  try {
    const db = await getDbClient();

    const rows = await db.execute(
      `SELECT id, run_type, started_at, completed_at,
              symbols_processed, symbols_failed, status,
              error_message, environment
       FROM indicator_sync_runs
       WHERE id = ?`,
      [id]
    );

    const row = rows[0];
    if (!row) {
      throw new HTTPException(404, { message: `Sync run ${id} not found` });
    }

    const run: SyncRun = {
      id: row.id as string,
      run_type: row.run_type as z.infer<typeof SyncRunTypeSchema>,
      started_at: row.started_at as string,
      completed_at: row.completed_at as string | null,
      symbols_processed: (row.symbols_processed as number) ?? 0,
      symbols_failed: (row.symbols_failed as number) ?? 0,
      status: row.status as z.infer<typeof SyncRunStatusSchema>,
      error_message: row.error_message as string | null,
      environment: row.environment as string,
    };

    return c.json({ run }, 200);
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new HTTPException(503, {
      message: `Failed to fetch sync run: ${message}`,
    });
  }
});

export default app;
