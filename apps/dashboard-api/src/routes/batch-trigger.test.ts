import { beforeAll, describe, expect, mock, test } from "bun:test";
import batchTriggerRoutes from "./batch-trigger";

// Mock data for indicator_sync_runs
const mockSyncRuns: Array<{
  id: string;
  run_type: string;
  started_at: string;
  status: string;
  symbols_processed: number;
  symbols_failed: number;
  environment: string;
  error_message: string | null;
}> = [];

beforeAll(() => {
  process.env.CREAM_ENV = "BACKTEST";
});

mock.module("../db", () => ({
  getDbClient: async () => ({
    execute: async (query: string, args?: unknown[]) => {
      // Check for running jobs
      if (query.includes("status = 'running'")) {
        const jobType = args?.[0] as string;
        const runningJob = mockSyncRuns.find(
          (r) => r.run_type === jobType && r.status === "running"
        );
        return runningJob ? [runningJob] : [];
      }

      // Check job status for cancel
      if (query.includes("SELECT status FROM indicator_sync_runs WHERE id = ?")) {
        const id = args?.[0] as string;
        const run = mockSyncRuns.find((r) => r.id === id);
        return run ? [{ status: run.status }] : [];
      }

      return [];
    },
    run: async (query: string, args?: unknown[]) => {
      // Insert new trigger request
      if (query.includes("INSERT INTO indicator_sync_runs")) {
        const id = args?.[0] as string;
        const runType = args?.[1] as string;
        const startedAt = args?.[2] as string;
        const environment = args?.[3] as string;

        mockSyncRuns.push({
          id,
          run_type: runType,
          started_at: startedAt,
          status: "pending",
          symbols_processed: 0,
          symbols_failed: 0,
          environment,
          error_message: null,
        });
        return { changes: 1 };
      }

      // Update for cancel
      if (query.includes("UPDATE indicator_sync_runs")) {
        const id = args?.[0] as string;
        const run = mockSyncRuns.find((r) => r.id === id);
        if (run) {
          run.status = "failed";
          run.error_message = "Cancelled by user";
        }
        return { changes: run ? 1 : 0 };
      }

      return { changes: 0 };
    },
  }),
}));

describe("Batch Trigger Routes", () => {
  describe("POST /batch/trigger", () => {
    test("creates a trigger request for fundamentals job", async () => {
      const res = await batchTriggerRoutes.request("/batch/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_type: "fundamentals",
          priority: "normal",
        }),
      });

      expect(res.status).toBe(202);
      const data = await res.json();
      expect(data.run_id).toBeDefined();
      expect(data.job_type).toBe("fundamentals");
      expect(data.status).toBe("pending");
      expect(data.message).toContain("fundamentals");
    });

    test("creates a trigger request with specific symbols", async () => {
      const symbols = ["AAPL", "GOOGL", "MSFT"];
      const res = await batchTriggerRoutes.request("/batch/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_type: "short_interest",
          symbols,
          priority: "high",
        }),
      });

      expect(res.status).toBe(202);
      const data = await res.json();
      expect(data.symbols_count).toBe(3);
      expect(data.message).toContain("3 symbols");
    });

    test("creates trigger request for sentiment job", async () => {
      const res = await batchTriggerRoutes.request("/batch/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_type: "sentiment",
        }),
      });

      expect(res.status).toBe(202);
      const data = await res.json();
      expect(data.job_type).toBe("sentiment");
    });

    test("creates trigger request for corporate_actions job", async () => {
      const res = await batchTriggerRoutes.request("/batch/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_type: "corporate_actions",
        }),
      });

      expect(res.status).toBe(202);
      const data = await res.json();
      expect(data.job_type).toBe("corporate_actions");
    });

    test("returns 400 for invalid job type", async () => {
      const res = await batchTriggerRoutes.request("/batch/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_type: "invalid_type",
        }),
      });

      expect(res.status).toBe(400);
    });

    test("returns 400 for missing job_type", async () => {
      const res = await batchTriggerRoutes.request("/batch/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });

    test("returns 400 for too many symbols", async () => {
      const symbols = Array.from({ length: 501 }, (_, i) => `SYM${i}`);
      const res = await batchTriggerRoutes.request("/batch/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_type: "fundamentals",
          symbols,
        }),
      });

      expect(res.status).toBe(400);
    });

    test("returns 409 when job of same type is already running", async () => {
      // Add a running job to mock data
      mockSyncRuns.push({
        id: "run-existing",
        run_type: "fundamentals",
        started_at: new Date().toISOString(),
        status: "running",
        symbols_processed: 50,
        symbols_failed: 0,
        environment: "BACKTEST",
        error_message: null,
      });

      const res = await batchTriggerRoutes.request("/batch/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_type: "fundamentals",
        }),
      });

      expect(res.status).toBe(409);

      // Clean up
      const idx = mockSyncRuns.findIndex((r) => r.id === "run-existing");
      if (idx >= 0) mockSyncRuns.splice(idx, 1);
    });
  });

  describe("POST /batch/cancel/:id", () => {
    test("cancels a pending job", async () => {
      // Add a pending job
      mockSyncRuns.push({
        id: "run-to-cancel",
        run_type: "fundamentals",
        started_at: new Date().toISOString(),
        status: "pending",
        symbols_processed: 0,
        symbols_failed: 0,
        environment: "BACKTEST",
        error_message: null,
      });

      const res = await batchTriggerRoutes.request("/batch/cancel/run-to-cancel", {
        method: "POST",
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.message).toContain("run-to-cancel");

      // Clean up
      const idx = mockSyncRuns.findIndex((r) => r.id === "run-to-cancel");
      if (idx >= 0) mockSyncRuns.splice(idx, 1);
    });

    test("cancels a running job", async () => {
      mockSyncRuns.push({
        id: "run-running",
        run_type: "sentiment",
        started_at: new Date().toISOString(),
        status: "running",
        symbols_processed: 25,
        symbols_failed: 0,
        environment: "BACKTEST",
        error_message: null,
      });

      const res = await batchTriggerRoutes.request("/batch/cancel/run-running", {
        method: "POST",
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      // Clean up
      const idx = mockSyncRuns.findIndex((r) => r.id === "run-running");
      if (idx >= 0) mockSyncRuns.splice(idx, 1);
    });

    test("returns 404 for non-existent job", async () => {
      const res = await batchTriggerRoutes.request("/batch/cancel/non-existent", {
        method: "POST",
      });

      expect(res.status).toBe(404);
    });

    test("returns 409 when trying to cancel completed job", async () => {
      mockSyncRuns.push({
        id: "run-completed",
        run_type: "fundamentals",
        started_at: new Date().toISOString(),
        status: "completed",
        symbols_processed: 100,
        symbols_failed: 0,
        environment: "BACKTEST",
        error_message: null,
      });

      const res = await batchTriggerRoutes.request("/batch/cancel/run-completed", {
        method: "POST",
      });

      expect(res.status).toBe(409);

      // Clean up
      const idx = mockSyncRuns.findIndex((r) => r.id === "run-completed");
      if (idx >= 0) mockSyncRuns.splice(idx, 1);
    });

    test("returns 409 when trying to cancel failed job", async () => {
      mockSyncRuns.push({
        id: "run-failed",
        run_type: "short_interest",
        started_at: new Date().toISOString(),
        status: "failed",
        symbols_processed: 0,
        symbols_failed: 100,
        environment: "BACKTEST",
        error_message: "API error",
      });

      const res = await batchTriggerRoutes.request("/batch/cancel/run-failed", {
        method: "POST",
      });

      expect(res.status).toBe(409);

      // Clean up
      const idx = mockSyncRuns.findIndex((r) => r.id === "run-failed");
      if (idx >= 0) mockSyncRuns.splice(idx, 1);
    });
  });
});
