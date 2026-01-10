/**
 * Filings Routes
 *
 * Endpoints for SEC filings ingestion management:
 * - Trigger manual sync
 * - Monitor sync progress
 * - Get filing statistics
 */

import { createFilingsIngestionService } from "@cream/filings";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getDbClient, getFilingSyncRunsRepo, getFilingsRepo } from "../db.js";

// ============================================
// Schemas
// ============================================

const FilingTypeSchema = z.enum(["10-K", "10-Q", "8-K", "DEF14A"]);
const EnvironmentSchema = z.enum(["BACKTEST", "PAPER", "LIVE"]);

const TriggerSyncRequestSchema = z.object({
  symbols: z.array(z.string()).min(1).describe("Stock symbols to sync filings for"),
  filingTypes: z
    .array(FilingTypeSchema)
    .optional()
    .describe("Filing types to fetch (default: 10-K, 10-Q, 8-K)"),
  startDate: z.string().optional().describe("Start date (YYYY-MM-DD)"),
  endDate: z.string().optional().describe("End date (YYYY-MM-DD)"),
  limitPerSymbol: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .describe("Max filings per symbol (default: 10)"),
  environment: EnvironmentSchema.default("PAPER"),
});

const TriggerSyncResponseSchema = z.object({
  runId: z.string(),
  status: z.enum(["queued", "running"]),
  symbolsRequested: z.array(z.string()),
  filingTypes: z.array(z.string()),
  startedAt: z.string(),
});

const SyncRunStatusSchema = z.object({
  runId: z.string(),
  status: z.enum(["running", "completed", "failed"]),
  symbolsRequested: z.array(z.string()),
  symbolsProcessed: z.number(),
  symbolsTotal: z.number(),
  filingsFetched: z.number(),
  filingsIngested: z.number(),
  chunksCreated: z.number(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  error: z.string().nullable(),
});

const FilingStatsSchema = z.object({
  totalFilings: z.number(),
  totalChunks: z.number(),
  byType: z.record(z.string(), z.number()),
  lastSyncRun: z
    .object({
      runId: z.string(),
      status: z.string(),
      completedAt: z.string(),
      filingsIngested: z.number(),
      chunksCreated: z.number(),
    })
    .nullable(),
  lastSyncTime: z.string().nullable(),
});

// ============================================
// In-Memory Sync State
// ============================================

interface SyncState {
  runId: string;
  status: "queued" | "running" | "completed" | "failed";
  symbolsRequested: string[];
  symbolsProcessed: number;
  symbolsTotal: number;
  filingsFetched: number;
  filingsIngested: number;
  chunksCreated: number;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
}

const syncStates = new Map<string, SyncState>();

/** Rate limit in milliseconds (1 hour) */
const SYNC_RATE_LIMIT_MS = 60 * 60 * 1000;

/** Track last sync time per environment */
const lastSyncTime = new Map<string, number>();

// ============================================
// Routes
// ============================================

const app = new OpenAPIHono();

// POST /api/filings/trigger-sync
const triggerSyncRoute = createRoute({
  method: "post",
  path: "/trigger-sync",
  request: {
    body: {
      content: { "application/json": { schema: TriggerSyncRequestSchema } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: TriggerSyncResponseSchema } },
      description: "Sync triggered successfully",
    },
    409: {
      content: {
        "application/json": {
          schema: z.object({ error: z.string(), runId: z.string().optional() }),
        },
      },
      description: "Sync already in progress",
    },
    429: {
      content: {
        "application/json": {
          schema: z.object({ error: z.string(), retryAfterMs: z.number() }),
        },
      },
      description: "Rate limited",
    },
  },
  tags: ["Filings"],
});

// @ts-expect-error - Hono OpenAPI multi-response type inference limitation
app.openapi(triggerSyncRoute, async (c) => {
  const body = c.req.valid("json");
  const { symbols, filingTypes, startDate, endDate, limitPerSymbol, environment } = body;

  // Check for running sync
  for (const [runId, state] of syncStates) {
    if (state.status === "queued" || state.status === "running") {
      return c.json({ error: "Sync already in progress", runId }, 409);
    }
  }

  // Rate limiting
  const lastSync = lastSyncTime.get(environment) ?? 0;
  const timeSinceLastSync = Date.now() - lastSync;
  if (timeSinceLastSync < SYNC_RATE_LIMIT_MS) {
    const retryAfterMs = SYNC_RATE_LIMIT_MS - timeSinceLastSync;
    return c.json(
      {
        error: `Rate limited. Try again in ${Math.ceil(retryAfterMs / 60000)} minutes.`,
        retryAfterMs,
      },
      429
    );
  }

  // Generate run ID
  const runId = `sync_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const startedAt = new Date().toISOString();
  const resolvedFilingTypes = filingTypes ?? ["10-K", "10-Q", "8-K"];

  // Track sync state
  const state: SyncState = {
    runId,
    status: "queued",
    symbolsRequested: symbols,
    symbolsProcessed: 0,
    symbolsTotal: symbols.length,
    filingsFetched: 0,
    filingsIngested: 0,
    chunksCreated: 0,
    startedAt,
    completedAt: null,
    error: null,
  };
  syncStates.set(runId, state);
  lastSyncTime.set(environment, Date.now());

  // Run sync asynchronously
  const runSync = async () => {
    state.status = "running";

    try {
      const dbClient = await getDbClient();
      const service = createFilingsIngestionService(dbClient);

      const result = await service.syncFilings(
        {
          symbols,
          filingTypes: resolvedFilingTypes as Array<"10-K" | "10-Q" | "8-K" | "DEF14A">,
          startDate,
          endDate,
          limitPerSymbol,
          triggerSource: "dashboard",
          environment,
        },
        (progress) => {
          // Update state
          state.symbolsProcessed = progress.symbolsProcessed;
          state.filingsIngested = progress.filingsIngested ?? 0;
          state.chunksCreated = progress.chunksCreated ?? 0;
        }
      );

      // Update final state
      state.status = result.success ? "completed" : "failed";
      state.completedAt = new Date().toISOString();
      state.filingsFetched = result.filingsFetched;
      state.filingsIngested = result.filingsIngested;
      state.chunksCreated = result.chunksCreated;
      if (!result.success) {
        state.error = result.errors.join("; ");
      }
    } catch (error) {
      state.status = "failed";
      state.completedAt = new Date().toISOString();
      state.error = error instanceof Error ? error.message : "Unknown error";
    }
  };

  // Start without awaiting
  runSync();

  return c.json({
    runId,
    status: "queued",
    symbolsRequested: symbols,
    filingTypes: resolvedFilingTypes,
    startedAt,
  });
});

// GET /api/filings/sync/:runId
const syncStatusRoute = createRoute({
  method: "get",
  path: "/sync/:runId",
  request: {
    params: z.object({
      runId: z.string(),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: SyncRunStatusSchema } },
      description: "Sync run status",
    },
    404: {
      content: {
        "application/json": {
          schema: z.object({ error: z.string() }),
        },
      },
      description: "Sync run not found",
    },
  },
  tags: ["Filings"],
});

// @ts-expect-error - Hono OpenAPI multi-response type inference limitation
app.openapi(syncStatusRoute, async (c) => {
  const { runId } = c.req.valid("param");

  const state = syncStates.get(runId);
  if (!state) {
    // Try database
    const syncRunsRepo = await getFilingSyncRunsRepo();
    const dbRun = await syncRunsRepo.findById(runId);
    if (!dbRun) {
      return c.json({ error: "Sync run not found" }, 404);
    }

    return c.json({
      runId: dbRun.id,
      status: dbRun.status,
      symbolsRequested: dbRun.symbolsRequested,
      symbolsProcessed: dbRun.symbolsProcessed,
      symbolsTotal: dbRun.symbolsTotal,
      filingsFetched: dbRun.filingsFetched,
      filingsIngested: dbRun.filingsIngested,
      chunksCreated: dbRun.chunksCreated,
      startedAt: dbRun.startedAt,
      completedAt: dbRun.completedAt,
      error: dbRun.errorMessage,
    });
  }

  return c.json({
    runId: state.runId,
    status: state.status,
    symbolsRequested: state.symbolsRequested,
    symbolsProcessed: state.symbolsProcessed,
    symbolsTotal: state.symbolsTotal,
    filingsFetched: state.filingsFetched,
    filingsIngested: state.filingsIngested,
    chunksCreated: state.chunksCreated,
    startedAt: state.startedAt,
    completedAt: state.completedAt,
    error: state.error,
  });
});

// GET /api/filings/status
const statusRoute = createRoute({
  method: "get",
  path: "/status",
  responses: {
    200: {
      content: { "application/json": { schema: FilingStatsSchema } },
      description: "Filing statistics and last sync info",
    },
  },
  tags: ["Filings"],
});

app.openapi(statusRoute, async (c) => {
  const [filingsRepo, syncRunsRepo] = await Promise.all([
    getFilingsRepo(),
    getFilingSyncRunsRepo(),
  ]);

  const [stats, lastRun] = await Promise.all([
    filingsRepo.getOverallStats(),
    syncRunsRepo.getLastSuccessful(),
  ]);

  return c.json({
    totalFilings: stats.total,
    totalChunks: stats.totalChunks,
    byType: stats.byType,
    lastSyncRun: lastRun
      ? {
          runId: lastRun.id,
          status: lastRun.status,
          completedAt: lastRun.completedAt ?? lastRun.startedAt,
          filingsIngested: lastRun.filingsIngested,
          chunksCreated: lastRun.chunksCreated,
        }
      : null,
    lastSyncTime: lastRun?.completedAt ?? null,
  });
});

export default app;
