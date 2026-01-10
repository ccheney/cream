"use client";

/**
 * Config Edit Page
 *
 * Edit draft configuration with visual diff against active config.
 * Changes don't affect the running system until promoted.
 */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ConfigDiff } from "@/components/config/ConfigDiff";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useActiveConfig, useDraftConfig, useSaveDraft, useValidateDraft } from "@/hooks/queries";
import type {
  FullRuntimeConfig,
  RuntimeAgentConfig,
  RuntimeAgentType,
  RuntimeTradingConfig,
  RuntimeUniverseConfig,
  SaveDraftInput,
} from "@/lib/api/types";

// Helper icon for tooltips
function InfoIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 7v4M8 5.5v-.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// Label with tooltip helper
function LabelWithTooltip({
  htmlFor,
  label,
  tooltip,
}: {
  htmlFor: string;
  label: string;
  tooltip: string;
}) {
  return (
    <div className="flex items-center gap-1.5 mb-1">
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-cream-700 dark:text-cream-300"
      >
        {label}
      </label>
      <Tooltip>
        <TooltipTrigger>
          <InfoIcon className="w-3.5 h-3.5 text-cream-400 dark:text-cream-500 cursor-help" />
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </div>
  );
}

// ============================================
// Main Page Component
// ============================================

export default function ConfigEditPage() {
  const router = useRouter();
  const { data: draftConfig, isLoading: draftLoading } = useDraftConfig();
  const { data: activeConfig, isLoading: activeLoading } = useActiveConfig();
  const saveDraft = useSaveDraft();
  const validateDraft = useValidateDraft();

  const [activeTab, setActiveTab] = useState<"trading" | "agents" | "universe">("trading");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    errors: { field: string; message: string }[];
    warnings: string[];
  } | null>(null);

  const handleSave = useCallback(
    async (updates: SaveDraftInput) => {
      await saveDraft.mutateAsync(updates);
      setHasUnsavedChanges(false);
    },
    [saveDraft]
  );

  const handleValidate = useCallback(async () => {
    const result = await validateDraft.mutateAsync();
    setValidationResult(result);
    return result;
  }, [validateDraft]);

  const isLoading = draftLoading || activeLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-12 bg-cream-100 dark:bg-night-700 rounded-lg animate-pulse" />
        <div className="h-96 bg-cream-100 dark:bg-night-700 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!draftConfig) {
    return (
      <div className="text-center py-12">
        <p className="text-cream-500 dark:text-cream-400">
          No draft configuration found. Please ensure the system is properly initialized.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="p-2 text-cream-500 hover:text-cream-700 dark:text-cream-400 dark:hover:text-cream-200"
            aria-label="Go back"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-semibold text-cream-900 dark:text-cream-100">
              Edit Configuration
            </h1>
            <p className="text-sm text-cream-500 dark:text-cream-400">
              Changes don't affect the running system until promoted
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {hasUnsavedChanges && (
            <span className="text-sm text-amber-600 dark:text-amber-400">Unsaved changes</span>
          )}
          <span className="px-3 py-1 text-sm font-medium rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
            Draft
          </span>
          <button
            type="button"
            onClick={handleValidate}
            disabled={validateDraft.isPending}
            className="px-4 py-2 text-sm font-medium text-cream-700 dark:text-cream-200 bg-cream-100 dark:bg-night-700 rounded-md hover:bg-cream-200 dark:hover:bg-night-600 disabled:opacity-50"
          >
            {validateDraft.isPending ? "Validating..." : "Validate"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/config/promote")}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            Promote &rarr;
          </button>
        </div>
      </div>

      {/* Validation Result */}
      {validationResult && (
        <div
          className={`p-4 rounded-lg border ${
            validationResult.valid
              ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800"
              : "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800"
          }`}
        >
          <div className="flex items-center gap-2">
            {validationResult.valid ? (
              <>
                <svg
                  className="w-5 h-5 text-emerald-600"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="font-medium text-emerald-800 dark:text-emerald-300">
                  Valid - Ready to promote
                </span>
              </>
            ) : (
              <>
                <svg
                  className="w-5 h-5 text-red-600"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="font-medium text-red-800 dark:text-red-300">
                  {validationResult.errors.length} error(s) found
                </span>
              </>
            )}
          </div>
          {validationResult.errors.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-red-700 dark:text-red-400">
              {validationResult.errors.map((err) => (
                <li key={`${err.field}-${err.message}`}>
                  <strong>{err.field}:</strong> {err.message}
                </li>
              ))}
            </ul>
          )}
          {validationResult.warnings.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-amber-700 dark:text-amber-400">
              {validationResult.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-cream-200 dark:border-night-700">
        <nav className="flex gap-4" aria-label="Config sections">
          {(["trading", "agents", "universe"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-cream-500 hover:text-cream-700 dark:text-cream-400 dark:hover:text-cream-200"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
      </div>

      {/* Editor Panel */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
        {activeTab === "trading" && (
          <TradingConfigForm
            config={draftConfig.trading}
            onSave={(updates) => {
              handleSave({ trading: updates });
              setHasUnsavedChanges(false);
            }}
            onChange={() => setHasUnsavedChanges(true)}
            isSaving={saveDraft.isPending}
          />
        )}
        {activeTab === "agents" && (
          <AgentConfigList
            agents={draftConfig.agents}
            onSave={(agentType, updates) => {
              handleSave({ agents: { [agentType]: updates } });
              setHasUnsavedChanges(false);
            }}
            onChange={() => setHasUnsavedChanges(true)}
            isSaving={saveDraft.isPending}
          />
        )}
        {activeTab === "universe" && (
          <UniverseConfigForm
            config={draftConfig.universe}
            onSave={(updates) => {
              handleSave({ universe: updates });
              setHasUnsavedChanges(false);
            }}
            onChange={() => setHasUnsavedChanges(true)}
            isSaving={saveDraft.isPending}
          />
        )}
      </div>

      {/* Diff Panel - Full Width */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
        <h3 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-4">
          Changes from Active
        </h3>
        {activeConfig ? (
          <ConfigDiff before={activeConfig as unknown as FullRuntimeConfig} after={draftConfig} />
        ) : (
          <p className="text-cream-500 dark:text-cream-400">
            No active configuration to compare against
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================
// Trading Config Form
// ============================================

interface TradingConfigFormProps {
  config: RuntimeTradingConfig;
  onSave: (updates: Partial<RuntimeTradingConfig>) => void;
  onChange: () => void;
  isSaving: boolean;
}

function TradingConfigForm({ config, onSave, onChange, isSaving }: TradingConfigFormProps) {
  const [formData, setFormData] = useState<Partial<RuntimeTradingConfig>>({});

  const handleChange = (field: keyof RuntimeTradingConfig, value: number | string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    onChange();
  };

  const handleSave = () => {
    if (Object.keys(formData).length > 0) {
      onSave(formData);
      setFormData({});
    }
  };

  const getValue = (field: keyof RuntimeTradingConfig): number => {
    return (formData[field] as number) ?? (config[field] as number);
  };

  const getGlobalModel = (): string => {
    return (formData.globalModel as string) ?? config.globalModel ?? "gemini-3-flash-preview";
  };

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

      {/* Global LLM Model Selection */}
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
          value={getGlobalModel()}
          onChange={(e) => handleChange("globalModel", e.target.value)}
          className="w-full max-w-md px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-cream-900 dark:text-cream-100"
        >
          <option value="gemini-3-flash-preview">Gemini 3 Flash (faster)</option>
          <option value="gemini-3-pro-preview">Gemini 3 Pro (more capable)</option>
        </select>
        <p className="mt-2 text-xs text-cream-500 dark:text-cream-400">
          All 8 trading agents will use this model. Claude Code indicators use a separate fixed
          model.
        </p>
      </div>

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

// ============================================
// Agent Config List
// ============================================

interface AgentConfigListProps {
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

function AgentConfigList({ agents, onSave, onChange, isSaving }: AgentConfigListProps) {
  const [expandedAgent, setExpandedAgent] = useState<RuntimeAgentType | null>(null);
  const [formData, setFormData] = useState<Record<string, Partial<RuntimeAgentConfig>>>({});

  const handleChange = (
    agentType: RuntimeAgentType,
    field: keyof RuntimeAgentConfig,
    value: unknown
  ) => {
    setFormData((prev) => ({
      ...prev,
      [agentType]: { ...(prev[agentType] || {}), [field]: value },
    }));
    onChange();
  };

  const handleSave = (agentType: RuntimeAgentType) => {
    if (formData[agentType] && Object.keys(formData[agentType]).length > 0) {
      onSave(agentType, formData[agentType]);
      setFormData((prev) => {
        const updated = { ...prev };
        delete updated[agentType];
        return updated;
      });
    }
  };

  const agentTypes = Object.keys(agents) as RuntimeAgentType[];

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium text-cream-900 dark:text-cream-100">
        Agent Configuration
      </h3>

      <div className="space-y-2">
        {agentTypes.map((agentType) => {
          const agent = agents[agentType];
          const isExpanded = expandedAgent === agentType;
          const hasChanges = formData[agentType] && Object.keys(formData[agentType]).length > 0;

          return (
            <div
              key={agentType}
              className="border border-cream-200 dark:border-night-700 rounded-lg overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setExpandedAgent(isExpanded ? null : agentType)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-cream-50 dark:hover:bg-night-700"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      agent.enabled ? "bg-emerald-500" : "bg-cream-300"
                    }`}
                  />
                  <span className="font-medium text-cream-900 dark:text-cream-100">
                    {AGENT_DISPLAY_NAMES[agentType]}
                  </span>
                  {hasChanges && (
                    <span className="text-xs text-amber-600 dark:text-amber-400">Modified</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <svg
                    className={`w-5 h-5 text-cream-400 transition-transform ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
              </button>

              {isExpanded && (
                <div className="p-4 border-t border-cream-200 dark:border-night-700 bg-cream-50 dark:bg-night-900">
                  <div className="flex items-center gap-1.5 mb-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(formData[agentType]?.enabled as boolean) ?? agent.enabled}
                        onChange={(e) => handleChange(agentType, "enabled", e.target.checked)}
                        className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-cream-700 dark:text-cream-300">
                        Enabled
                      </span>
                    </label>
                    <Tooltip>
                      <TooltipTrigger>
                        <InfoIcon className="w-3.5 h-3.5 text-cream-400 dark:text-cream-500 cursor-help" />
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
                      value={
                        (formData[agentType]?.systemPromptOverride as string) ??
                        agent.systemPromptOverride ??
                        ""
                      }
                      onChange={(e) =>
                        handleChange(agentType, "systemPromptOverride", e.target.value || null)
                      }
                      placeholder="Leave empty to use default prompt"
                      className="w-full px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-cream-900 dark:text-cream-100"
                    />
                  </div>

                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleSave(agentType)}
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
        })}
      </div>
    </div>
  );
}

// ============================================
// Universe Config Form
// ============================================

interface UniverseConfigFormProps {
  config: RuntimeUniverseConfig;
  onSave: (updates: Partial<RuntimeUniverseConfig>) => void;
  onChange: () => void;
  isSaving: boolean;
}

function UniverseConfigForm({ config, onSave, onChange, isSaving }: UniverseConfigFormProps) {
  const [formData, setFormData] = useState<Partial<RuntimeUniverseConfig>>({});

  // Track raw text for array textareas to allow typing commas
  const [rawText, setRawText] = useState({
    staticSymbols: (config.staticSymbols || []).join(", "),
    includeList: config.includeList.join(", "),
    excludeList: config.excludeList.join(", "),
  });

  // Fix existing configs with source="index" but no indexSource
  useEffect(() => {
    if (config.source === "index" && !config.indexSource) {
      setFormData((prev) => ({ ...prev, indexSource: "SPY" }));
      onChange();
    }
  }, [config.source, config.indexSource, onChange]);

  const handleChange = <K extends keyof RuntimeUniverseConfig>(
    field: K,
    value: RuntimeUniverseConfig[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    onChange();
  };

  const handleSave = () => {
    if (Object.keys(formData).length > 0) {
      onSave(formData);
      setFormData({});
    }
  };

  const getValue = <K extends keyof RuntimeUniverseConfig>(field: K): RuntimeUniverseConfig[K] => {
    return (formData[field] as RuntimeUniverseConfig[K]) ?? config[field];
  };

  // Parse comma-separated text into array of uppercase symbols
  const parseSymbolList = (text: string): string[] =>
    text
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

  // Handle blur for array textareas - commit parsed value to formData
  const handleArrayTextBlur = (field: "staticSymbols" | "includeList" | "excludeList") => {
    const parsed = parseSymbolList(rawText[field]);
    handleChange(field, field === "staticSymbols" ? (parsed.length > 0 ? parsed : null) : parsed);
  };

  // Handle source type change with defaults
  const handleSourceChange = (source: "static" | "index" | "screener") => {
    handleChange("source", source);
    // Set default indexSource when switching to index if not already set
    if (source === "index" && !getValue("indexSource")) {
      handleChange("indexSource", "SPY");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-cream-900 dark:text-cream-100">
          Universe Settings
        </h3>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || Object.keys(formData).length === 0}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {isSaving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      <div className="space-y-4">
        {/* Source Type */}
        <fieldset>
          <div className="flex items-center gap-1.5 mb-2">
            <legend className="block text-sm font-medium text-cream-700 dark:text-cream-300">
              Universe Source
            </legend>
            <Tooltip>
              <TooltipTrigger>
                <InfoIcon className="w-3.5 h-3.5 text-cream-400 dark:text-cream-500 cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                How symbols are selected for trading: Static (manual list), Index (ETF
                constituents), or Screener (filtered by criteria)
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex gap-4">
            {(["static", "index", "screener"] as const).map((source) => (
              <label key={source} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="source"
                  value={source}
                  checked={getValue("source") === source}
                  onChange={() => handleSourceChange(source)}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm text-cream-700 dark:text-cream-300 capitalize">
                  {source}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Static Symbols */}
        {getValue("source") === "static" && (
          <div>
            <LabelWithTooltip
              htmlFor="static-symbols"
              label="Static Symbols"
              tooltip="Comma-separated list of stock tickers to include in the trading universe"
            />
            <textarea
              id="static-symbols"
              rows={3}
              value={rawText.staticSymbols}
              onChange={(e) => {
                setRawText((prev) => ({ ...prev, staticSymbols: e.target.value.toUpperCase() }));
                onChange();
              }}
              onBlur={() => handleArrayTextBlur("staticSymbols")}
              placeholder="AAPL, MSFT, GOOGL, ..."
              className="w-full px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-cream-900 dark:text-cream-100"
            />
          </div>
        )}

        {/* Index Source */}
        {getValue("source") === "index" && (
          <div>
            <LabelWithTooltip
              htmlFor="index-source"
              label="Index Source"
              tooltip="ETF whose constituents will be used as the trading universe"
            />
            <select
              id="index-source"
              value={getValue("indexSource") || "SPY"}
              onChange={(e) => handleChange("indexSource", e.target.value)}
              className="w-full px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-cream-900 dark:text-cream-100"
            >
              <option value="SPY">S&P 500 (SPY)</option>
              <option value="QQQ">Nasdaq 100 (QQQ)</option>
              <option value="IWM">Russell 2000 (IWM)</option>
              <option value="DIA">Dow Jones (DIA)</option>
            </select>
          </div>
        )}

        {/* Filters */}
        <div className="grid grid-cols-2 gap-4">
          <FormField
            label="Min Volume"
            tooltip="Minimum average daily trading volume. Filters out illiquid stocks."
            value={getValue("minVolume") || 0}
            onChange={(v) => handleChange("minVolume", v || null)}
          />
          <FormField
            label="Min Market Cap"
            tooltip="Minimum market capitalization in dollars. Filters out small-cap stocks."
            value={getValue("minMarketCap") || 0}
            onChange={(v) => handleChange("minMarketCap", v || null)}
          />
        </div>

        <div className="flex items-center gap-1.5">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={getValue("optionableOnly")}
              onChange={(e) => handleChange("optionableOnly", e.target.checked)}
              className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-cream-700 dark:text-cream-300">
              Optionable Symbols Only
            </span>
          </label>
          <Tooltip>
            <TooltipTrigger>
              <InfoIcon className="w-3.5 h-3.5 text-cream-400 dark:text-cream-500 cursor-help" />
            </TooltipTrigger>
            <TooltipContent>
              Only include stocks that have listed options contracts available for trading
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Include/Exclude Lists */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <LabelWithTooltip
              htmlFor="include-list"
              label="Always Include"
              tooltip="Symbols always added to universe regardless of filters or source"
            />
            <textarea
              id="include-list"
              rows={2}
              value={rawText.includeList}
              onChange={(e) => {
                setRawText((prev) => ({ ...prev, includeList: e.target.value.toUpperCase() }));
                onChange();
              }}
              onBlur={() => handleArrayTextBlur("includeList")}
              placeholder="AAPL, MSFT, ..."
              className="w-full px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-cream-900 dark:text-cream-100"
            />
          </div>
          <div>
            <LabelWithTooltip
              htmlFor="exclude-list"
              label="Always Exclude"
              tooltip="Symbols always removed from universe regardless of source"
            />
            <textarea
              id="exclude-list"
              rows={2}
              value={rawText.excludeList}
              onChange={(e) => {
                setRawText((prev) => ({ ...prev, excludeList: e.target.value.toUpperCase() }));
                onChange();
              }}
              onBlur={() => handleArrayTextBlur("excludeList")}
              placeholder="GME, AMC, ..."
              className="w-full px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-cream-900 dark:text-cream-100"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Form Field Component
// ============================================

interface FormFieldProps {
  label: string;
  hint?: string;
  tooltip?: string;
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  id?: string;
}

function FormField({
  label,
  hint,
  tooltip,
  value,
  onChange,
  suffix,
  min,
  max,
  step = 1,
  id,
}: FormFieldProps) {
  // Generate a stable ID from the label if not provided
  const inputId = id ?? `field-${label.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-cream-700 dark:text-cream-300"
        >
          {label}
          {hint && <span className="ml-1 text-cream-400 font-normal">({hint})</span>}
        </label>
        {tooltip && (
          <Tooltip>
            <TooltipTrigger>
              <InfoIcon className="w-3.5 h-3.5 text-cream-400 dark:text-cream-500 cursor-help" />
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="relative">
        <input
          id={inputId}
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          min={min}
          max={max}
          step={step}
          className="w-full px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-cream-900 dark:text-cream-100"
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-cream-400">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================
// Duration Field Component (user-friendly time input)
// ============================================

type TimeUnit = "seconds" | "minutes" | "hours";

interface DurationFieldProps {
  label: string;
  hint?: string;
  tooltip?: string;
  /** Value in milliseconds */
  value: number;
  /** Callback with value in milliseconds */
  onChange: (valueMs: number) => void;
  /** Minimum value in milliseconds */
  minMs?: number;
  /** Maximum value in milliseconds */
  maxMs?: number;
  id?: string;
}

const TIME_UNIT_MS: Record<TimeUnit, number> = {
  seconds: 1000,
  minutes: 60 * 1000,
  hours: 60 * 60 * 1000,
};

/**
 * Determine the best display unit for a millisecond value
 */
function getBestUnit(ms: number): TimeUnit {
  if (ms >= TIME_UNIT_MS.hours && ms % TIME_UNIT_MS.hours === 0) {
    return "hours";
  }
  if (ms >= TIME_UNIT_MS.minutes && ms % TIME_UNIT_MS.minutes === 0) {
    return "minutes";
  }
  return "seconds";
}

function DurationField({
  label,
  hint,
  tooltip,
  value,
  onChange,
  minMs = 0,
  maxMs,
  id,
}: DurationFieldProps) {
  const inputId = id ?? `field-${label.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;

  // Track the selected unit (default based on value)
  const [unit, setUnit] = useState<TimeUnit>(() => getBestUnit(value));

  // Convert ms to display value
  const displayValue = value / TIME_UNIT_MS[unit];

  const handleValueChange = (newDisplayValue: number) => {
    const newMs = Math.round(newDisplayValue * TIME_UNIT_MS[unit]);
    onChange(newMs);
  };

  const handleUnitChange = (newUnit: TimeUnit) => {
    setUnit(newUnit);
    // Value in ms stays the same, just the display changes
  };

  // Calculate min/max in current unit
  const minDisplay = minMs / TIME_UNIT_MS[unit];
  const maxDisplay = maxMs ? maxMs / TIME_UNIT_MS[unit] : undefined;

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-cream-700 dark:text-cream-300"
        >
          {label}
          {hint && <span className="ml-1 text-cream-400 font-normal">({hint})</span>}
        </label>
        {tooltip && (
          <Tooltip>
            <TooltipTrigger>
              <InfoIcon className="w-3.5 h-3.5 text-cream-400 dark:text-cream-500 cursor-help" />
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="flex gap-2">
        <input
          id={inputId}
          type="number"
          value={displayValue}
          onChange={(e) => handleValueChange(parseFloat(e.target.value) || 0)}
          min={minDisplay}
          max={maxDisplay}
          step={unit === "hours" ? 0.5 : 1}
          className="flex-1 px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-cream-900 dark:text-cream-100"
        />
        <select
          value={unit}
          onChange={(e) => handleUnitChange(e.target.value as TimeUnit)}
          className="px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-cream-900 dark:text-cream-100"
          aria-label="Time unit"
        >
          <option value="seconds">seconds</option>
          <option value="minutes">minutes</option>
          <option value="hours">hours</option>
        </select>
      </div>
    </div>
  );
}
