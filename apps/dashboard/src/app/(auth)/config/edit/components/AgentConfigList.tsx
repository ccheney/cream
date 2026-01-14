"use client";

import { useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { RuntimeAgentConfig, RuntimeAgentType } from "@/lib/api/types";
import { InfoIcon, LabelWithTooltip } from "./helpers";

export interface AgentConfigListProps {
	agents: Record<RuntimeAgentType, RuntimeAgentConfig>;
	onSave: (agentType: RuntimeAgentType, updates: Partial<RuntimeAgentConfig>) => void;
	onChange: () => void;
	isSaving: boolean;
}

const AGENT_DISPLAY_NAMES: Record<RuntimeAgentType, string> = {
	technical_analyst: "Technical Analyst",
	news_analyst: "News Analyst",
	fundamentals_analyst: "Fundamentals Analyst",
	bullish_researcher: "Bullish Researcher",
	bearish_researcher: "Bearish Researcher",
	trader: "Trader",
	risk_manager: "Risk Manager",
	critic: "Critic",
};

export function AgentConfigList({ agents, onSave, onChange, isSaving }: AgentConfigListProps) {
	const [expandedAgent, setExpandedAgent] = useState<RuntimeAgentType | null>(null);
	const [formData, setFormData] = useState<Record<string, Partial<RuntimeAgentConfig>>>({});

	function handleChange(
		agentType: RuntimeAgentType,
		field: keyof RuntimeAgentConfig,
		value: unknown
	): void {
		setFormData((prev) => ({
			...prev,
			[agentType]: { ...(prev[agentType] || {}), [field]: value },
		}));
		onChange();
	}

	function handleSave(agentType: RuntimeAgentType): void {
		if (formData[agentType] && Object.keys(formData[agentType]).length > 0) {
			onSave(agentType, formData[agentType]);
			setFormData((prev) => {
				const updated = { ...prev };
				delete updated[agentType];
				return updated;
			});
		}
	}

	const agentTypes = Object.keys(agents) as RuntimeAgentType[];

	return (
		<div className="space-y-4">
			<h3 className="text-lg font-medium text-stone-900 dark:text-night-50">Agent Configuration</h3>

			<div className="space-y-2">
				{agentTypes.map((agentType) => {
					const agent = agents[agentType];
					const isExpanded = expandedAgent === agentType;
					const hasChanges = formData[agentType] && Object.keys(formData[agentType]).length > 0;

					return (
						<AgentConfigItem
							key={agentType}
							agentType={agentType}
							agent={agent}
							isExpanded={isExpanded}
							hasChanges={hasChanges ?? false}
							formData={formData[agentType]}
							isSaving={isSaving}
							onToggle={() => setExpandedAgent(isExpanded ? null : agentType)}
							onChange={(field, value) => handleChange(agentType, field, value)}
							onSave={() => handleSave(agentType)}
						/>
					);
				})}
			</div>
		</div>
	);
}

interface AgentConfigItemProps {
	agentType: RuntimeAgentType;
	agent: RuntimeAgentConfig;
	isExpanded: boolean;
	hasChanges: boolean;
	formData?: Partial<RuntimeAgentConfig>;
	isSaving: boolean;
	onToggle: () => void;
	onChange: (field: keyof RuntimeAgentConfig, value: unknown) => void;
	onSave: () => void;
}

function AgentConfigItem({
	agentType,
	agent,
	isExpanded,
	hasChanges,
	formData,
	isSaving,
	onToggle,
	onChange,
	onSave,
}: AgentConfigItemProps) {
	return (
		<div className="border border-cream-200 dark:border-night-700 rounded-lg overflow-hidden">
			<button
				type="button"
				onClick={onToggle}
				className="w-full flex items-center justify-between p-4 text-left hover:bg-cream-50 dark:hover:bg-night-700"
			>
				<div className="flex items-center gap-3">
					<span
						className={`w-2 h-2 rounded-full ${agent.enabled ? "bg-emerald-500" : "bg-cream-300"}`}
					/>
					<span className="font-medium text-stone-900 dark:text-night-50">
						{AGENT_DISPLAY_NAMES[agentType]}
					</span>
					{hasChanges && (
						<span className="text-xs text-amber-600 dark:text-amber-400">Modified</span>
					)}
				</div>
				<div className="flex items-center gap-2">
					<svg
						className={`w-5 h-5 text-stone-400 dark:text-night-400 transition-transform ${
							isExpanded ? "rotate-180" : ""
						}`}
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						aria-hidden="true"
					>
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
					</svg>
				</div>
			</button>

			{isExpanded && (
				<div className="p-4 border-t border-cream-200 dark:border-night-700 bg-cream-50 dark:bg-night-900">
					<div className="flex items-center gap-1.5 mb-4">
						<label className="flex items-center gap-2 cursor-pointer">
							<input
								type="checkbox"
								checked={(formData?.enabled as boolean) ?? agent.enabled}
								onChange={(e) => onChange("enabled", e.target.checked)}
								className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
							/>
							<span className="text-sm font-medium text-stone-700 dark:text-night-100">
								Enabled
							</span>
						</label>
						<Tooltip>
							<TooltipTrigger>
								<InfoIcon className="w-3.5 h-3.5 text-stone-400 dark:text-night-400 cursor-help" />
							</TooltipTrigger>
							<TooltipContent>
								Whether this agent participates in trading consensus decisions
							</TooltipContent>
						</Tooltip>
					</div>

					<div className="mt-4">
						<LabelWithTooltip
							htmlFor={`${agentType}-systemPrompt`}
							label="System Prompt Override"
							tooltip="Custom instructions that replace the agent's default system prompt. Leave empty to use defaults."
						/>
						<textarea
							id={`${agentType}-systemPrompt`}
							rows={3}
							value={(formData?.systemPromptOverride as string) ?? agent.systemPromptOverride ?? ""}
							onChange={(e) => onChange("systemPromptOverride", e.target.value || null)}
							placeholder="Leave empty to use default prompt"
							className="w-full px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-stone-900 dark:text-night-50"
						/>
					</div>

					<div className="mt-4 flex justify-end">
						<button
							type="button"
							onClick={onSave}
							disabled={isSaving || !hasChanges}
							className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
						>
							{isSaving ? "Saving..." : "Save Agent"}
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
