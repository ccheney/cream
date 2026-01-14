"use client";

/**
 * AgentNetwork - Main orchestrator for OODA workflow visualization
 *
 * Displays 8-agent consensus network as vertical flow diagram with
 * animated connections showing data flow between phases.
 *
 * @see docs/plans/43-agent-network-visualization.md
 */

import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AgentStreamingState } from "@/stores/agent-streaming-store";
import { AgentNode } from "./AgentNode";
import { DataItem, PhaseContainer } from "./PhaseContainer";
import {
  INITIAL_PHASE_STATUS,
  type NetworkAgentType,
  type OODAPhase,
  PHASE_CONFIG,
  type PhaseStatus,
} from "./types";
import { useAnnounce } from "./useAnnounce";
import { useKeyboardNavigation } from "./useKeyboardNavigation";

// ============================================
// Animation Variants
// ============================================

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

// ============================================
// Helper Functions
// ============================================

function derivePhaseStatus(
  phase: OODAPhase,
  agents: Map<NetworkAgentType, AgentStreamingState>,
  currentPhase: OODAPhase | null
): PhaseStatus {
  const config = PHASE_CONFIG.find((p) => p.phase === phase);
  if (!config) {
    return "pending";
  }

  // Phases without agents (observe, orient, act) use currentPhase
  if (config.agents.length === 0) {
    const phaseIndex = PHASE_CONFIG.findIndex((p) => p.phase === phase);
    const currentIndex = currentPhase
      ? PHASE_CONFIG.findIndex((p) => p.phase === currentPhase)
      : -1;

    if (currentIndex > phaseIndex) {
      return "complete";
    }
    if (currentIndex === phaseIndex) {
      return "active";
    }
    return "pending";
  }

  // For phases with agents, derive from agent states
  const agentStates = config.agents
    .map((agentType) => agents.get(agentType)?.status ?? "idle")
    .filter(Boolean);

  if (agentStates.length === 0) {
    return "pending";
  }
  if (agentStates.every((s) => s === "complete")) {
    return "complete";
  }
  if (agentStates.some((s) => s === "error")) {
    return "error";
  }
  if (agentStates.some((s) => s === "processing")) {
    return "active";
  }
  return "pending";
}

// ============================================
// Connection Arrow Component
// ============================================

interface ConnectionArrowProps {
  isActive: boolean;
  label?: string;
}

function ConnectionArrow({ isActive, label }: ConnectionArrowProps) {
  const color = isActive ? "bg-amber-500" : "bg-stone-300 dark:bg-night-600";
  const textColor = isActive
    ? "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20"
    : "text-stone-400 dark:text-stone-500 bg-stone-100 dark:bg-night-700";

  return (
    <div className="flex flex-col items-center py-1">
      {/* Vertical line */}
      <div className={`w-0.5 h-4 ${color}`} />
      {/* Arrow triangle */}
      <div
        className={`w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] ${
          isActive ? "border-t-amber-500" : "border-t-stone-300 dark:border-t-night-600"
        }`}
      />
      {/* Label */}
      {label && (
        <span className={`mt-1 text-[10px] font-mono px-2 py-0.5 rounded ${textColor}`}>
          {label}
        </span>
      )}
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export interface AgentNetworkProps {
  agents: Map<NetworkAgentType, AgentStreamingState>;
  cycleId: string | null;
  selectedAgent: NetworkAgentType | null;
  onAgentSelect: (agentType: NetworkAgentType | null) => void;
  isLive?: boolean;
  /** Compact mode for mobile layouts */
  compact?: boolean;
}

export function AgentNetwork({
  agents,
  cycleId,
  selectedAgent,
  onAgentSelect,
  isLive = false,
  compact = false,
}: AgentNetworkProps) {
  // Track expanded phases for collapsible UI
  const [expandedPhases, setExpandedPhases] = useState<Set<OODAPhase>>(
    new Set(["grounding", "analysts", "debate", "trader", "consensus"])
  );

  // Track user interaction for auto-focus behavior
  const [userHasInteracted, setUserHasInteracted] = useState(false);

  // Handle phase toggle
  const handlePhaseToggle = useCallback((phase: OODAPhase) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phase)) {
        next.delete(phase);
      } else {
        next.add(phase);
      }
      return next;
    });
  }, []);

  // Keyboard navigation
  const { containerRef, handleKeyDown } = useKeyboardNavigation({
    selectedAgent,
    onAgentSelect: (agent) => {
      setUserHasInteracted(true);
      onAgentSelect(agent);
    },
    expandedPhases,
    onPhaseToggle: handlePhaseToggle,
  });

  // Derive current active phase from agent states for accessibility announcements
  const currentPhase = useMemo<OODAPhase | null>(() => {
    // Find the first phase with an active agent
    for (const config of PHASE_CONFIG) {
      if (config.agents.length === 0) {
        continue;
      }
      const hasActiveAgent = config.agents.some(
        (agentType) => agents.get(agentType)?.status === "processing"
      );
      if (hasActiveAgent) {
        return config.phase;
      }
    }

    // If no active agents, find the last completed phase
    for (let i = PHASE_CONFIG.length - 1; i >= 0; i--) {
      const config = PHASE_CONFIG[i];
      if (!config) {
        continue;
      }
      if (config.agents.length === 0) {
        continue;
      }
      const allComplete = config.agents.every(
        (agentType) => agents.get(agentType)?.status === "complete"
      );
      if (allComplete) {
        const nextPhase = PHASE_CONFIG[i + 1]?.phase;
        return nextPhase ?? null;
      }
    }

    return null;
  }, [agents]);

  // Derive phase statuses
  const phaseStatus = useMemo(() => {
    const status = { ...INITIAL_PHASE_STATUS };
    for (const config of PHASE_CONFIG) {
      status[config.phase] = derivePhaseStatus(config.phase, agents, currentPhase);
    }
    return status;
  }, [agents, currentPhase]);

  // Screen reader announcements
  const selectedAgentStatus = selectedAgent ? agents.get(selectedAgent)?.status : undefined;
  useAnnounce({
    currentPhase,
    phaseStatus,
    selectedAgent,
    agentStatus: selectedAgentStatus,
  });

  // Auto-focus on processing agent (unless user has interacted)
  useEffect(() => {
    if (userHasInteracted) {
      return;
    }

    const processingAgent = Array.from(agents.entries()).find(
      ([_, state]) => state.status === "processing"
    );

    if (processingAgent) {
      onAgentSelect(processingAgent[0]);
    }
  }, [agents, userHasInteracted, onAgentSelect]);

  // Handle agent click
  const handleAgentClick = useCallback(
    (agentType: NetworkAgentType) => {
      setUserHasInteracted(true);
      onAgentSelect(selectedAgent === agentType ? null : agentType);
    },
    [selectedAgent, onAgentSelect]
  );

  // Render agents for a phase
  const renderAgents = useCallback(
    (agentTypes: NetworkAgentType[], isParallel: boolean) => {
      if (agentTypes.length === 0) {
        return null;
      }

      return (
        <div
          className={`flex ${
            isParallel
              ? compact
                ? "flex-col sm:flex-row justify-center gap-2 sm:gap-4"
                : "flex-row justify-center gap-4"
              : "flex-col items-center"
          }`}
        >
          {agentTypes.map((agentType) => (
            <AgentNode
              key={agentType}
              agentType={agentType}
              state={agents.get(agentType)}
              isSelected={selectedAgent === agentType}
              onClick={() => handleAgentClick(agentType)}
              compact={compact}
            />
          ))}
        </div>
      );
    },
    [agents, selectedAgent, handleAgentClick, compact]
  );

  return (
    <motion.div
      ref={containerRef}
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="space-y-2 focus:outline-none"
      role="tree"
      aria-label="Agent Network"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-stone-900 dark:text-night-50">Agent Network</h2>
        <div className="flex items-center gap-4">
          {cycleId && (
            <span className="text-xs font-mono text-stone-400 dark:text-stone-500">
              Cycle: {cycleId.slice(0, 12)}...
            </span>
          )}
          {isLive && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Live
            </span>
          )}
        </div>
      </div>

      {/* OBSERVE Phase */}
      <PhaseContainer
        phase="observe"
        displayName="OBSERVE"
        description="Market Data, Options Chains, Portfolio, Universe"
        status={phaseStatus.observe}
        compact={compact}
      >
        <div className="flex flex-wrap gap-2">
          <DataItem label="Market Data" isComplete={phaseStatus.observe !== "pending"} />
          <DataItem label="Options Chains" isComplete={phaseStatus.observe !== "pending"} />
          <DataItem label="Portfolio" isComplete={phaseStatus.observe !== "pending"} />
          <DataItem label="Universe" isComplete={phaseStatus.observe !== "pending"} />
        </div>
      </PhaseContainer>

      <ConnectionArrow
        isActive={phaseStatus.observe === "complete" && phaseStatus.orient !== "complete"}
        label="Market Context"
      />

      {/* ORIENT Phase */}
      <PhaseContainer
        phase="orient"
        displayName="ORIENT"
        description="Indicators, Regime, Memory, P/C Ratio"
        status={phaseStatus.orient}
        compact={compact}
      >
        <div className="flex flex-wrap gap-2">
          <DataItem label="Indicators" isComplete={phaseStatus.orient !== "pending"} />
          <DataItem label="Regime" isComplete={phaseStatus.orient !== "pending"} />
          <DataItem label="Memory" isComplete={phaseStatus.orient !== "pending"} />
          <DataItem label="P/C Ratio" isComplete={phaseStatus.orient !== "pending"} />
        </div>
      </PhaseContainer>

      <ConnectionArrow
        isActive={phaseStatus.orient === "complete" && phaseStatus.grounding !== "complete"}
        label="Orientation Data"
      />

      {/* GROUNDING Phase */}
      <PhaseContainer
        phase="grounding"
        displayName="GROUNDING"
        status={phaseStatus.grounding}
        isExpanded={expandedPhases.has("grounding")}
        onToggle={() => handlePhaseToggle("grounding")}
        collapsible
        compact={compact}
      >
        {renderAgents(["grounding"], false)}
      </PhaseContainer>

      <ConnectionArrow
        isActive={phaseStatus.grounding === "complete" && phaseStatus.analysts !== "complete"}
        label="Grounding Context"
      />

      {/* ANALYSTS Phase */}
      <PhaseContainer
        phase="analysts"
        displayName="ANALYSTS"
        description="Parallel analysis"
        status={phaseStatus.analysts}
        isExpanded={expandedPhases.has("analysts")}
        onToggle={() => handlePhaseToggle("analysts")}
        collapsible
        compact={compact}
      >
        {renderAgents(["news", "fundamentals"], true)}
      </PhaseContainer>

      <ConnectionArrow
        isActive={phaseStatus.analysts === "complete" && phaseStatus.debate !== "complete"}
        label="Analyst Outputs"
      />

      {/* DEBATE Phase */}
      <PhaseContainer
        phase="debate"
        displayName="DEBATE"
        description="Bull vs Bear thesis"
        status={phaseStatus.debate}
        isExpanded={expandedPhases.has("debate")}
        onToggle={() => handlePhaseToggle("debate")}
        collapsible
        compact={compact}
      >
        {renderAgents(["bullish", "bearish"], true)}
      </PhaseContainer>

      <ConnectionArrow
        isActive={phaseStatus.debate === "complete" && phaseStatus.trader !== "complete"}
        label="Bull/Bear Cases"
      />

      {/* TRADER Phase */}
      <PhaseContainer
        phase="trader"
        displayName="TRADER"
        description="Decision synthesis"
        status={phaseStatus.trader}
        isExpanded={expandedPhases.has("trader")}
        onToggle={() => handlePhaseToggle("trader")}
        collapsible
        compact={compact}
      >
        {renderAgents(["trader"], false)}
      </PhaseContainer>

      <ConnectionArrow
        isActive={phaseStatus.trader === "complete" && phaseStatus.consensus !== "complete"}
        label="DecisionPlan"
      />

      {/* CONSENSUS Phase */}
      <PhaseContainer
        phase="consensus"
        displayName="CONSENSUS"
        description="Risk & validation"
        status={phaseStatus.consensus}
        isExpanded={expandedPhases.has("consensus")}
        onToggle={() => handlePhaseToggle("consensus")}
        collapsible
        compact={compact}
      >
        {renderAgents(["risk", "critic"], true)}
      </PhaseContainer>

      <ConnectionArrow
        isActive={phaseStatus.consensus === "complete" && phaseStatus.act !== "complete"}
        label="Votes"
      />

      {/* ACT Phase */}
      <PhaseContainer
        phase="act"
        displayName="ACT"
        description="Execution Engine"
        status={phaseStatus.act}
        compact={compact}
      >
        <div className="flex justify-center">
          <div className="flex items-center gap-2 px-4 py-2 bg-stone-100 dark:bg-night-700 rounded-lg">
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400">EX</span>
            <div>
              <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                Execution Engine
              </p>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">
                {phaseStatus.act === "complete"
                  ? "Orders submitted"
                  : phaseStatus.act === "active"
                    ? "Executing..."
                    : "Pending consensus"}
              </p>
            </div>
          </div>
        </div>
      </PhaseContainer>
    </motion.div>
  );
}

export default AgentNetwork;
