/**
 * Consensus Gate - Dual-approval system for trading decisions
 *
 * A DecisionPlan only proceeds to execution when BOTH:
 * 1. Risk Manager returns APPROVE
 * 2. Critic returns APPROVE
 *
 * If either rejects, the system requests a revised plan from the
 * Trader Agent with rejection reasons. This repeats up to the
 * iteration cap (default: 3).
 *
 * Timeout handling:
 * - Per-agent timeout (default: 30s)
 * - Total consensus timeout (default: 5 min)
 * - Timeout is treated as REJECT (safe default)
 *
 * @see docs/plans/05-agents.md
 */

import { createConsensusLogger } from "@cream/logger";
import { log } from "./logger.js";
import type {
  ApprovalVerdict,
  ConsensusInput,
  ConsensusResult,
  CriticOutput,
  DecisionPlan,
  RiskManagerOutput,
} from "./types.js";

// ============================================
// Configuration
// ============================================

export interface TimeoutConfig {
  /** Per-agent timeout in milliseconds (default: 30000) */
  perAgentMs: number;

  /** Total consensus cycle timeout in milliseconds (default: 300000 = 5 min) */
  totalMs: number;
}

export interface EscalationConfig {
  /** Enable escalation alerts (default: true for paper/live) */
  enabled: boolean;

  /** Callback for escalation events */
  onEscalation?: (event: EscalationEvent) => void;
}

export interface EscalationEvent {
  type: "TIMEOUT" | "MAX_ITERATIONS" | "SYSTEMATIC_FAILURE";
  cycleId: string;
  timestamp: string;
  details: string;
  iteration: number;
}

export interface ConsensusGateConfig {
  /** Maximum iterations before giving up (default: 3) */
  maxIterations: number;

  /** Whether to log rejection details (default: true) */
  logRejections: boolean;

  /** Timeout configuration */
  timeout: TimeoutConfig;

  /** Escalation configuration */
  escalation: EscalationConfig;

  /** Logger function (default: console.log) */
  logger?: ConsensusLogger;
}

export interface ConsensusLogger {
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, data?: Record<string, unknown>) => void;
}

const DEFAULT_TIMEOUT: TimeoutConfig = {
  perAgentMs: 30000, // 30 seconds per agent
  totalMs: 300000, // 5 minutes total
};

const DEFAULT_ESCALATION: EscalationConfig = {
  enabled: true,
};

const DEFAULT_LOGGER: ConsensusLogger = createConsensusLogger(log);

const DEFAULT_CONFIG: ConsensusGateConfig = {
  maxIterations: 3,
  logRejections: true,
  timeout: DEFAULT_TIMEOUT,
  escalation: DEFAULT_ESCALATION,
  logger: DEFAULT_LOGGER,
};

// ============================================
// Timeout Status
// ============================================

export type TimeoutStatus = "NONE" | "RISK_MANAGER_TIMEOUT" | "CRITIC_TIMEOUT" | "TOTAL_TIMEOUT";

export interface TimeoutResult {
  status: TimeoutStatus;
  elapsedMs: number;
}

// ============================================
// Consensus Gate
// ============================================

export class ConsensusGate {
  private readonly config: ConsensusGateConfig;
  private readonly logger: ConsensusLogger;
  private currentIteration = 0;
  private cycleStartTime: number | null = null;
  private timeoutCount = 0;
  private rejectionHistory: Array<{
    iteration: number;
    riskManagerVerdict: ApprovalVerdict | "TIMEOUT";
    criticVerdict: ApprovalVerdict | "TIMEOUT";
    rejectionReasons: string[];
    timeoutStatus: TimeoutStatus;
  }> = [];

  constructor(config: Partial<ConsensusGateConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      timeout: { ...DEFAULT_TIMEOUT, ...config.timeout },
      escalation: { ...DEFAULT_ESCALATION, ...config.escalation },
    };
    this.logger = this.config.logger ?? DEFAULT_LOGGER;
  }

  /**
   * Start a new consensus cycle.
   * Call this at the beginning of each trading cycle.
   */
  startCycle(): void {
    this.cycleStartTime = Date.now();
    this.currentIteration = 0;
    this.rejectionHistory = [];
  }

  /**
   * Check if the total consensus timeout has been exceeded.
   */
  isTotalTimeoutExceeded(): boolean {
    if (this.cycleStartTime === null) {
      return false;
    }
    return Date.now() - this.cycleStartTime > this.config.timeout.totalMs;
  }

  /**
   * Get remaining time for the consensus cycle.
   */
  getRemainingTimeMs(): number {
    if (this.cycleStartTime === null) {
      return this.config.timeout.totalMs;
    }
    return Math.max(0, this.config.timeout.totalMs - (Date.now() - this.cycleStartTime));
  }

  /**
   * Check if both approvers have approved the plan.
   *
   * @param input - The consensus input containing plan and approver outputs
   * @param timeoutStatus - Timeout status if any agent timed out
   * @returns ConsensusResult with approval status and details
   */
  evaluate(input: ConsensusInput, timeoutStatus: TimeoutStatus = "NONE"): ConsensusResult {
    this.currentIteration++;

    const { plan, riskManagerOutput, criticOutput } = input;

    // Check for total timeout
    if (this.isTotalTimeoutExceeded()) {
      return this.handleTotalTimeout(plan);
    }

    // Handle agent timeout as REJECT
    const riskVerdict: ApprovalVerdict | "TIMEOUT" =
      timeoutStatus === "RISK_MANAGER_TIMEOUT" ? "TIMEOUT" : riskManagerOutput.verdict;
    const criticVerdict: ApprovalVerdict | "TIMEOUT" =
      timeoutStatus === "CRITIC_TIMEOUT" ? "TIMEOUT" : criticOutput.verdict;

    const riskApproved = riskVerdict === "APPROVE";
    const criticApproved = criticVerdict === "APPROVE";
    const approved = riskApproved && criticApproved;

    const rejectionReasons = this.collectRejectionReasons(
      riskManagerOutput,
      criticOutput,
      timeoutStatus
    );

    // Log the decision
    this.logDecision(plan.cycleId, riskVerdict, criticVerdict, approved, timeoutStatus);

    // Track rejection history
    if (!approved) {
      this.rejectionHistory.push({
        iteration: this.currentIteration,
        riskManagerVerdict: riskVerdict,
        criticVerdict: criticVerdict,
        rejectionReasons,
        timeoutStatus,
      });

      // Track timeout count for systematic failure detection
      if (timeoutStatus !== "NONE") {
        this.timeoutCount++;
        this.checkSystematicFailure(plan.cycleId);
      }
    }

    return {
      approved,
      plan,
      riskManagerVerdict: riskManagerOutput.verdict,
      criticVerdict: criticOutput.verdict,
      iterations: this.currentIteration,
      rejectionReasons,
    };
  }

  /**
   * Handle total consensus timeout.
   */
  private handleTotalTimeout(plan: DecisionPlan): ConsensusResult {
    const reason = `Total consensus timeout exceeded (${this.config.timeout.totalMs}ms)`;

    this.logger.error("Total consensus timeout", {
      cycleId: plan.cycleId,
      iteration: this.currentIteration,
      elapsedMs: Date.now() - (this.cycleStartTime ?? Date.now()),
    });

    // Trigger escalation
    this.escalate({
      type: "TIMEOUT",
      cycleId: plan.cycleId,
      timestamp: new Date().toISOString(),
      details: reason,
      iteration: this.currentIteration,
    });

    return {
      approved: false,
      plan: createNoTradePlan(plan.cycleId, reason),
      riskManagerVerdict: "REJECT",
      criticVerdict: "REJECT",
      iterations: this.currentIteration,
      rejectionReasons: [reason],
    };
  }

  /**
   * Log consensus decision.
   */
  private logDecision(
    cycleId: string,
    riskVerdict: ApprovalVerdict | "TIMEOUT",
    criticVerdict: ApprovalVerdict | "TIMEOUT",
    approved: boolean,
    timeoutStatus: TimeoutStatus
  ): void {
    const logData = {
      cycleId,
      iteration: this.currentIteration,
      riskManagerVerdict: riskVerdict,
      criticVerdict: criticVerdict,
      approved,
      timeoutStatus,
    };

    if (approved) {
      this.logger.info("Consensus APPROVED", logData);
    } else if (timeoutStatus !== "NONE") {
      this.logger.warn("Consensus REJECTED (timeout)", logData);
    } else {
      this.logger.info("Consensus REJECTED", logData);
    }
  }

  /**
   * Check for systematic failures and escalate if needed.
   */
  private checkSystematicFailure(cycleId: string): void {
    // Alert if more than 3 timeouts in a row
    if (this.timeoutCount >= 3) {
      this.escalate({
        type: "SYSTEMATIC_FAILURE",
        cycleId,
        timestamp: new Date().toISOString(),
        details: `Systematic timeout failure: ${this.timeoutCount} consecutive timeouts`,
        iteration: this.currentIteration,
      });
    }
  }

  /**
   * Trigger escalation alert.
   */
  private escalate(event: EscalationEvent): void {
    if (!this.config.escalation.enabled) {
      return;
    }

    this.logger.error("ESCALATION", { event });

    if (this.config.escalation.onEscalation) {
      this.config.escalation.onEscalation(event);
    }
  }

  /**
   * Check if more iterations are allowed
   */
  canRetry(): boolean {
    return this.currentIteration < this.config.maxIterations && !this.isTotalTimeoutExceeded();
  }

  /**
   * Get the current iteration count
   */
  getIteration(): number {
    return this.currentIteration;
  }

  /**
   * Get the maximum allowed iterations
   */
  getMaxIterations(): number {
    return this.config.maxIterations;
  }

  /**
   * Get the per-agent timeout in milliseconds
   */
  getPerAgentTimeoutMs(): number {
    return this.config.timeout.perAgentMs;
  }

  /**
   * Get all rejection history
   */
  getRejectionHistory(): typeof this.rejectionHistory {
    return [...this.rejectionHistory];
  }

  /**
   * Get timeout count for monitoring
   */
  getTimeoutCount(): number {
    return this.timeoutCount;
  }

  /**
   * Reset the gate for a new consensus cycle
   */
  reset(): void {
    this.currentIteration = 0;
    this.cycleStartTime = null;
    this.rejectionHistory = [];
    // Note: timeoutCount is NOT reset to track across cycles for systematic failure detection
  }

  /**
   * Reset timeout count (call periodically, e.g., daily)
   */
  resetTimeoutCount(): void {
    this.timeoutCount = 0;
  }

  /**
   * Collect all rejection reasons from approver outputs
   */
  private collectRejectionReasons(
    riskManagerOutput: RiskManagerOutput,
    criticOutput: CriticOutput,
    timeoutStatus: TimeoutStatus
  ): string[] {
    const reasons: string[] = [];

    // Timeout reasons
    if (timeoutStatus === "RISK_MANAGER_TIMEOUT") {
      reasons.push("[Risk] Agent timed out - treating as REJECT");
    }
    if (timeoutStatus === "CRITIC_TIMEOUT") {
      reasons.push("[Critic] Agent timed out - treating as REJECT");
    }
    if (timeoutStatus === "TOTAL_TIMEOUT") {
      reasons.push("[System] Total consensus timeout exceeded");
    }

    // Risk Manager violations
    if (riskManagerOutput.verdict === "REJECT") {
      for (const violation of riskManagerOutput.violations) {
        reasons.push(
          `[Risk] ${violation.constraint}: ${violation.current_value} exceeds ${violation.limit}`
        );
      }
      for (const change of riskManagerOutput.required_changes) {
        reasons.push(`[Risk] ${change.decisionId}: ${change.change}`);
      }
    }

    // Critic issues
    if (criticOutput.verdict === "REJECT") {
      for (const inconsistency of criticOutput.inconsistencies) {
        reasons.push(`[Critic] ${inconsistency.decisionId}: ${inconsistency.issue}`);
      }
      for (const missing of criticOutput.missing_justifications) {
        reasons.push(`[Critic] ${missing.decisionId}: Missing ${missing.missing}`);
      }
      for (const hallucination of criticOutput.hallucination_flags) {
        reasons.push(
          `[Critic] ${hallucination.decisionId}: Hallucination - ${hallucination.claim}`
        );
      }
    }

    return reasons;
  }
}

// ============================================
// Helper Functions
// ============================================

/**
 * Create a NO_TRADE plan when consensus cannot be reached
 */
export function createNoTradePlan(cycleId: string, reason: string): DecisionPlan {
  return {
    cycleId,
    timestamp: new Date().toISOString(),
    decisions: [],
    portfolioNotes: `NO_TRADE: ${reason}`,
  };
}

/**
 * Create an approved RiskManagerOutput
 */
export function createApprovedRiskOutput(notes = ""): RiskManagerOutput {
  return {
    verdict: "APPROVE",
    violations: [],
    required_changes: [],
    risk_notes: notes,
  };
}

/**
 * Create an approved CriticOutput
 */
export function createApprovedCriticOutput(): CriticOutput {
  return {
    verdict: "APPROVE",
    inconsistencies: [],
    missing_justifications: [],
    hallucination_flags: [],
    required_changes: [],
  };
}

/**
 * Create a timeout RiskManagerOutput (used when agent times out)
 */
export function createTimeoutRiskOutput(): RiskManagerOutput {
  return {
    verdict: "REJECT",
    violations: [],
    required_changes: [],
    risk_notes: "Agent timed out - default to REJECT for safety",
  };
}

/**
 * Create a timeout CriticOutput (used when agent times out)
 */
export function createTimeoutCriticOutput(): CriticOutput {
  return {
    verdict: "REJECT",
    inconsistencies: [],
    missing_justifications: [],
    hallucination_flags: [],
    required_changes: [],
  };
}

// ============================================
// Fallback Action Determination
// ============================================

/**
 * Action types from the original plan.
 */
export type ActionType = "BUY" | "SELL" | "HOLD" | "CLOSE";

/**
 * Determine the safe fallback action when consensus fails.
 *
 * Rules:
 * - BUY → HOLD (don't enter new position)
 * - SELL → HOLD (don't exit position)
 * - HOLD → HOLD (no change)
 * - CLOSE → Consider executing (risk mitigation, but defaults to HOLD)
 *
 * @param originalAction - The action from the failed plan
 * @param forceCloseOnFail - Whether to execute CLOSE even on consensus failure (default: false)
 */
export function getFallbackAction(
  originalAction: ActionType,
  forceCloseOnFail = false
): ActionType {
  switch (originalAction) {
    case "BUY":
      return "HOLD"; // Don't enter new position
    case "SELL":
      return "HOLD"; // Don't exit position prematurely
    case "HOLD":
      return "HOLD"; // No change needed
    case "CLOSE":
      // CLOSE is for risk mitigation - consider executing even on failure
      return forceCloseOnFail ? "CLOSE" : "HOLD";
    default:
      return "HOLD";
  }
}

// ============================================
// Consensus Loop with Timeout
// ============================================

/**
 * Result types for withAgentTimeout
 */
export type AgentTimeoutResult<T> =
  | { result: T; timedOut: false; errored: false }
  | { result: null; timedOut: true; errored: false; agentName: string }
  | { result: null; timedOut: false; errored: true; agentName: string; error: string };

/**
 * Execute a promise with per-agent timeout.
 * Returns the result, or indicates timeout/error with details preserved.
 */
export async function withAgentTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  agentName: string
): Promise<AgentTimeoutResult<T>> {
  return new Promise((resolve) => {
    let completed = false;

    const timer = setTimeout(() => {
      if (!completed) {
        completed = true;
        resolve({ result: null, timedOut: true, errored: false, agentName });
      }
    }, timeoutMs);

    promise
      .then((result) => {
        if (!completed) {
          completed = true;
          clearTimeout(timer);
          resolve({ result, timedOut: false, errored: false });
        }
      })
      .catch((error: unknown) => {
        if (!completed) {
          completed = true;
          clearTimeout(timer);
          const errorMessage = error instanceof Error ? error.message : String(error);
          resolve({ result: null, timedOut: false, errored: true, agentName, error: errorMessage });
        }
      });
  });
}

/**
 * Run the consensus loop until approval or iteration cap.
 * Includes timeout handling for individual agents.
 *
 * @param gate - The ConsensusGate instance
 * @param initialPlan - The initial decision plan
 * @param getApproval - Function to get approver outputs for a plan
 * @param revisePlan - Function to revise the plan based on rejection reasons
 * @returns Final ConsensusResult
 */
export async function runConsensusLoop(
  gate: ConsensusGate,
  initialPlan: DecisionPlan,
  getApproval: (
    plan: DecisionPlan
  ) => Promise<{ riskManager: RiskManagerOutput; critic: CriticOutput }>,
  revisePlan: (plan: DecisionPlan, rejectionReasons: string[]) => Promise<DecisionPlan>
): Promise<ConsensusResult> {
  gate.startCycle();
  let currentPlan = initialPlan;

  while (true) {
    // Check total timeout before proceeding
    if (gate.isTotalTimeoutExceeded()) {
      return {
        approved: false,
        plan: createNoTradePlan(currentPlan.cycleId, "Total consensus timeout exceeded"),
        riskManagerVerdict: "REJECT",
        criticVerdict: "REJECT",
        iterations: gate.getIteration(),
        rejectionReasons: ["Total consensus timeout exceeded"],
      };
    }

    // Get approval from both agents with timeout
    const approvalResult = await withAgentTimeout(
      getApproval(currentPlan),
      gate.getPerAgentTimeoutMs(),
      "approval"
    );

    let riskManager: RiskManagerOutput;
    let critic: CriticOutput;
    let timeoutStatus: TimeoutStatus = "NONE";

    if (approvalResult.timedOut) {
      // Both agents timed out - treat as reject
      riskManager = createTimeoutRiskOutput();
      critic = createTimeoutCriticOutput();
      timeoutStatus = "RISK_MANAGER_TIMEOUT"; // Generic timeout
    } else if (approvalResult.errored) {
      // Agents errored - treat as reject with error info
      riskManager = createTimeoutRiskOutput();
      critic = createTimeoutCriticOutput();
      timeoutStatus = "RISK_MANAGER_TIMEOUT"; // Use timeout status for now
      log.error(
        { error: approvalResult.error, agent: approvalResult.agentName },
        "Approval agents failed"
      );
    } else {
      riskManager = approvalResult.result.riskManager;
      critic = approvalResult.result.critic;
    }

    // Evaluate consensus
    const result = gate.evaluate(
      {
        plan: currentPlan,
        riskManagerOutput: riskManager,
        criticOutput: critic,
      },
      timeoutStatus
    );

    // If approved, return success
    if (result.approved) {
      return result;
    }

    // If no more retries, return NO_TRADE
    if (!gate.canRetry()) {
      return {
        ...result,
        plan: createNoTradePlan(
          currentPlan.cycleId,
          `Consensus not reached after ${gate.getMaxIterations()} iterations`
        ),
      };
    }

    // Revise the plan based on rejection reasons
    currentPlan = await revisePlan(currentPlan, result.rejectionReasons);
  }
}

/**
 * Quick check if a plan would pass consensus (for testing/simulation)
 */
export function wouldPassConsensus(
  riskManagerOutput: RiskManagerOutput,
  criticOutput: CriticOutput
): boolean {
  return riskManagerOutput.verdict === "APPROVE" && criticOutput.verdict === "APPROVE";
}
