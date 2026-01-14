"use client";

/**
 * Keyboard Navigation Hook for Agent Network
 *
 * Manages focus state and keyboard interactions for the network visualization.
 *
 * @see docs/plans/43-agent-network-visualization.md
 */

import { type RefObject, useCallback, useRef } from "react";
import { type NetworkAgentType, type OODAPhase, PHASE_CONFIG } from "./types";

// ============================================
// Types
// ============================================

export interface UseKeyboardNavigationOptions {
	selectedAgent: NetworkAgentType | null;
	onAgentSelect: (agent: NetworkAgentType | null) => void;
	expandedPhases: Set<OODAPhase>;
	onPhaseToggle: (phase: OODAPhase) => void;
}

export interface UseKeyboardNavigationReturn {
	/** Container ref for keyboard event handling */
	containerRef: RefObject<HTMLDivElement | null>;
	/** Handle keyboard events */
	handleKeyDown: (event: React.KeyboardEvent) => void;
	/** Get focusable agents in order */
	getFocusableAgents: () => NetworkAgentType[];
}

// ============================================
// Hook
// ============================================

export function useKeyboardNavigation({
	selectedAgent,
	onAgentSelect,
	expandedPhases,
	onPhaseToggle,
}: UseKeyboardNavigationOptions): UseKeyboardNavigationReturn {
	const containerRef = useRef<HTMLDivElement>(null);

	/** Get all focusable agents in visual order (top to bottom, left to right) */
	const getFocusableAgents = useCallback((): NetworkAgentType[] => {
		const agents: NetworkAgentType[] = [];
		for (const config of PHASE_CONFIG) {
			if (config.agents.length > 0 && expandedPhases.has(config.phase)) {
				agents.push(...config.agents);
			}
		}
		return agents;
	}, [expandedPhases]);

	/** Get the phase for a given agent */
	const getPhaseForAgent = useCallback((agent: NetworkAgentType): OODAPhase | null => {
		for (const config of PHASE_CONFIG) {
			if (config.agents.includes(agent)) {
				return config.phase;
			}
		}
		return null;
	}, []);

	/** Get previous phase that has agents */
	const getPreviousPhaseWithAgents = useCallback(
		(currentPhase: OODAPhase): OODAPhase | null => {
			const phaseIndex = PHASE_CONFIG.findIndex((p) => p.phase === currentPhase);
			for (let i = phaseIndex - 1; i >= 0; i--) {
				const config = PHASE_CONFIG[i];
				if (config && config.agents.length > 0 && expandedPhases.has(config.phase)) {
					return config.phase;
				}
			}
			return null;
		},
		[expandedPhases]
	);

	/** Get next phase that has agents */
	const getNextPhaseWithAgents = useCallback(
		(currentPhase: OODAPhase): OODAPhase | null => {
			const phaseIndex = PHASE_CONFIG.findIndex((p) => p.phase === currentPhase);
			for (let i = phaseIndex + 1; i < PHASE_CONFIG.length; i++) {
				const config = PHASE_CONFIG[i];
				if (config && config.agents.length > 0 && expandedPhases.has(config.phase)) {
					return config.phase;
				}
			}
			return null;
		},
		[expandedPhases]
	);

	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent) => {
			const focusableAgents = getFocusableAgents();
			if (focusableAgents.length === 0) {
				return;
			}

			switch (event.key) {
				case "ArrowUp": {
					event.preventDefault();
					if (!selectedAgent) {
						// Select last agent
						onAgentSelect(focusableAgents[focusableAgents.length - 1] ?? null);
					} else {
						const currentPhase = getPhaseForAgent(selectedAgent);
						if (!currentPhase) {
							return;
						}

						// Find previous phase with agents
						const prevPhase = getPreviousPhaseWithAgents(currentPhase);
						if (prevPhase) {
							const prevConfig = PHASE_CONFIG.find((p) => p.phase === prevPhase);
							if (prevConfig && prevConfig.agents.length > 0) {
								// Select first agent in previous phase
								onAgentSelect(prevConfig.agents[0] ?? null);
							}
						}
					}
					break;
				}

				case "ArrowDown": {
					event.preventDefault();
					if (!selectedAgent) {
						// Select first agent
						onAgentSelect(focusableAgents[0] ?? null);
					} else {
						const currentPhase = getPhaseForAgent(selectedAgent);
						if (!currentPhase) {
							return;
						}

						// Find next phase with agents
						const nextPhase = getNextPhaseWithAgents(currentPhase);
						if (nextPhase) {
							const nextConfig = PHASE_CONFIG.find((p) => p.phase === nextPhase);
							if (nextConfig && nextConfig.agents.length > 0) {
								// Select first agent in next phase
								onAgentSelect(nextConfig.agents[0] ?? null);
							}
						}
					}
					break;
				}

				case "ArrowLeft": {
					event.preventDefault();
					if (selectedAgent) {
						const currentPhase = getPhaseForAgent(selectedAgent);
						if (!currentPhase) {
							return;
						}

						const config = PHASE_CONFIG.find((p) => p.phase === currentPhase);
						if (config && config.agents.length > 1) {
							const indexInPhase = config.agents.indexOf(selectedAgent);
							if (indexInPhase > 0) {
								onAgentSelect(config.agents[indexInPhase - 1] ?? null);
							}
						}
					}
					break;
				}

				case "ArrowRight": {
					event.preventDefault();
					if (selectedAgent) {
						const currentPhase = getPhaseForAgent(selectedAgent);
						if (!currentPhase) {
							return;
						}

						const config = PHASE_CONFIG.find((p) => p.phase === currentPhase);
						if (config && config.agents.length > 1) {
							const indexInPhase = config.agents.indexOf(selectedAgent);
							if (indexInPhase < config.agents.length - 1) {
								onAgentSelect(config.agents[indexInPhase + 1] ?? null);
							}
						}
					}
					break;
				}

				case "Tab": {
					// Allow normal tab behavior to move to next/previous element
					if (!selectedAgent && focusableAgents.length > 0) {
						if (event.shiftKey) {
							// Let tab work normally when no agent selected
						} else {
							event.preventDefault();
							onAgentSelect(focusableAgents[0] ?? null);
						}
					}
					break;
				}

				case "Escape": {
					event.preventDefault();
					onAgentSelect(null);
					break;
				}

				case " ": // Space
				case "Enter": {
					event.preventDefault();
					if (selectedAgent) {
						const currentPhase = getPhaseForAgent(selectedAgent);
						if (currentPhase) {
							onPhaseToggle(currentPhase);
						}
					}
					break;
				}

				case "Home": {
					event.preventDefault();
					if (focusableAgents.length > 0) {
						onAgentSelect(focusableAgents[0] ?? null);
					}
					break;
				}

				case "End": {
					event.preventDefault();
					if (focusableAgents.length > 0) {
						onAgentSelect(focusableAgents[focusableAgents.length - 1] ?? null);
					}
					break;
				}
			}
		},
		[
			selectedAgent,
			onAgentSelect,
			onPhaseToggle,
			getFocusableAgents,
			getPhaseForAgent,
			getPreviousPhaseWithAgents,
			getNextPhaseWithAgents,
		]
	);

	return {
		containerRef,
		handleKeyDown,
		getFocusableAgents,
	};
}

export default useKeyboardNavigation;
