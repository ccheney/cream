"use client";

import { useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { RuntimeTradingConfig } from "@/lib/api/types";
import { DurationField, FormField } from "./FormFields";
import { InfoIcon } from "./helpers";

export interface TradingConfigFormProps {
	config: RuntimeTradingConfig;
	onSave: (updates: Partial<RuntimeTradingConfig>) => void;
	onChange: () => void;
	isSaving: boolean;
}

interface DurationFieldConfig {
	key:
		| "tradingCycleIntervalMs"
		| "predictionMarketsIntervalMs"
		| "agentTimeoutMs"
		| "totalConsensusTimeoutMs";
	label: string;
	hint?: string;
	tooltip: string;
	minMs: number;
	maxMs?: number;
}

const DURATION_FIELD_CONFIGS: DurationFieldConfig[] = [
	{
		key: "tradingCycleIntervalMs",
		label: "Trading Cycle Interval",
		hint: "Time between cycles",
		tooltip: "How often the OODA loop runs to evaluate positions and make decisions",
		minMs: 60000,
		maxMs: 86400000,
	},
	{
		key: "predictionMarketsIntervalMs",
		label: "Prediction Markets Interval",
		tooltip: "How often prediction market data (Kalshi, Polymarket) is refreshed",
		minMs: 60000,
	},
	{
		key: "agentTimeoutMs",
		label: "Agent Timeout",
		tooltip: "Maximum time allowed for a single agent to complete its analysis",
		minMs: 5000,
	},
	{
		key: "totalConsensusTimeoutMs",
		label: "Total Consensus Timeout",
		tooltip: "Maximum time for all agents to reach a trading consensus",
		minMs: 10000,
	},
];

interface NumericFieldConfig {
	key:
		| "maxConsensusIterations"
		| "convictionDeltaHold"
		| "convictionDeltaAction"
		| "highConvictionPct"
		| "mediumConvictionPct"
		| "lowConvictionPct"
		| "minRiskRewardRatio"
		| "kellyFraction";
	label: string;
	hint?: string;
	tooltip: string;
	step?: number;
	min?: number;
	max?: number;
}

const NUMERIC_FIELD_CONFIGS: NumericFieldConfig[] = [
	{
		key: "maxConsensusIterations",
		label: "Max Consensus Iterations",
		tooltip: "Maximum discussion rounds agents can have before forcing a decision",
		min: 1,
		max: 10,
	},
	{
		key: "convictionDeltaHold",
		label: "Conviction Delta (Hold)",
		hint: "Threshold to maintain position",
		tooltip: "Minimum conviction score difference to keep an existing position open",
		step: 0.01,
		min: 0,
		max: 1,
	},
	{
		key: "convictionDeltaAction",
		label: "Conviction Delta (Action)",
		hint: "Threshold to take action",
		tooltip: "Minimum conviction score to open a new position or close an existing one",
		step: 0.01,
		min: 0,
		max: 1,
	},
	{
		key: "highConvictionPct",
		label: "High Conviction %",
		tooltip: "Portfolio allocation percentage for high-confidence trades",
		step: 0.01,
		min: 0,
		max: 1,
	},
	{
		key: "mediumConvictionPct",
		label: "Medium Conviction %",
		tooltip: "Portfolio allocation percentage for medium-confidence trades",
		step: 0.01,
		min: 0,
		max: 1,
	},
	{
		key: "lowConvictionPct",
		label: "Low Conviction %",
		tooltip: "Portfolio allocation percentage for low-confidence trades",
		step: 0.01,
		min: 0,
		max: 1,
	},
	{
		key: "minRiskRewardRatio",
		label: "Min Risk/Reward Ratio",
		tooltip: "Minimum potential profit vs potential loss required to enter a trade",
		step: 0.1,
		min: 0.5,
		max: 10,
	},
	{
		key: "kellyFraction",
		label: "Kelly Fraction",
		hint: "Position sizing multiplier",
		tooltip:
			"Fraction of Kelly criterion used for position sizing (1.0 = full Kelly, 0.5 = half Kelly)",
		step: 0.01,
		min: 0,
		max: 1,
	},
];

interface TradingFieldsGridProps {
	getValue: (field: keyof RuntimeTradingConfig) => number;
	onFieldChange: (field: keyof RuntimeTradingConfig, value: number | string) => void;
}

function TradingFieldsGrid({ getValue, onFieldChange }: TradingFieldsGridProps) {
	return (
		<div className="grid grid-cols-2 gap-4">
			{DURATION_FIELD_CONFIGS.map((field) => (
				<DurationField
					key={field.key}
					label={field.label}
					hint={field.hint}
					tooltip={field.tooltip}
					value={getValue(field.key)}
					onChange={(value) => onFieldChange(field.key, value)}
					minMs={field.minMs}
					maxMs={field.maxMs}
				/>
			))}
			{NUMERIC_FIELD_CONFIGS.map((field) => (
				<FormField
					key={field.key}
					label={field.label}
					hint={field.hint}
					tooltip={field.tooltip}
					value={getValue(field.key)}
					onChange={(value) => onFieldChange(field.key, value)}
					step={field.step}
					min={field.min}
					max={field.max}
				/>
			))}
		</div>
	);
}

export function TradingConfigForm({ config, onSave, onChange, isSaving }: TradingConfigFormProps) {
	const [formData, setFormData] = useState<Partial<RuntimeTradingConfig>>({});

	function handleChange(field: keyof RuntimeTradingConfig, value: number | string): void {
		setFormData((prev) => ({ ...prev, [field]: value }));
		onChange();
	}

	function handleSave(): void {
		if (Object.keys(formData).length > 0) {
			onSave(formData);
			setFormData({});
		}
	}

	function getValue(field: keyof RuntimeTradingConfig): number {
		return (formData[field] as number) ?? (config[field] as number);
	}

	function getGlobalModel(): string {
		return (formData.globalModel as string) ?? config.globalModel;
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h3 className="text-lg font-medium text-stone-900 dark:text-night-50">Trading Settings</h3>
				<button
					type="button"
					onClick={handleSave}
					disabled={isSaving || Object.keys(formData).length === 0}
					className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
				>
					{isSaving ? "Saving..." : "Save Changes"}
				</button>
			</div>
			<GlobalModelSelector
				value={getGlobalModel()}
				onChange={(value) => handleChange("globalModel", value)}
			/>
			<TradingFieldsGrid getValue={getValue} onFieldChange={handleChange} />
		</div>
	);
}

interface GlobalModelSelectorProps {
	value: string;
	onChange: (value: string) => void;
}

function GlobalModelSelector({ value, onChange }: GlobalModelSelectorProps) {
	return (
		<div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
			<div className="flex items-center gap-1.5 mb-2">
				<label
					htmlFor="global-model"
					className="block text-sm font-medium text-stone-700 dark:text-night-100"
				>
					Global LLM Model
					<span className="ml-2 text-stone-400 dark:text-night-400 font-normal">
						(used by all agents)
					</span>
				</label>
				<Tooltip>
					<TooltipTrigger>
						<InfoIcon className="w-3.5 h-3.5 text-stone-400 dark:text-night-400 cursor-help" />
					</TooltipTrigger>
					<TooltipContent>
						The AI model powering all trading agents' reasoning and decision-making
					</TooltipContent>
				</Tooltip>
			</div>
			<div className="flex items-center gap-0 max-w-md">
				<span className="px-3 py-2 text-sm text-stone-500 dark:text-night-400 bg-stone-100 dark:bg-night-800 border border-r-0 border-cream-200 dark:border-night-600 rounded-l-md">
					google/
				</span>
				<input
					id="global-model"
					type="text"
					value={value}
					onChange={(e) => onChange(e.target.value)}
					placeholder="gemini-2.5-flash-preview-05-20"
					className="flex-1 px-3 py-2 border border-cream-200 dark:border-night-600 rounded-r-md bg-white dark:bg-night-700 text-stone-900 dark:text-night-50"
				/>
			</div>
			<p className="mt-2 text-xs text-stone-500 dark:text-night-300">
				Model ID for all trading agents. Default is set via LLM_MODEL_ID environment variable.
			</p>
		</div>
	);
}
