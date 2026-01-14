/**
 * Agent Network Visualization Types
 *
 * Types for OODA workflow visualization, phase tracking, and data flow.
 *
 * @see docs/plans/43-agent-network-visualization.md
 */

import type { AgentStreamingState } from "@/stores/agent-streaming-store";

// ============================================
// Agent Types (Extended)
// ============================================

/** All agent types in the trading workflow */
export type NetworkAgentType =
  | "grounding"
  | "news"
  | "fundamentals"
  | "bullish"
  | "bearish"
  | "trader"
  | "risk"
  | "critic";

/** OODA workflow phases */
export type OODAPhase =
  | "observe"
  | "orient"
  | "grounding"
  | "analysts"
  | "debate"
  | "trader"
  | "consensus"
  | "act";

/** Phase execution status */
export type PhaseStatus = "pending" | "active" | "complete" | "error";

// ============================================
// Agent Metadata
// ============================================

export interface AgentMetadata {
  type: NetworkAgentType;
  displayName: string;
  shortName: string;
  description: string;
  color: string;
  icon: string;
  phase: OODAPhase;
}

/** Agent metadata registry */
export const AGENT_METADATA: Record<NetworkAgentType, AgentMetadata> = {
  grounding: {
    type: "grounding",
    displayName: "Grounding Agent",
    shortName: "Grounding",
    description: "Real-time web context via Google Search",
    color: "#3B82F6", // Blue
    icon: "G",
    phase: "grounding",
  },
  news: {
    type: "news",
    displayName: "News & Sentiment",
    shortName: "News",
    description: "News analysis and sentiment scoring",
    color: "#EC4899", // Pink
    icon: "N",
    phase: "analysts",
  },
  fundamentals: {
    type: "fundamentals",
    displayName: "Fundamentals & Macro",
    shortName: "Fundamentals",
    description: "SEC filings and macro analysis",
    color: "#14B8A6", // Teal
    icon: "F",
    phase: "analysts",
  },
  bullish: {
    type: "bullish",
    displayName: "Bullish Researcher",
    shortName: "Bullish",
    description: "Long thesis development",
    color: "#22C55E", // Green
    icon: "B+",
    phase: "debate",
  },
  bearish: {
    type: "bearish",
    displayName: "Bearish Researcher",
    shortName: "Bearish",
    description: "Short thesis development",
    color: "#EF4444", // Red
    icon: "B-",
    phase: "debate",
  },
  trader: {
    type: "trader",
    displayName: "Trader Agent",
    shortName: "Trader",
    description: "Decision synthesis and trade planning",
    color: "#F59E0B", // Amber
    icon: "T",
    phase: "trader",
  },
  risk: {
    type: "risk",
    displayName: "Risk Manager",
    shortName: "Risk",
    description: "Position sizing and risk assessment",
    color: "#F97316", // Orange
    icon: "R",
    phase: "consensus",
  },
  critic: {
    type: "critic",
    displayName: "Critic Agent",
    shortName: "Critic",
    description: "Decision validation and critique",
    color: "#6366F1", // Indigo
    icon: "C",
    phase: "consensus",
  },
};

// ============================================
// Phase Configuration
// ============================================

export interface PhaseConfig {
  phase: OODAPhase;
  displayName: string;
  description: string;
  agents: NetworkAgentType[];
  isParallel: boolean;
}

/** OODA phase configuration in execution order */
export const PHASE_CONFIG: PhaseConfig[] = [
  {
    phase: "observe",
    displayName: "OBSERVE",
    description: "Market Data, Options Chains, Portfolio, Universe",
    agents: [],
    isParallel: false,
  },
  {
    phase: "orient",
    displayName: "ORIENT",
    description: "Indicators, Regime, Memory, P/C Ratio",
    agents: [],
    isParallel: false,
  },
  {
    phase: "grounding",
    displayName: "GROUNDING",
    description: "Real-time web context",
    agents: ["grounding"],
    isParallel: false,
  },
  {
    phase: "analysts",
    displayName: "ANALYSTS",
    description: "Parallel analysis",
    agents: ["news", "fundamentals"],
    isParallel: true,
  },
  {
    phase: "debate",
    displayName: "DEBATE",
    description: "Bull vs Bear thesis",
    agents: ["bullish", "bearish"],
    isParallel: true,
  },
  {
    phase: "trader",
    displayName: "TRADER",
    description: "Decision synthesis",
    agents: ["trader"],
    isParallel: false,
  },
  {
    phase: "consensus",
    displayName: "CONSENSUS",
    description: "Risk & validation",
    agents: ["risk", "critic"],
    isParallel: true,
  },
  {
    phase: "act",
    displayName: "ACT",
    description: "Execution Engine",
    agents: [],
    isParallel: false,
  },
];

// ============================================
// Data Flow Types
// ============================================

export interface DataFlow {
  id: string;
  from: NetworkAgentType | OODAPhase;
  to: NetworkAgentType | OODAPhase;
  label: string;
  timestamp: number;
  active: boolean;
}

/** Data flow definitions between phases/agents */
export const DATA_FLOW_LABELS: Record<string, string> = {
  "observe-orient": "Market Context",
  "orient-grounding": "Orientation Data",
  "grounding-analysts": "Grounding Context",
  "grounding-debate": "Grounding Context",
  "analysts-debate": "Analyst Outputs",
  "debate-trader": "Bull/Bear Cases",
  "trader-consensus": "DecisionPlan",
  "consensus-act": "Votes",
};

// ============================================
// Network State
// ============================================

export interface AgentNetworkState {
  /** Current OODA phase being executed */
  currentPhase: OODAPhase | null;
  /** Status of each phase */
  phaseStatus: Record<OODAPhase, PhaseStatus>;
  /** Active data flows */
  dataFlows: DataFlow[];
  /** Streaming state per agent (from store) */
  agents: Map<NetworkAgentType, AgentStreamingState>;
  /** Current cycle ID */
  cycleId: string | null;
}

/** Initial phase status state */
export const INITIAL_PHASE_STATUS: Record<OODAPhase, PhaseStatus> = {
  observe: "pending",
  orient: "pending",
  grounding: "pending",
  analysts: "pending",
  debate: "pending",
  trader: "pending",
  consensus: "pending",
  act: "pending",
};

// ============================================
// Utility Functions
// ============================================

/** Get all agent types in the network */
export function getAllAgentTypes(): NetworkAgentType[] {
  return Object.keys(AGENT_METADATA) as NetworkAgentType[];
}

/** Get agents for a specific phase */
export function getAgentsForPhase(phase: OODAPhase): NetworkAgentType[] {
  const config = PHASE_CONFIG.find((p) => p.phase === phase);
  return config?.agents ?? [];
}

/** Get phase for a specific agent */
export function getPhaseForAgent(agentType: NetworkAgentType): OODAPhase {
  return AGENT_METADATA[agentType].phase;
}

/** Get phase index (for ordering) */
export function getPhaseIndex(phase: OODAPhase): number {
  return PHASE_CONFIG.findIndex((p) => p.phase === phase);
}
