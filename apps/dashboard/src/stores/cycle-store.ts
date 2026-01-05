/**
 * Cycle State Store
 *
 * Zustand store for managing active OODA cycle state during live trading.
 * Receives real-time updates from WebSocket during trading cycles.
 *
 * @see docs/plans/ui/07-state-management.md lines 106-120
 */

import { create } from "zustand";

// ============================================
// Types
// ============================================

/**
 * OODA cycle phases.
 */
export type CyclePhase = "observe" | "orient" | "decide" | "act" | "complete";

/**
 * Active cycle information.
 */
export interface CycleInfo {
  id: string;
  phase: CyclePhase;
  startedAt: string;
  progress: number; // 0-100
  estimatedEndAt?: string;
}

/**
 * Agent output during a cycle.
 */
export interface AgentOutput {
  decisionId: string;
  agentType: string;
  vote: "APPROVE" | "REJECT" | "ABSTAIN";
  confidence: number;
  reasoningSummary?: string;
  fullReasoning?: string;
  tokensUsed?: number;
  latencyMs?: number;
  timestamp: string;
}

/**
 * Symbol analysis during a cycle.
 */
export interface SymbolAnalysis {
  symbol: string;
  phase: CyclePhase;
  status: "pending" | "analyzing" | "complete" | "skipped";
  signals?: Record<string, unknown>;
  recommendation?: string;
  confidence?: number;
  timestamp: string;
}

/**
 * Cycle store state.
 */
export interface CycleState {
  /** Currently active cycle, null if not running */
  activeCycle: CycleInfo | null;

  /** Agent outputs keyed by agentType */
  agentOutputs: Map<string, AgentOutput>;

  /** Symbol analysis keyed by symbol */
  symbolAnalysis: Map<string, SymbolAnalysis>;

  /** Streaming agent output (partial text) */
  streamingOutput: {
    agentType: string;
    text: string;
  } | null;
}

/**
 * Cycle store actions.
 */
export interface CycleActions {
  /** Set the active cycle */
  setCycle: (cycle: CycleInfo | null) => void;

  /** Update cycle phase */
  updatePhase: (phase: CyclePhase) => void;

  /** Update cycle progress */
  updateProgress: (progress: number) => void;

  /** Add or update agent output */
  updateAgentOutput: (output: AgentOutput) => void;

  /** Add or update symbol analysis */
  updateSymbolAnalysis: (analysis: SymbolAnalysis) => void;

  /** Set streaming output (partial agent reasoning) */
  setStreamingOutput: (output: { agentType: string; text: string } | null) => void;

  /** Append to streaming output */
  appendStreamingOutput: (text: string) => void;

  /** Clear all outputs for a new cycle */
  clearOutputs: () => void;

  /** Complete the current cycle */
  completeCycle: () => void;

  /** Reset entire store */
  reset: () => void;
}

/**
 * Combined store type.
 */
export type CycleStore = CycleState & CycleActions;

// ============================================
// Initial State
// ============================================

const initialState: CycleState = {
  activeCycle: null,
  agentOutputs: new Map(),
  symbolAnalysis: new Map(),
  streamingOutput: null,
};

// ============================================
// Store Implementation
// ============================================

/**
 * Cycle state store.
 *
 * Not persisted - cycle state is ephemeral and reconstructed
 * from server on reconnection.
 *
 * @example
 * ```tsx
 * const activeCycle = useCycleStore((s) => s.activeCycle);
 * const agentOutputs = useCycleStore((s) => s.agentOutputs);
 *
 * return (
 *   <div>
 *     {activeCycle && (
 *       <CycleProgress
 *         phase={activeCycle.phase}
 *         progress={activeCycle.progress}
 *       />
 *     )}
 *   </div>
 * );
 * ```
 */
export const useCycleStore = create<CycleStore>((set, get) => ({
  // Initial state
  ...initialState,

  // Actions
  setCycle: (cycle) => {
    set({ activeCycle: cycle });
    if (cycle) {
      // Clear previous cycle data when starting new cycle
      get().clearOutputs();
    }
  },

  updatePhase: (phase) => {
    const cycle = get().activeCycle;
    if (cycle) {
      set({
        activeCycle: {
          ...cycle,
          phase,
        },
      });
    }
  },

  updateProgress: (progress) => {
    const cycle = get().activeCycle;
    if (cycle) {
      set({
        activeCycle: {
          ...cycle,
          progress: Math.min(100, Math.max(0, progress)),
        },
      });
    }
  },

  updateAgentOutput: (output) => {
    set((state) => {
      const newOutputs = new Map(state.agentOutputs);
      newOutputs.set(output.agentType, output);
      return { agentOutputs: newOutputs };
    });
  },

  updateSymbolAnalysis: (analysis) => {
    set((state) => {
      const newAnalysis = new Map(state.symbolAnalysis);
      newAnalysis.set(analysis.symbol, analysis);
      return { symbolAnalysis: newAnalysis };
    });
  },

  setStreamingOutput: (output) => {
    set({ streamingOutput: output });
  },

  appendStreamingOutput: (text) => {
    const current = get().streamingOutput;
    if (current) {
      set({
        streamingOutput: {
          ...current,
          text: current.text + text,
        },
      });
    }
  },

  clearOutputs: () => {
    set({
      agentOutputs: new Map(),
      symbolAnalysis: new Map(),
      streamingOutput: null,
    });
  },

  completeCycle: () => {
    const cycle = get().activeCycle;
    if (cycle) {
      set({
        activeCycle: {
          ...cycle,
          phase: "complete",
          progress: 100,
        },
        streamingOutput: null,
      });
    }
  },

  reset: () => {
    set(initialState);
  },
}));

// ============================================
// Selectors
// ============================================

export const selectActiveCycle = (state: CycleStore) => state.activeCycle;
export const selectCyclePhase = (state: CycleStore) => state.activeCycle?.phase;
export const selectCycleProgress = (state: CycleStore) =>
  state.activeCycle?.progress ?? 0;
export const selectIsRunning = (state: CycleStore) =>
  state.activeCycle !== null && state.activeCycle.phase !== "complete";
export const selectAgentOutputs = (state: CycleStore) => state.agentOutputs;
export const selectSymbolAnalysis = (state: CycleStore) => state.symbolAnalysis;
export const selectStreamingOutput = (state: CycleStore) => state.streamingOutput;

// ============================================
// Convenience Hooks
// ============================================

/**
 * Hook for active cycle state.
 */
export function useActiveCycle() {
  return useCycleStore((state) => ({
    cycle: state.activeCycle,
    phase: state.activeCycle?.phase,
    progress: state.activeCycle?.progress ?? 0,
    isRunning:
      state.activeCycle !== null && state.activeCycle.phase !== "complete",
  }));
}

/**
 * Hook for agent outputs.
 */
export function useAgentOutputs() {
  const outputs = useCycleStore((state) => state.agentOutputs);
  return {
    outputs,
    getOutput: (agentType: string) => outputs.get(agentType),
    hasOutput: (agentType: string) => outputs.has(agentType),
    count: outputs.size,
  };
}

/**
 * Hook for specific agent output.
 */
export function useAgentOutput(agentType: string) {
  return useCycleStore((state) => state.agentOutputs.get(agentType));
}

/**
 * Hook for symbol analysis.
 */
export function useSymbolAnalysis(symbol?: string) {
  const analysis = useCycleStore((state) => state.symbolAnalysis);
  if (symbol) {
    return analysis.get(symbol);
  }
  return analysis;
}

/**
 * Hook for streaming output.
 */
export function useStreamingOutput() {
  return useCycleStore((state) => state.streamingOutput);
}

/**
 * Hook for cycle actions.
 */
export function useCycleActions() {
  return useCycleStore((state) => ({
    setCycle: state.setCycle,
    updatePhase: state.updatePhase,
    updateProgress: state.updateProgress,
    updateAgentOutput: state.updateAgentOutput,
    updateSymbolAnalysis: state.updateSymbolAnalysis,
    setStreamingOutput: state.setStreamingOutput,
    appendStreamingOutput: state.appendStreamingOutput,
    clearOutputs: state.clearOutputs,
    completeCycle: state.completeCycle,
    reset: state.reset,
  }));
}

export default useCycleStore;
