/**
 * Agents Query Hooks
 *
 * TanStack Query hooks for agent status and outputs.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { get, put } from "@/lib/api/client";
import { CACHE_TIMES, queryKeys, STALE_TIMES } from "@/lib/api/query-client";
import type { AgentConfig, AgentOutput, AgentStatus } from "@/lib/api/types";

/**
 * Get all agent statuses.
 */
export function useAgentStatuses() {
	return useQuery({
		queryKey: [...queryKeys.agents.all, "status"] as const,
		queryFn: async () => {
			const { data } = await get<AgentStatus[]>("/api/agents/status");
			return data;
		},
		staleTime: STALE_TIMES.PORTFOLIO,
		gcTime: CACHE_TIMES.PORTFOLIO,
	});
}

/**
 * Get agent outputs for a specific agent type.
 */
export function useAgentOutputs(agentType: string, limit = 50) {
	return useQuery({
		queryKey: [...queryKeys.agents.all, agentType, "outputs", limit] as const,
		queryFn: async () => {
			const { data } = await get<AgentOutput[]>(`/api/agents/${agentType}/outputs?limit=${limit}`);
			return data;
		},
		staleTime: STALE_TIMES.DECISIONS,
		gcTime: CACHE_TIMES.DECISIONS,
		enabled: Boolean(agentType),
	});
}

/**
 * Get agent config.
 */
export function useAgentConfig(agentType: string) {
	return useQuery({
		queryKey: [...queryKeys.agents.all, agentType, "config"] as const,
		queryFn: async () => {
			const { data } = await get<AgentConfig>(`/api/agents/${agentType}/config`);
			return data;
		},
		staleTime: STALE_TIMES.CONFIG,
		gcTime: CACHE_TIMES.CONFIG,
		enabled: Boolean(agentType),
	});
}

/**
 * Update agent config.
 */
export function useUpdateAgentConfig() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			agentType,
			config,
		}: {
			agentType: string;
			config: Partial<AgentConfig>;
		}) => {
			const { data } = await put<AgentConfig>(`/api/agents/${agentType}/config`, config);
			return data;
		},
		onSuccess: (data, { agentType }) => {
			queryClient.setQueryData([...queryKeys.agents.all, agentType, "config"], data);
			queryClient.invalidateQueries({ queryKey: queryKeys.agents.all });
		},
	});
}
