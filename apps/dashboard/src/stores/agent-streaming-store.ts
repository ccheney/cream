/**
 * Zustand store for managing agent streaming state during trading cycles.
 * Persists tool calls, reasoning, and text output across navigation.
 *
 * @see docs/plans/ui/07-state-management.md
 */

import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

// ============================================
// Types
// ============================================

export type AgentType =
  | "technical"
  | "news"
  | "fundamentals"
  | "bullish"
  | "bearish"
  | "trader"
  | "risk"
  | "critic";

export type AgentStatus = "idle" | "processing" | "complete" | "error";

export interface ToolCall {
  toolCallId: string;
  toolName: string;
  toolArgs: string;
  status: "pending" | "complete" | "error";
  resultSummary?: string;
  durationMs?: number;
  timestamp: string;
}

export interface AgentStreamingState {
  status: AgentStatus;
  toolCalls: ToolCall[];
  reasoningText: string;
  textOutput: string;
  error?: string;
  lastUpdate: string | null;
}

// ============================================
// Store State & Actions
// ============================================

export interface AgentStreamingStoreState {
  /** Streaming state per agent type */
  agents: Map<AgentType, AgentStreamingState>;
  /** Current cycle ID being tracked */
  currentCycleId: string | null;
}

export interface AgentStreamingStoreActions {
  /** Add a tool call to an agent */
  addToolCall: (agentType: AgentType, toolCall: ToolCall) => void;
  /** Update a tool call result */
  updateToolCallResult: (
    agentType: AgentType,
    toolCallId: string,
    result: { success: boolean; resultSummary?: string; durationMs?: number }
  ) => void;
  /** Append reasoning text to an agent */
  appendReasoning: (agentType: AgentType, text: string, timestamp: string) => void;
  /** Append text output to an agent */
  appendTextOutput: (agentType: AgentType, text: string, timestamp: string) => void;
  /** Update agent status */
  updateAgentStatus: (agentType: AgentType, status: AgentStatus, error?: string) => void;
  /** Set the current cycle ID (clears state if different) */
  setCycleId: (cycleId: string) => void;
  /** Get streaming state for a specific agent */
  getAgent: (agentType: AgentType) => AgentStreamingState | undefined;
  /** Clear all streaming state */
  clear: () => void;
  /** Reset store to initial state */
  reset: () => void;
}

export type AgentStreamingStore = AgentStreamingStoreState & AgentStreamingStoreActions;

// ============================================
// Constants
// ============================================

export const AGENT_TYPES: AgentType[] = [
  "technical",
  "news",
  "fundamentals",
  "bullish",
  "bearish",
  "trader",
  "risk",
  "critic",
];

const createInitialAgentState = (): AgentStreamingState => ({
  status: "idle",
  toolCalls: [],
  reasoningText: "",
  textOutput: "",
  lastUpdate: null,
});

const initialState: AgentStreamingStoreState = {
  agents: new Map(),
  currentCycleId: null,
};

// ============================================
// Store
// ============================================

export const useAgentStreamingStore = create<AgentStreamingStore>()((set, get) => ({
  ...initialState,

  addToolCall: (agentType, toolCall) => {
    set((state) => {
      const newAgents = new Map(state.agents);
      const current = newAgents.get(agentType) ?? createInitialAgentState();
      newAgents.set(agentType, {
        ...current,
        status: "processing",
        toolCalls: [...current.toolCalls, toolCall],
        lastUpdate: toolCall.timestamp,
      });
      return { agents: newAgents };
    });
  },

  updateToolCallResult: (agentType, toolCallId, result) => {
    set((state) => {
      const newAgents = new Map(state.agents);
      const current = newAgents.get(agentType);
      if (!current) {
        return state;
      }

      const updatedToolCalls = current.toolCalls.map((tc) =>
        tc.toolCallId === toolCallId
          ? {
              ...tc,
              status: result.success ? ("complete" as const) : ("error" as const),
              resultSummary: result.resultSummary,
              durationMs: result.durationMs,
            }
          : tc
      );

      newAgents.set(agentType, {
        ...current,
        toolCalls: updatedToolCalls,
        lastUpdate: new Date().toISOString(),
      });
      return { agents: newAgents };
    });
  },

  appendReasoning: (agentType, text, timestamp) => {
    set((state) => {
      const newAgents = new Map(state.agents);
      const current = newAgents.get(agentType) ?? createInitialAgentState();
      newAgents.set(agentType, {
        ...current,
        status: "processing",
        reasoningText: current.reasoningText + text,
        lastUpdate: timestamp,
      });
      return { agents: newAgents };
    });
  },

  appendTextOutput: (agentType, text, timestamp) => {
    set((state) => {
      const newAgents = new Map(state.agents);
      const current = newAgents.get(agentType) ?? createInitialAgentState();
      newAgents.set(agentType, {
        ...current,
        status: "processing",
        textOutput: current.textOutput + text,
        lastUpdate: timestamp,
      });
      return { agents: newAgents };
    });
  },

  updateAgentStatus: (agentType, status, error) => {
    set((state) => {
      const newAgents = new Map(state.agents);
      const current = newAgents.get(agentType) ?? createInitialAgentState();
      newAgents.set(agentType, {
        ...current,
        status,
        error,
        lastUpdate: new Date().toISOString(),
      });
      return { agents: newAgents };
    });
  },

  setCycleId: (cycleId) => {
    const current = get().currentCycleId;
    if (current !== cycleId) {
      set({
        agents: new Map(),
        currentCycleId: cycleId,
      });
    }
  },

  getAgent: (agentType) => {
    return get().agents.get(agentType);
  },

  clear: () => {
    set({
      agents: new Map(),
      currentCycleId: null,
    });
  },

  reset: () => {
    set(initialState);
  },
}));

// ============================================
// Selectors & Hooks
// ============================================

export const selectAgents = (state: AgentStreamingStore) => state.agents;
export const selectCurrentCycleId = (state: AgentStreamingStore) => state.currentCycleId;

export function useAgentStreamingState(agentType: AgentType) {
  return useAgentStreamingStore((state) => state.agents.get(agentType));
}

export function useAllAgentStreaming() {
  return useAgentStreamingStore(
    useShallow((state) => ({
      agents: state.agents,
      currentCycleId: state.currentCycleId,
      getAgent: state.getAgent,
    }))
  );
}

export function useAgentStreamingActions() {
  return useAgentStreamingStore(
    useShallow((state) => ({
      addToolCall: state.addToolCall,
      updateToolCallResult: state.updateToolCallResult,
      appendReasoning: state.appendReasoning,
      appendTextOutput: state.appendTextOutput,
      updateAgentStatus: state.updateAgentStatus,
      setCycleId: state.setCycleId,
      clear: state.clear,
      reset: state.reset,
    }))
  );
}

export default useAgentStreamingStore;
