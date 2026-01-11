/**
 * System State
 *
 * In-memory system state shared across all system routes.
 */

import { requireEnv } from "@cream/domain";
import type { SystemState } from "./types.js";

export const systemState: SystemState = {
  status: "STOPPED",
  environment: requireEnv(),
  lastCycleId: null,
  lastCycleTime: null,
  startedAt: null,
  runningCycles: new Map(),
  lastTriggerTime: new Map(),
};
