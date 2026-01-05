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
 * @see docs/plans/05-agents.md
 */

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

export interface ConsensusGateConfig {
  /** Maximum iterations before giving up (default: 3) */
  maxIterations: number;

  /** Whether to log rejection details (default: true) */
  logRejections: boolean;
}

const DEFAULT_CONFIG: ConsensusGateConfig = {
  maxIterations: 3,
  logRejections: true,
};

// ============================================
// Consensus Gate
// ============================================

export class ConsensusGate {
  private readonly config: ConsensusGateConfig;
  private currentIteration: number = 0;
  private rejectionHistory: Array<{
    iteration: number;
    riskManagerVerdict: ApprovalVerdict;
    criticVerdict: ApprovalVerdict;
    rejectionReasons: string[];
  }> = [];

  constructor(config: Partial<ConsensusGateConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if both approvers have approved the plan.
   *
   * @param input - The consensus input containing plan and approver outputs
   * @returns ConsensusResult with approval status and details
   */
  evaluate(input: ConsensusInput): ConsensusResult {
    this.currentIteration++;

    const { plan, riskManagerOutput, criticOutput } = input;

    const riskApproved = riskManagerOutput.verdict === "APPROVE";
    const criticApproved = criticOutput.verdict === "APPROVE";
    const approved = riskApproved && criticApproved;

    const rejectionReasons = this.collectRejectionReasons(
      riskManagerOutput,
      criticOutput
    );

    // Track rejection history
    if (!approved) {
      this.rejectionHistory.push({
        iteration: this.currentIteration,
        riskManagerVerdict: riskManagerOutput.verdict,
        criticVerdict: criticOutput.verdict,
        rejectionReasons,
      });

      if (this.config.logRejections) {
        console.log(
          `[ConsensusGate] Iteration ${this.currentIteration}: REJECTED`
        );
        console.log(`  Risk Manager: ${riskManagerOutput.verdict}`);
        console.log(`  Critic: ${criticOutput.verdict}`);
        console.log(`  Reasons: ${rejectionReasons.join(", ")}`);
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
   * Check if more iterations are allowed
   */
  canRetry(): boolean {
    return this.currentIteration < this.config.maxIterations;
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
   * Get all rejection history
   */
  getRejectionHistory(): typeof this.rejectionHistory {
    return [...this.rejectionHistory];
  }

  /**
   * Reset the gate for a new consensus cycle
   */
  reset(): void {
    this.currentIteration = 0;
    this.rejectionHistory = [];
  }

  /**
   * Collect all rejection reasons from approver outputs
   */
  private collectRejectionReasons(
    riskManagerOutput: RiskManagerOutput,
    criticOutput: CriticOutput
  ): string[] {
    const reasons: string[] = [];

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
        reasons.push(
          `[Critic] ${inconsistency.decisionId}: ${inconsistency.issue}`
        );
      }
      for (const missing of criticOutput.missing_justifications) {
        reasons.push(
          `[Critic] ${missing.decisionId}: Missing ${missing.missing}`
        );
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
export function createNoTradePlan(
  cycleId: string,
  reason: string
): DecisionPlan {
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
export function createApprovedRiskOutput(notes: string = ""): RiskManagerOutput {
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
 * Run the consensus loop until approval or iteration cap
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
  revisePlan: (
    plan: DecisionPlan,
    rejectionReasons: string[]
  ) => Promise<DecisionPlan>
): Promise<ConsensusResult> {
  let currentPlan = initialPlan;

  while (true) {
    // Get approval from both agents
    const { riskManager, critic } = await getApproval(currentPlan);

    // Evaluate consensus
    const result = gate.evaluate({
      plan: currentPlan,
      riskManagerOutput: riskManager,
      criticOutput: critic,
    });

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
  return (
    riskManagerOutput.verdict === "APPROVE" &&
    criticOutput.verdict === "APPROVE"
  );
}
