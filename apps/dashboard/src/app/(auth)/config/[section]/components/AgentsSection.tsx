"use client";

/**
 * Agents Section Editor
 *
 * Configuration editor for agent settings.
 */

import { useState } from "react";
import { useAgentConfig, useAgentStatuses, useUpdateAgentConfig } from "@/hooks/queries";
import type { AgentConfig, AgentStatus } from "@/lib/api/types";
import { useAgentEditor } from "../hooks";

export function AgentsSection() {
	const { data: statuses, isLoading } = useAgentStatuses();
	const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
	const { data: config, isLoading: configLoading } = useAgentConfig(selectedAgent || "");
	const updateConfig = useUpdateAgentConfig();
	const editor = useAgentEditor(selectedAgent, config, updateConfig);

	function handleSelectAgent(agentType: string): void {
		setSelectedAgent(agentType);
		if (editor.editing) {
			editor.cancelEdit();
		}
	}

	if (isLoading) {
		return (
			<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
				<div className="animate-pulse space-y-4">
					<div className="h-6 bg-cream-200 dark:bg-night-700 rounded w-1/3" />
					<div className="h-4 bg-cream-200 dark:bg-night-700 rounded w-2/3" />
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<AgentGrid
				agents={statuses ?? []}
				selectedAgent={selectedAgent}
				onSelectAgent={handleSelectAgent}
			/>

			{selectedAgent && (
				<AgentConfigPanel
					selectedAgent={selectedAgent}
					displayName={
						statuses?.find((a) => a.type === selectedAgent)?.displayName ?? selectedAgent
					}
					config={config}
					configLoading={configLoading}
					editing={editor.editing}
					formData={editor.formData}
					isPending={editor.isPending}
					onStartEdit={editor.startEdit}
					onCancel={editor.cancelEdit}
					onSave={editor.saveEdit}
					onFormChange={editor.updateFormData}
				/>
			)}
		</div>
	);
}

interface AgentGridProps {
	agents: AgentStatus[];
	selectedAgent: string | null;
	onSelectAgent: (agentType: string) => void;
}

function AgentGrid({ agents, selectedAgent, onSelectAgent }: AgentGridProps) {
	return (
		<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
			{agents.map((agent) => (
				<AgentCard
					key={agent.type}
					agent={agent}
					isSelected={selectedAgent === agent.type}
					onSelect={() => onSelectAgent(agent.type)}
				/>
			))}
		</div>
	);
}

interface AgentCardProps {
	agent: AgentStatus;
	isSelected: boolean;
	onSelect: () => void;
}

function AgentCard({ agent, isSelected, onSelect }: AgentCardProps) {
	function getStatusIndicatorClass(): string {
		if (agent.status === "processing") {
			return "bg-blue-500 animate-pulse";
		}
		if (agent.status === "error") {
			return "bg-red-500";
		}
		return "bg-emerald-500";
	}

	return (
		<button
			type="button"
			onClick={onSelect}
			className={`p-4 rounded-lg border text-left transition-all ${
				isSelected
					? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-500"
					: "border-cream-200 dark:border-night-700 bg-white dark:bg-night-800 hover:border-cream-300 dark:hover:border-night-600"
			}`}
		>
			<div className="flex items-center gap-2 mb-2">
				<span className={`w-2 h-2 rounded-full ${getStatusIndicatorClass()}`} />
				<span className="text-sm font-medium text-stone-900 dark:text-night-50 truncate">
					{agent.displayName}
				</span>
			</div>
			<div className="text-xs text-stone-500 dark:text-night-300">
				{agent.outputsToday} outputs today
			</div>
		</button>
	);
}

interface AgentConfigPanelProps {
	selectedAgent: string;
	displayName: string;
	config: AgentConfig | undefined;
	configLoading: boolean;
	editing: boolean;
	formData: Partial<AgentConfig>;
	isPending: boolean;
	onStartEdit: () => void;
	onCancel: () => void;
	onSave: () => void;
	onFormChange: (data: Partial<AgentConfig>) => void;
}

function AgentConfigPanel({
	displayName,
	config,
	configLoading,
	editing,
	formData,
	isPending,
	onStartEdit,
	onCancel,
	onSave,
	onFormChange,
}: AgentConfigPanelProps) {
	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
			<AgentConfigHeader
				displayName={displayName}
				configLoading={configLoading}
				editing={editing}
				isPending={isPending}
				onStartEdit={onStartEdit}
				onCancel={onCancel}
				onSave={onSave}
			/>

			{configLoading ? (
				<div className="animate-pulse space-y-4">
					<div className="h-4 bg-cream-200 dark:bg-night-700 rounded w-1/4" />
					<div className="h-10 bg-cream-200 dark:bg-night-700 rounded" />
				</div>
			) : config ? (
				<AgentConfigForm
					config={config}
					editing={editing}
					formData={formData}
					onFormChange={onFormChange}
				/>
			) : (
				<p className="text-stone-500 dark:text-night-300">No configuration found</p>
			)}
		</div>
	);
}

interface AgentConfigHeaderProps {
	displayName: string;
	configLoading: boolean;
	editing: boolean;
	isPending: boolean;
	onStartEdit: () => void;
	onCancel: () => void;
	onSave: () => void;
}

function AgentConfigHeader({
	displayName,
	configLoading,
	editing,
	isPending,
	onStartEdit,
	onCancel,
	onSave,
}: AgentConfigHeaderProps) {
	return (
		<div className="flex items-center justify-between mb-6">
			<h3 className="text-lg font-medium text-stone-900 dark:text-night-50">
				{displayName} Configuration
			</h3>
			{editing ? (
				<div className="flex gap-2">
					<button
						type="button"
						onClick={onCancel}
						className="px-4 py-2 text-sm font-medium text-stone-700 dark:text-night-100 bg-cream-100 dark:bg-night-700 rounded-md hover:bg-cream-200 dark:hover:bg-night-600"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={onSave}
						disabled={isPending}
						className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
					>
						{isPending ? "Saving..." : "Save"}
					</button>
				</div>
			) : (
				<button
					type="button"
					onClick={onStartEdit}
					disabled={configLoading}
					className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
				>
					Edit
				</button>
			)}
		</div>
	);
}

interface AgentConfigFormProps {
	config: AgentConfig;
	editing: boolean;
	formData: Partial<AgentConfig>;
	onFormChange: (data: Partial<AgentConfig>) => void;
}

function AgentConfigForm({ config, editing, formData, onFormChange }: AgentConfigFormProps) {
	return (
		<div className="space-y-4">
			<div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-200 dark:border-blue-800">
				<p className="text-sm text-blue-700 dark:text-blue-300">
					All agents use the global LLM model configured in{" "}
					<a href="/config/edit" className="underline hover:text-blue-900 dark:hover:text-blue-100">
						Trading Settings
					</a>
				</p>
			</div>

			<div>
				<label
					htmlFor="agent-enabled-checkbox"
					className="block text-sm font-medium text-stone-700 dark:text-night-100 mb-1"
				>
					Enabled
				</label>
				{editing ? (
					<label className="flex items-center gap-2">
						<input
							id="agent-enabled-checkbox"
							type="checkbox"
							checked={formData.enabled ?? config.enabled}
							onChange={(e) => onFormChange({ enabled: e.target.checked })}
							className="w-4 h-4 text-blue-600 bg-white dark:bg-night-700 border-cream-300 dark:border-night-600 rounded focus:ring-blue-500"
						/>
						<span className="text-sm text-stone-700 dark:text-night-100">Agent is active</span>
					</label>
				) : (
					<div className="px-3 py-2 text-stone-900 dark:text-night-50">
						{config.enabled ? "Yes" : "No"}
					</div>
				)}
			</div>

			<div>
				<label
					htmlFor="agent-system-prompt"
					className="block text-sm font-medium text-stone-700 dark:text-night-100 mb-1"
				>
					System Prompt
				</label>
				{editing ? (
					<textarea
						id="agent-system-prompt"
						value={formData.systemPrompt || ""}
						onChange={(e) => onFormChange({ systemPrompt: e.target.value })}
						rows={4}
						className="w-full px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-stone-900 dark:text-night-50 font-mono text-sm"
					/>
				) : (
					<div className="px-3 py-2 text-stone-900 dark:text-night-50 text-sm bg-cream-50 dark:bg-night-900 rounded-md whitespace-pre-wrap max-h-32 overflow-y-auto">
						{config.systemPrompt}
					</div>
				)}
			</div>
		</div>
	);
}
