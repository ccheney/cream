/**
 * Batch Job Status Tests
 *
 * Tests for the BatchJobStatus component and useBatchStatus hook.
 *
 * @see docs/plans/ui/24-components.md
 */

import { describe, expect, it } from "bun:test";

import type {
  BatchStatusResponse,
  BatchStatusSummary,
  SyncRun,
  SyncRunStatus,
  SyncRunType,
} from "@/hooks/queries/useBatchStatus";

// ============================================
// Type Tests
// ============================================

describe("SyncRunType", () => {
  it("includes all expected run types", () => {
    const types: SyncRunType[] = [
      "fundamentals",
      "short_interest",
      "sentiment",
      "corporate_actions",
    ];
    expect(types.length).toBe(4);
  });
});

describe("SyncRunStatus", () => {
  it("includes all expected statuses", () => {
    const statuses: SyncRunStatus[] = ["running", "completed", "failed"];
    expect(statuses.length).toBe(3);
  });
});

// ============================================
// Mock Data
// ============================================

const mockSyncRun: SyncRun = {
  id: "run-001",
  run_type: "fundamentals",
  started_at: "2024-01-15T10:00:00Z",
  completed_at: "2024-01-15T10:05:00Z",
  symbols_processed: 500,
  symbols_failed: 3,
  status: "completed",
  error_message: null,
  environment: "PAPER",
};

const mockFailedRun: SyncRun = {
  id: "run-002",
  run_type: "sentiment",
  started_at: "2024-01-15T11:00:00Z",
  completed_at: "2024-01-15T11:02:00Z",
  symbols_processed: 100,
  symbols_failed: 50,
  status: "failed",
  error_message: "API rate limit exceeded",
  environment: "PAPER",
};

const mockRunningRun: SyncRun = {
  id: "run-003",
  run_type: "short_interest",
  started_at: "2024-01-15T12:00:00Z",
  completed_at: null,
  symbols_processed: 250,
  symbols_failed: 0,
  status: "running",
  error_message: null,
  environment: "PAPER",
};

const mockSummary: BatchStatusSummary = {
  total_runs: 100,
  running: 1,
  completed: 95,
  failed: 4,
  last_completed: {
    fundamentals: "2024-01-15T10:05:00Z",
    short_interest: "2024-01-15T09:00:00Z",
    sentiment: "2024-01-15T08:00:00Z",
    corporate_actions: null,
  },
};

const mockBatchStatusResponse: BatchStatusResponse = {
  runs: [mockSyncRun, mockFailedRun, mockRunningRun],
  summary: mockSummary,
};

// ============================================
// SyncRun Structure Tests
// ============================================

describe("SyncRun structure", () => {
  it("has required fields", () => {
    expect(mockSyncRun.id).toBe("run-001");
    expect(mockSyncRun.run_type).toBe("fundamentals");
    expect(mockSyncRun.started_at).toBeDefined();
    expect(mockSyncRun.status).toBe("completed");
    expect(mockSyncRun.environment).toBe("PAPER");
  });

  it("has optional completed_at for running jobs", () => {
    expect(mockRunningRun.completed_at).toBeNull();
  });

  it("has optional error_message for successful jobs", () => {
    expect(mockSyncRun.error_message).toBeNull();
  });

  it("has error_message for failed jobs", () => {
    expect(mockFailedRun.error_message).toBe("API rate limit exceeded");
  });

  it("tracks symbols_processed and symbols_failed", () => {
    expect(mockSyncRun.symbols_processed).toBe(500);
    expect(mockSyncRun.symbols_failed).toBe(3);
  });
});

// ============================================
// BatchStatusSummary Tests
// ============================================

describe("BatchStatusSummary", () => {
  it("has total_runs count", () => {
    expect(mockSummary.total_runs).toBe(100);
  });

  it("has running count", () => {
    expect(mockSummary.running).toBe(1);
  });

  it("has completed count", () => {
    expect(mockSummary.completed).toBe(95);
  });

  it("has failed count", () => {
    expect(mockSummary.failed).toBe(4);
  });

  it("has last_completed for each run type", () => {
    expect(mockSummary.last_completed.fundamentals).toBe("2024-01-15T10:05:00Z");
    expect(mockSummary.last_completed.short_interest).toBe("2024-01-15T09:00:00Z");
    expect(mockSummary.last_completed.sentiment).toBe("2024-01-15T08:00:00Z");
    expect(mockSummary.last_completed.corporate_actions).toBeNull();
  });

  it("counts add up correctly", () => {
    const { running, completed, failed } = mockSummary;
    expect(running + completed + failed).toBe(100);
  });
});

// ============================================
// BatchStatusResponse Tests
// ============================================

describe("BatchStatusResponse", () => {
  it("has runs array", () => {
    expect(mockBatchStatusResponse.runs).toBeInstanceOf(Array);
    expect(mockBatchStatusResponse.runs.length).toBe(3);
  });

  it("has summary object", () => {
    expect(mockBatchStatusResponse.summary).toBeDefined();
    expect(mockBatchStatusResponse.summary.total_runs).toBe(100);
  });
});

// ============================================
// Duration Calculation Tests
// ============================================

describe("duration calculation", () => {
  function calculateDurationMs(startedAt: string, completedAt: string | null): number {
    const start = new Date(startedAt).getTime();
    const end = completedAt ? new Date(completedAt).getTime() : Date.now();
    return end - start;
  }

  it("calculates duration for completed runs", () => {
    const durationMs = calculateDurationMs(mockSyncRun.started_at, mockSyncRun.completed_at);
    expect(durationMs).toBe(5 * 60 * 1000); // 5 minutes
  });

  it("calculates duration for failed runs", () => {
    const durationMs = calculateDurationMs(mockFailedRun.started_at, mockFailedRun.completed_at);
    expect(durationMs).toBe(2 * 60 * 1000); // 2 minutes
  });

  it("calculates running duration from current time", () => {
    const durationMs = calculateDurationMs(mockRunningRun.started_at, mockRunningRun.completed_at);
    expect(durationMs).toBeGreaterThan(0);
  });
});

// ============================================
// Status Mapping Tests
// ============================================

describe("status mapping", () => {
  type BadgeVariant = "success" | "warning" | "error";

  function getStatusVariant(status: SyncRunStatus): BadgeVariant {
    switch (status) {
      case "completed":
        return "success";
      case "running":
        return "warning";
      case "failed":
        return "error";
    }
  }

  it("maps completed to success", () => {
    expect(getStatusVariant("completed")).toBe("success");
  });

  it("maps running to warning", () => {
    expect(getStatusVariant("running")).toBe("warning");
  });

  it("maps failed to error", () => {
    expect(getStatusVariant("failed")).toBe("error");
  });
});

// ============================================
// Run Type Label Tests
// ============================================

describe("run type labels", () => {
  const RUN_TYPE_LABELS: Record<SyncRunType, string> = {
    fundamentals: "Fundamentals",
    short_interest: "Short Interest",
    sentiment: "Sentiment",
    corporate_actions: "Corporate Actions",
  };

  it("has label for fundamentals", () => {
    expect(RUN_TYPE_LABELS.fundamentals).toBe("Fundamentals");
  });

  it("has label for short_interest", () => {
    expect(RUN_TYPE_LABELS.short_interest).toBe("Short Interest");
  });

  it("has label for sentiment", () => {
    expect(RUN_TYPE_LABELS.sentiment).toBe("Sentiment");
  });

  it("has label for corporate_actions", () => {
    expect(RUN_TYPE_LABELS.corporate_actions).toBe("Corporate Actions");
  });
});

// ============================================
// Timestamp Formatting Tests
// ============================================

describe("timestamp formatting", () => {
  function formatRelativeTime(timestamp: string | null): string {
    if (!timestamp) {
      return "Never";
    }
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) {
      return "just now";
    }
    if (diffMins < 60) {
      return `${diffMins}m ago`;
    }

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }

    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  it("returns Never for null timestamp", () => {
    expect(formatRelativeTime(null)).toBe("Never");
  });

  it("returns just now for very recent timestamp", () => {
    const now = new Date().toISOString();
    expect(formatRelativeTime(now)).toBe("just now");
  });

  it("returns minutes ago for recent timestamp", () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(formatRelativeTime(fiveMinutesAgo)).toBe("5m ago");
  });

  it("returns hours ago for timestamp within 24 hours", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(twoHoursAgo)).toBe("2h ago");
  });
});

// ============================================
// Duration Formatting Tests
// ============================================

describe("duration formatting", () => {
  function formatDuration(startedAt: string, completedAt: string | null): string {
    const start = new Date(startedAt).getTime();
    const end = completedAt ? new Date(completedAt).getTime() : Date.now();
    const durationMs = end - start;

    if (durationMs < 1000) {
      return `${durationMs}ms`;
    }

    const seconds = Math.floor(durationMs / 1000);
    if (seconds < 60) {
      return `${seconds}s`;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) {
      return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }

  it("formats milliseconds", () => {
    const start = "2024-01-15T10:00:00.000Z";
    const end = "2024-01-15T10:00:00.500Z";
    expect(formatDuration(start, end)).toBe("500ms");
  });

  it("formats seconds", () => {
    const start = "2024-01-15T10:00:00Z";
    const end = "2024-01-15T10:00:30Z";
    expect(formatDuration(start, end)).toBe("30s");
  });

  it("formats minutes and seconds", () => {
    const start = "2024-01-15T10:00:00Z";
    const end = "2024-01-15T10:02:30Z";
    expect(formatDuration(start, end)).toBe("2m 30s");
  });

  it("formats exact minutes", () => {
    const start = "2024-01-15T10:00:00Z";
    const end = "2024-01-15T10:05:00Z";
    expect(formatDuration(start, end)).toBe("5m");
  });

  it("formats hours and minutes", () => {
    const start = "2024-01-15T10:00:00Z";
    const end = "2024-01-15T11:30:00Z";
    expect(formatDuration(start, end)).toBe("1h 30m");
  });

  it("formats exact hours", () => {
    const start = "2024-01-15T10:00:00Z";
    const end = "2024-01-15T12:00:00Z";
    expect(formatDuration(start, end)).toBe("2h");
  });
});

// ============================================
// Component Export Tests
// ============================================

describe("BatchJobStatus exports", () => {
  it("exports BatchJobStatus component", async () => {
    const module = await import("./BatchJobStatus");
    expect(module.BatchJobStatus).toBeDefined();
  });

  it("exports default as same as named export", async () => {
    const module = await import("./BatchJobStatus");
    expect(module.default).toBe(module.BatchJobStatus);
  });
});

// ============================================
// Hook Export Tests
// ============================================

describe("useBatchStatus hook exports", () => {
  it("exports useBatchStatus hook", async () => {
    const module = await import("@/hooks/queries/useBatchStatus");
    expect(module.useBatchStatus).toBeDefined();
    expect(typeof module.useBatchStatus).toBe("function");
  });

  it("exports useBatchRunDetail hook", async () => {
    const module = await import("@/hooks/queries/useBatchStatus");
    expect(module.useBatchRunDetail).toBeDefined();
    expect(typeof module.useBatchRunDetail).toBe("function");
  });

  it("exports useTriggerBatchSync hook", async () => {
    const module = await import("@/hooks/queries/useBatchStatus");
    expect(module.useTriggerBatchSync).toBeDefined();
    expect(typeof module.useTriggerBatchSync).toBe("function");
  });

  it("exports batchStatusKeys", async () => {
    const module = await import("@/hooks/queries/useBatchStatus");
    expect(module.batchStatusKeys).toBeDefined();
    expect(module.batchStatusKeys.all).toEqual(["batchStatus"]);
  });
});

// ============================================
// Query Key Tests
// ============================================

describe("batchStatusKeys", () => {
  const batchStatusKeys = {
    all: ["batchStatus"] as const,
    list: (filters?: { limit?: number; type?: SyncRunType; status?: SyncRunStatus }) =>
      filters
        ? ([...["batchStatus"], "list", filters] as const)
        : ([...["batchStatus"], "list"] as const),
    detail: (id: string) => [...["batchStatus"], "detail", id] as const,
  };

  it("has all key", () => {
    expect(batchStatusKeys.all).toEqual(["batchStatus"]);
  });

  it("generates list key without filters", () => {
    expect(batchStatusKeys.list()).toEqual(["batchStatus", "list"]);
  });

  it("generates list key with filters", () => {
    const filters = { limit: 10, type: "fundamentals" as SyncRunType };
    expect(batchStatusKeys.list(filters)).toEqual(["batchStatus", "list", filters]);
  });

  it("generates detail key", () => {
    expect(batchStatusKeys.detail("run-123")).toEqual(["batchStatus", "detail", "run-123"]);
  });
});

// ============================================
// Validation Tests
// ============================================

describe("data validation", () => {
  it("symbols_processed is non-negative", () => {
    const runs = [mockSyncRun, mockFailedRun, mockRunningRun];
    for (const run of runs) {
      expect(run.symbols_processed).toBeGreaterThanOrEqual(0);
    }
  });

  it("symbols_failed is non-negative", () => {
    const runs = [mockSyncRun, mockFailedRun, mockRunningRun];
    for (const run of runs) {
      expect(run.symbols_failed).toBeGreaterThanOrEqual(0);
    }
  });

  it("started_at is valid ISO timestamp", () => {
    const runs = [mockSyncRun, mockFailedRun, mockRunningRun];
    for (const run of runs) {
      const date = new Date(run.started_at);
      expect(date.toISOString()).toBeTruthy();
    }
  });

  it("completed_at is valid ISO timestamp when present", () => {
    const runs = [mockSyncRun, mockFailedRun];
    for (const run of runs) {
      if (run.completed_at) {
        const date = new Date(run.completed_at);
        expect(date.toISOString()).toBeTruthy();
      }
    }
  });
});

// ============================================
// Filter Tests
// ============================================

describe("filter logic", () => {
  it("filters by run type", () => {
    const runs = [mockSyncRun, mockFailedRun, mockRunningRun];
    const filteredByType = runs.filter((run) => run.run_type === "fundamentals");
    expect(filteredByType.length).toBe(1);
    expect(filteredByType[0]?.id).toBe("run-001");
  });

  it("filters by status", () => {
    const runs = [mockSyncRun, mockFailedRun, mockRunningRun];
    const filteredByStatus = runs.filter((run) => run.status === "running");
    expect(filteredByStatus.length).toBe(1);
    expect(filteredByStatus[0]?.id).toBe("run-003");
  });

  it("filters by multiple criteria", () => {
    const runs = [mockSyncRun, mockFailedRun, mockRunningRun];
    const filtered = runs.filter((run) => run.run_type === "sentiment" && run.status === "failed");
    expect(filtered.length).toBe(1);
    expect(filtered[0]?.id).toBe("run-002");
  });
});
