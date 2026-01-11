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
    return (formData.globalModel as string) ?? config.globalModel ?? "gemini-3-flash-preview";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-cream-900 dark:text-cream-100">Trading Settings</h3>
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
        onChange={(v) => handleChange("globalModel", v)}
      />

      <div className="grid grid-cols-2 gap-4">
        <DurationField
          label="Trading Cycle Interval"
          hint="Time between cycles"
          tooltip="How often the OODA loop runs to evaluate positions and make decisions"
          value={getValue("tradingCycleIntervalMs")}
          onChange={(v) => handleChange("tradingCycleIntervalMs", v)}
          minMs={60000}
          maxMs={86400000}
        />
        <DurationField
          label="Prediction Markets Interval"
          tooltip="How often prediction market data (Kalshi, Polymarket) is refreshed"
          value={getValue("predictionMarketsIntervalMs")}
          onChange={(v) => handleChange("predictionMarketsIntervalMs", v)}
          minMs={60000}
        />
        <DurationField
          label="Agent Timeout"
          tooltip="Maximum time allowed for a single agent to complete its analysis"
          value={getValue("agentTimeoutMs")}
          onChange={(v) => handleChange("agentTimeoutMs", v)}
          minMs={5000}
        />
        <DurationField
          label="Total Consensus Timeout"
          tooltip="Maximum time for all agents to reach a trading consensus"
          value={getValue("totalConsensusTimeoutMs")}
          onChange={(v) => handleChange("totalConsensusTimeoutMs", v)}
          minMs={10000}
        />
        <FormField
          label="Max Consensus Iterations"
          tooltip="Maximum discussion rounds agents can have before forcing a decision"
          value={getValue("maxConsensusIterations")}
          onChange={(v) => handleChange("maxConsensusIterations", v)}
          min={1}
          max={10}
        />
        <FormField
          label="Conviction Delta (Hold)"
          hint="Threshold to maintain position"
          tooltip="Minimum conviction score difference to keep an existing position open"
          value={getValue("convictionDeltaHold")}
          onChange={(v) => handleChange("convictionDeltaHold", v)}
          step={0.01}
          min={0}
          max={1}
        />
        <FormField
          label="Conviction Delta (Action)"
          hint="Threshold to take action"
          tooltip="Minimum conviction score to open a new position or close an existing one"
          value={getValue("convictionDeltaAction")}
          onChange={(v) => handleChange("convictionDeltaAction", v)}
          step={0.01}
          min={0}
          max={1}
        />
        <FormField
          label="High Conviction %"
          tooltip="Portfolio allocation percentage for high-confidence trades"
          value={getValue("highConvictionPct")}
          onChange={(v) => handleChange("highConvictionPct", v)}
          step={0.01}
          min={0}
          max={1}
        />
        <FormField
          label="Medium Conviction %"
          tooltip="Portfolio allocation percentage for medium-confidence trades"
          value={getValue("mediumConvictionPct")}
          onChange={(v) => handleChange("mediumConvictionPct", v)}
          step={0.01}
          min={0}
          max={1}
        />
        <FormField
          label="Low Conviction %"
          tooltip="Portfolio allocation percentage for low-confidence trades"
          value={getValue("lowConvictionPct")}
          onChange={(v) => handleChange("lowConvictionPct", v)}
          step={0.01}
          min={0}
          max={1}
        />
        <FormField
          label="Min Risk/Reward Ratio"
          tooltip="Minimum potential profit vs potential loss required to enter a trade"
          value={getValue("minRiskRewardRatio")}
          onChange={(v) => handleChange("minRiskRewardRatio", v)}
          step={0.1}
          min={0.5}
          max={10}
        />
        <FormField
          label="Kelly Fraction"
          hint="Position sizing multiplier"
          tooltip="Fraction of Kelly criterion used for position sizing (1.0 = full Kelly, 0.5 = half Kelly)"
          value={getValue("kellyFraction")}
          onChange={(v) => handleChange("kellyFraction", v)}
          step={0.01}
          min={0}
          max={1}
        />
      </div>
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
          className="block text-sm font-medium text-cream-700 dark:text-cream-300"
        >
          Global LLM Model
          <span className="ml-2 text-cream-400 font-normal">(used by all agents)</span>
        </label>
        <Tooltip>
          <TooltipTrigger>
            <InfoIcon className="w-3.5 h-3.5 text-cream-400 dark:text-cream-500 cursor-help" />
          </TooltipTrigger>
          <TooltipContent>
            The AI model powering all trading agents' reasoning and decision-making
          </TooltipContent>
        </Tooltip>
      </div>
      <select
        id="global-model"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full max-w-md px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-cream-900 dark:text-cream-100"
      >
        <option value="gemini-3-flash-preview">Gemini 3 Flash (faster)</option>
        <option value="gemini-3-pro-preview">Gemini 3 Pro (more capable)</option>
      </select>
      <p className="mt-2 text-xs text-cream-500 dark:text-cream-400">
        All 8 trading agents will use this model. Claude Code indicators use a separate fixed model.
      </p>
    </div>
  );
}
