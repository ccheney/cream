/**
 * Indicator Synthesis Types
 *
 * Types for the Dynamic Indicator Synthesis dashboard UI.
 * Used for displaying synthesis status, history, and trigger conditions.
 *
 * @see docs/plans/36-dynamic-indicator-synthesis-workflow.md
 */

// ============================================
// Trigger Status Types
// ============================================

/**
 * Trigger conditions evaluated during the Orient phase.
 */
export interface TriggerConditions {
  /** Whether a regime gap was detected (no indicators for current regime) */
  regimeGapDetected: boolean;
  /** Current market regime */
  currentRegime: string;
  /** Details about the regime gap if detected */
  regimeGapDetails?: string;
  /** Similarity to closest existing indicator (0-1) */
  closestIndicatorSimilarity: number;
  /** Rolling 30-day Information Coefficient */
  rollingIC30Day: number;
  /** Number of consecutive days with IC decay */
  icDecayDays: number;
  /** Whether existing indicators are underperforming */
  existingIndicatorsUnderperforming: boolean;
  /** Days since last generation attempt */
  daysSinceLastAttempt: number;
  /** Number of active indicators */
  activeIndicatorCount: number;
  /** Maximum allowed indicators */
  maxIndicatorCapacity: number;
  /** Whether cooldown period has passed */
  cooldownMet: boolean;
  /** Whether capacity is available for new indicators */
  capacityAvailable: boolean;
}

/**
 * Current trigger status from the last evaluation.
 */
export interface TriggerStatus {
  /** Whether synthesis should be triggered */
  shouldTrigger: boolean;
  /** Reason for triggering (if shouldTrigger is true) */
  triggerReason?: string;
  /** Detailed trigger conditions */
  conditions: TriggerConditions;
  /** Human-readable summary of the evaluation */
  summary: string;
  /** Recommendation from the trigger evaluator */
  recommendation: string;
}

// ============================================
// Active Synthesis Types
// ============================================

/**
 * Phases of the synthesis workflow.
 */
export type SynthesisPhase =
  | "gathering_context"
  | "generating_hypothesis"
  | "implementing"
  | "validating"
  | "initiating_paper_trading";

/**
 * Currently running synthesis workflow.
 */
export interface ActiveSynthesis {
  /** Workflow run ID */
  id: string;
  /** Indicator name (if hypothesis generated) */
  name: string;
  /** Current workflow status */
  status: "running" | "completed" | "failed";
  /** Current phase of the synthesis */
  currentPhase: SynthesisPhase;
  /** Start timestamp (ISO 8601) */
  startedAt: string;
  /** Cycle ID that triggered the synthesis */
  triggeredByCycleId: string;
  /** Trigger reason */
  triggerReason: string;
}

// ============================================
// Synthesis Status Response
// ============================================

/**
 * Recent synthesis activity item.
 */
export interface SynthesisActivity {
  /** Indicator name */
  indicatorName: string;
  /** Final status */
  status: "paper_trading_started" | "validation_failed" | "implementation_failed" | "error";
  /** Generation timestamp (ISO 8601) */
  generatedAt: string;
  /** Success or failure indicator */
  success: boolean;
}

/**
 * Response for GET /api/synthesis/status endpoint.
 */
export interface SynthesisStatusResponse {
  /** Current trigger status from last evaluation */
  triggerStatus: TriggerStatus | null;
  /** Currently running synthesis (if any) */
  activeSynthesis: ActiveSynthesis | null;
  /** Recent synthesis activity (last 5) */
  recentActivity: SynthesisActivity[];
  /** Last evaluation timestamp */
  lastEvaluatedAt: string | null;
}

// ============================================
// Synthesis History Types
// ============================================

/**
 * Indicator lifecycle status.
 */
export type IndicatorLifecycleStatus = "staging" | "paper" | "production" | "retired";

/**
 * Single indicator history item.
 */
export interface SynthesisHistoryItem {
  /** Indicator ID */
  id: string;
  /** Indicator name */
  name: string;
  /** Indicator category */
  category: "momentum" | "trend" | "volatility" | "volume" | "custom";
  /** Current lifecycle status */
  status: IndicatorLifecycleStatus;
  /** Economic hypothesis */
  hypothesis: string;
  /** Generation timestamp (ISO 8601) */
  generatedAt: string;
  /** Paper trading start (ISO 8601 or null) */
  paperTradingStart: string | null;
  /** Promotion timestamp (ISO 8601 or null) */
  promotedAt: string | null;
  /** Retirement timestamp (ISO 8601 or null) */
  retiredAt: string | null;
  /** Reason for retirement (if retired) */
  retirementReason: string | null;
  /** Current Information Coefficient (if in paper/production) */
  ic: number | null;
  /** Trigger reason that spawned this indicator */
  triggerReason: string;
  /** Cycle ID that triggered generation */
  generatedByCycleId: string;
}

/**
 * Response for GET /api/synthesis/history endpoint.
 */
export interface SynthesisHistoryResponse {
  /** Indicator history sorted by generatedAt (newest first) */
  history: SynthesisHistoryItem[];
  /** Total count of indicators */
  total: number;
  /** Active count (paper + production) */
  activeCount: number;
}

// ============================================
// Synthesis Metrics Types
// ============================================

/**
 * Aggregated synthesis metrics for dashboard display.
 */
export interface SynthesisMetrics {
  /** Total indicators generated */
  totalGenerated: number;
  /** Indicators currently in paper trading */
  inPaperTrading: number;
  /** Indicators promoted to production */
  inProduction: number;
  /** Indicators retired */
  retired: number;
  /** Success rate (promoted / total generated) */
  successRate: number;
  /** Average time in paper trading (days) */
  avgPaperTradingDays: number;
  /** Last 30 days generation count */
  last30DaysGenerated: number;
}
