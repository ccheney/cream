/**
 * Zustand store for managing agent streaming state during trading cycles.
 * Persists tool calls, reasoning, and text output across navigation.
 *
 * @see docs/plans/ui/07-state-management.md
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

// ============================================
// Types
// ============================================

export type AgentType =
  | "grounding"
  | "news"
  | "fundamentals"
  | "bullish"
  | "bearish"
  | "trader"
  | "risk"
  | "critic";

export type AgentStatus = "idle" | "processing" | "complete" | "error";

/** OODA workflow phases for network visualization */
export type OODAPhase =
  | "observe"
  | "orient"
  | "grounding"
  | "analysts"
  | "debate"
  | "trader"
  | "consensus"
  | "act";

export type PhaseStatus = "pending" | "active" | "complete" | "error";

export interface DataFlow {
  id: string;
  from: string;
  to: string;
  label: string;
  timestamp: number;
}

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

/** Initial phase status state */
const INITIAL_PHASE_STATUS: Record<OODAPhase, PhaseStatus> = {
  observe: "pending",
  orient: "pending",
  grounding: "pending",
  analysts: "pending",
  debate: "pending",
  trader: "pending",
  consensus: "pending",
  act: "pending",
};

export interface AgentStreamingStoreState {
  /** Streaming state per agent type */
  agents: Map<AgentType, AgentStreamingState>;
  /** Current cycle ID being tracked */
  currentCycleId: string | null;
  /** Current OODA phase being executed */
  currentPhase: OODAPhase | null;
  /** Status of each phase */
  phaseStatus: Record<OODAPhase, PhaseStatus>;
  /** Active data flows */
  dataFlows: DataFlow[];
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
  /** Set the current phase */
  setCurrentPhase: (phase: OODAPhase) => void;
  /** Update phase status */
  updatePhaseStatus: (phase: OODAPhase, status: PhaseStatus) => void;
  /** Add a data flow */
  addDataFlow: (flow: DataFlow) => void;
  /** Clear data flows */
  clearDataFlows: () => void;
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
  "grounding",
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
  currentPhase: null,
  phaseStatus: { ...INITIAL_PHASE_STATUS },
  dataFlows: [],
};

// ============================================
// Store
// ============================================

// Persisted state type (only state, not actions)
type PersistedState = Pick<
  AgentStreamingStoreState,
  "agents" | "currentCycleId" | "currentPhase" | "phaseStatus" | "dataFlows"
>;

// Custom storage to handle Map serialization
type SerializedState = {
  agents: [AgentType, AgentStreamingState][];
  currentCycleId: string | null;
  currentPhase: OODAPhase | null;
  phaseStatus: Record<OODAPhase, PhaseStatus>;
  dataFlows: DataFlow[];
};

const storage = createJSONStorage<PersistedState>(() => sessionStorage, {
  reviver: (_key, value: unknown) => {
    // Convert serialized agents array back to Map and deduplicate toolCalls
    if (
      typeof value === "object" &&
      value !== null &&
      "agents" in value &&
      Array.isArray((value as SerializedState).agents)
    ) {
      const deduplicatedAgents = (value as SerializedState).agents.map(
        ([agentType, state]): [AgentType, AgentStreamingState] => {
          const seen = new Set<string>();
          const uniqueToolCalls = state.toolCalls.filter((tc) => {
            if (seen.has(tc.toolCallId)) {
              return false;
            }
            seen.add(tc.toolCallId);
            return true;
          });
          return [agentType, { ...state, toolCalls: uniqueToolCalls }];
        }
      );
      return {
        ...value,
        agents: new Map(deduplicatedAgents),
      };
    }
    return value;
  },
  replacer: (_key, value: unknown) => {
    // Convert Map to array for serialization
    if (value instanceof Map) {
      return Array.from(value.entries());
    }
    return value;
  },
});

export const useAgentStreamingStore = create<AgentStreamingStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      addToolCall: (agentType, toolCall) => {
        set((state) => {
          const newAgents = new Map(state.agents);
          const current = newAgents.get(agentType) ?? createInitialAgentState();
          // Upsert by toolCallId (streaming can emit partial → final tool-call events)
          const existingIndex = current.toolCalls.findIndex(
            (tc) => tc.toolCallId === toolCall.toolCallId
          );
          if (existingIndex !== -1) {
            const existing = current.toolCalls[existingIndex];
            if (!existing) {
              return state;
            }
            const updatedToolCalls = [...current.toolCalls];
            updatedToolCalls[existingIndex] = {
              toolCallId: existing.toolCallId,
              toolName: toolCall.toolName,
              toolArgs: toolCall.toolArgs,
              status: existing.status,
              resultSummary: existing.resultSummary,
              durationMs: existing.durationMs,
              timestamp: toolCall.timestamp,
            };

            newAgents.set(agentType, {
              ...current,
              status: "processing",
              toolCalls: updatedToolCalls,
              lastUpdate: toolCall.timestamp,
            });
            return { agents: newAgents };
          }
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

          // When transitioning to "processing", reset streaming state to clear cached output
          if (status === "processing") {
            newAgents.set(agentType, {
              ...createInitialAgentState(),
              status: "processing",
              lastUpdate: new Date().toISOString(),
            });
          } else {
            newAgents.set(agentType, {
              ...current,
              status,
              error,
              lastUpdate: new Date().toISOString(),
            });
          }
          return { agents: newAgents };
        });
      },

      setCycleId: (cycleId) => {
        const current = get().currentCycleId;
        if (current !== cycleId) {
          set({
            agents: new Map(),
            currentCycleId: cycleId,
            currentPhase: null,
            phaseStatus: { ...INITIAL_PHASE_STATUS },
            dataFlows: [],
          });
        }
      },

      getAgent: (agentType) => {
        return get().agents.get(agentType);
      },

      setCurrentPhase: (phase) => {
        set((state) => {
          const newPhaseStatus = { ...state.phaseStatus };
          // Set the new phase to active
          newPhaseStatus[phase] = "active";
          return {
            currentPhase: phase,
            phaseStatus: newPhaseStatus,
          };
        });
      },

      updatePhaseStatus: (phase, status) => {
        set((state) => ({
          phaseStatus: {
            ...state.phaseStatus,
            [phase]: status,
          },
        }));
      },

      addDataFlow: (flow) => {
        set((state) => ({
          dataFlows: [...state.dataFlows.slice(-9), flow], // Keep last 10 flows
        }));
      },

      clearDataFlows: () => {
        set({ dataFlows: [] });
      },

      clear: () => {
        set({
          agents: new Map(),
          currentCycleId: null,
          currentPhase: null,
          phaseStatus: { ...INITIAL_PHASE_STATUS },
          dataFlows: [],
        });
      },

      reset: () => {
        set(initialState);
      },
    }),
    {
      name: "agent-streaming-storage",
      storage,
      partialize: (state) => ({
        agents: state.agents,
        currentCycleId: state.currentCycleId,
        currentPhase: state.currentPhase,
        phaseStatus: state.phaseStatus,
        dataFlows: state.dataFlows,
      }),
    }
  )
);

// ============================================
// Selectors & Hooks
// ============================================

export const selectAgents = (state: AgentStreamingStore) => state.agents;
export const selectCurrentCycleId = (state: AgentStreamingStore) => state.currentCycleId;
export const selectCurrentPhase = (state: AgentStreamingStore) => state.currentPhase;
export const selectPhaseStatus = (state: AgentStreamingStore) => state.phaseStatus;
export const selectDataFlows = (state: AgentStreamingStore) => state.dataFlows;

export function useAgentStreamingState(agentType: AgentType) {
  return useAgentStreamingStore((state) => state.agents.get(agentType));
}

export function useAllAgentStreaming() {
  return useAgentStreamingStore(
    useShallow((state) => ({
      agents: state.agents,
      currentCycleId: state.currentCycleId,
      currentPhase: state.currentPhase,
      phaseStatus: state.phaseStatus,
      dataFlows: state.dataFlows,
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
      setCurrentPhase: state.setCurrentPhase,
      updatePhaseStatus: state.updatePhaseStatus,
      addDataFlow: state.addDataFlow,
      clearDataFlows: state.clearDataFlows,
      clear: state.clear,
      reset: state.reset,
    }))
  );
}

export default useAgentStreamingStore;
