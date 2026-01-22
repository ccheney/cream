/**
 * Zustand store for managing active OODA cycle state during live trading.
 * Receives real-time updates from WebSocket during trading cycles.
 *
 * @see docs/plans/ui/07-state-management.md lines 106-120
 */

import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

export type CyclePhase = "observe" | "orient" | "decide" | "act" | "complete";

export interface CycleInfo {
	id: string;
	phase: CyclePhase;
	startedAt: string;
	progress: number;
	estimatedEndAt?: string;
}

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

export interface SymbolAnalysis {
	symbol: string;
	phase: CyclePhase;
	status: "pending" | "analyzing" | "complete" | "skipped";
	signals?: Record<string, unknown>;
	recommendation?: string;
	confidence?: number;
	timestamp: string;
}

export interface CycleState {
	activeCycle: CycleInfo | null;
	agentOutputs: Map<string, AgentOutput>;
	symbolAnalysis: Map<string, SymbolAnalysis>;
	streamingOutput: {
		agentType: string;
		text: string;
	} | null;
}

export interface CycleActions {
	setCycle: (cycle: CycleInfo | null) => void;
	updatePhase: (phase: CyclePhase) => void;
	updateProgress: (progress: number) => void;
	updateAgentOutput: (output: AgentOutput) => void;
	updateSymbolAnalysis: (analysis: SymbolAnalysis) => void;
	setStreamingOutput: (output: { agentType: string; text: string } | null) => void;
	appendStreamingOutput: (text: string) => void;
	clearOutputs: () => void;
	completeCycle: () => void;
	reset: () => void;
}

export type CycleStore = CycleState & CycleActions;

const initialState: CycleState = {
	activeCycle: null,
	agentOutputs: new Map(),
	symbolAnalysis: new Map(),
	streamingOutput: null,
};

/**
 * Not persisted - cycle state is ephemeral and reconstructed from server on reconnection.
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
	...initialState,

	setCycle: (cycle) => {
		set({ activeCycle: cycle });
		if (cycle) {
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

export const selectActiveCycle = (state: CycleStore) => state.activeCycle;
export const selectCyclePhase = (state: CycleStore) => state.activeCycle?.phase;
export const selectCycleProgress = (state: CycleStore) => state.activeCycle?.progress ?? 0;
export const selectIsRunning = (state: CycleStore) =>
	state.activeCycle !== null && state.activeCycle.phase !== "complete";
export const selectAgentOutputs = (state: CycleStore) => state.agentOutputs;
export const selectSymbolAnalysis = (state: CycleStore) => state.symbolAnalysis;
export const selectStreamingOutput = (state: CycleStore) => state.streamingOutput;

export function useActiveCycle() {
	return useCycleStore(
		useShallow((state) => ({
			cycle: state.activeCycle,
			phase: state.activeCycle?.phase,
			progress: state.activeCycle?.progress ?? 0,
			isRunning: state.activeCycle !== null && state.activeCycle.phase !== "complete",
		})),
	);
}

export function useAgentOutputs() {
	return useCycleStore(
		useShallow((state) => ({
			outputs: state.agentOutputs,
			getOutput: (agentType: string) => state.agentOutputs.get(agentType),
			hasOutput: (agentType: string) => state.agentOutputs.has(agentType),
			count: state.agentOutputs.size,
		})),
	);
}

export function useAgentOutput(agentType: string) {
	return useCycleStore((state) => state.agentOutputs.get(agentType));
}

export function useSymbolAnalysis(symbol?: string) {
	const analysis = useCycleStore((state) => state.symbolAnalysis);
	if (symbol) {
		return analysis.get(symbol);
	}
	return analysis;
}

export function useStreamingOutput() {
	return useCycleStore((state) => state.streamingOutput);
}

export function useCycleActions() {
	return useCycleStore(
		useShallow((state) => ({
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
		})),
	);
}

export default useCycleStore;
