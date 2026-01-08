"use client";

/**
 * Config Edit Page
 *
 * Edit draft configuration with visual diff against active config.
 * Changes don't affect the running system until promoted.
 */

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { ConfigDiff } from "@/components/config/ConfigDiff";
import { useActiveConfig, useDraftConfig, useSaveDraft, useValidateDraft } from "@/hooks/queries";
import type {
  FullRuntimeConfig,
  RuntimeAgentConfig,
  RuntimeAgentType,
  RuntimeTradingConfig,
  RuntimeUniverseConfig,
  SaveDraftInput,
} from "@/lib/api/types";

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
                <svg className="w-5 h-5 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
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
                <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
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
              {validationResult.errors.map((err, i) => (
                <li key={i}>
                  <strong>{err.field}:</strong> {err.message}
                </li>
              ))}
            </ul>
          )}
          {validationResult.warnings.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-amber-700 dark:text-amber-400">
              {validationResult.warnings.map((warning, i) => (
                <li key={i}>{warning}</li>
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

      {/* Tab Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

        {/* Diff Panel */}
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

  const handleChange = (field: keyof RuntimeTradingConfig, value: number) => {
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

      <div className="grid grid-cols-2 gap-4">
        <FormField
          label="Trading Cycle Interval"
          hint="Time between trading cycles"
          value={getValue("tradingCycleIntervalMs")}
          onChange={(v) => handleChange("tradingCycleIntervalMs", v)}
          suffix="ms"
          min={60000}
          max={86400000}
        />
        <FormField
          label="Prediction Markets Interval"
          value={getValue("predictionMarketsIntervalMs")}
          onChange={(v) => handleChange("predictionMarketsIntervalMs", v)}
          suffix="ms"
          min={60000}
        />
        <FormField
          label="Agent Timeout"
          value={getValue("agentTimeoutMs")}
          onChange={(v) => handleChange("agentTimeoutMs", v)}
          suffix="ms"
          min={5000}
        />
        <FormField
          label="Total Consensus Timeout"
          value={getValue("totalConsensusTimeoutMs")}
          onChange={(v) => handleChange("totalConsensusTimeoutMs", v)}
          suffix="ms"
          min={10000}
        />
        <FormField
          label="Max Consensus Iterations"
          value={getValue("maxConsensusIterations")}
          onChange={(v) => handleChange("maxConsensusIterations", v)}
          min={1}
          max={10}
        />
        <FormField
          label="Conviction Delta (Hold)"
          hint="Threshold to maintain position"
          value={getValue("convictionDeltaHold")}
          onChange={(v) => handleChange("convictionDeltaHold", v)}
          step={0.01}
          min={0}
          max={1}
        />
        <FormField
          label="Conviction Delta (Action)"
          hint="Threshold to take action"
          value={getValue("convictionDeltaAction")}
          onChange={(v) => handleChange("convictionDeltaAction", v)}
          step={0.01}
          min={0}
          max={1}
        />
        <FormField
          label="High Conviction %"
          value={getValue("highConvictionPct")}
          onChange={(v) => handleChange("highConvictionPct", v)}
          step={0.01}
          min={0}
          max={1}
        />
        <FormField
          label="Medium Conviction %"
          value={getValue("mediumConvictionPct")}
          onChange={(v) => handleChange("mediumConvictionPct", v)}
          step={0.01}
          min={0}
          max={1}
        />
        <FormField
          label="Low Conviction %"
          value={getValue("lowConvictionPct")}
          onChange={(v) => handleChange("lowConvictionPct", v)}
          step={0.01}
          min={0}
          max={1}
        />
        <FormField
          label="Min Risk/Reward Ratio"
          value={getValue("minRiskRewardRatio")}
          onChange={(v) => handleChange("minRiskRewardRatio", v)}
          step={0.1}
          min={0.5}
          max={10}
        />
        <FormField
          label="Kelly Fraction"
          hint="Position sizing multiplier"
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

const MODEL_OPTIONS = [
  { value: "gemini-3.0-pro", label: "Gemini 3.0 Pro" },
  { value: "gemini-3.0-flash", label: "Gemini 3.0 Flash" },
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  { value: "claude-opus-4-20250514", label: "Claude Opus 4" },
];

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
                  <span className="text-sm text-cream-500 dark:text-cream-400">{agent.model}</span>
                  <svg
                    className={`w-5 h-5 text-cream-400 transition-transform ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
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
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-cream-700 dark:text-cream-300 mb-1">
                        Model
                      </label>
                      <select
                        value={(formData[agentType]?.model as string) ?? agent.model}
                        onChange={(e) => handleChange(agentType, "model", e.target.value)}
                        className="w-full px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-cream-900 dark:text-cream-100"
                      >
                        {MODEL_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-cream-700 dark:text-cream-300 mb-1">
                        Temperature
                      </label>
                      <input
                        type="number"
                        step={0.1}
                        min={0}
                        max={2}
                        value={(formData[agentType]?.temperature as number) ?? agent.temperature}
                        onChange={(e) =>
                          handleChange(agentType, "temperature", parseFloat(e.target.value))
                        }
                        className="w-full px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-cream-900 dark:text-cream-100"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-cream-700 dark:text-cream-300 mb-1">
                        Max Tokens
                      </label>
                      <input
                        type="number"
                        min={100}
                        max={32000}
                        value={(formData[agentType]?.maxTokens as number) ?? agent.maxTokens}
                        onChange={(e) =>
                          handleChange(agentType, "maxTokens", parseInt(e.target.value, 10))
                        }
                        className="w-full px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-cream-900 dark:text-cream-100"
                      />
                    </div>
                    <div className="flex items-center">
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
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="block text-sm font-medium text-cream-700 dark:text-cream-300 mb-1">
                      System Prompt Override
                    </label>
                    <textarea
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
        <div>
          <label className="block text-sm font-medium text-cream-700 dark:text-cream-300 mb-2">
            Universe Source
          </label>
          <div className="flex gap-4">
            {(["static", "index", "screener"] as const).map((source) => (
              <label key={source} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="source"
                  value={source}
                  checked={getValue("source") === source}
                  onChange={() => handleChange("source", source)}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm text-cream-700 dark:text-cream-300 capitalize">
                  {source}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Static Symbols */}
        {getValue("source") === "static" && (
          <div>
            <label className="block text-sm font-medium text-cream-700 dark:text-cream-300 mb-1">
              Static Symbols
            </label>
            <textarea
              rows={3}
              value={(getValue("staticSymbols") || []).join(", ")}
              onChange={(e) =>
                handleChange(
                  "staticSymbols",
                  e.target.value
                    .split(",")
                    .map((s) => s.trim().toUpperCase())
                    .filter(Boolean)
                )
              }
              placeholder="AAPL, MSFT, GOOGL, ..."
              className="w-full px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-cream-900 dark:text-cream-100"
            />
          </div>
        )}

        {/* Index Source */}
        {getValue("source") === "index" && (
          <div>
            <label className="block text-sm font-medium text-cream-700 dark:text-cream-300 mb-1">
              Index Source
            </label>
            <select
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
            value={getValue("minVolume") || 0}
            onChange={(v) => handleChange("minVolume", v || null)}
          />
          <FormField
            label="Min Market Cap"
            value={getValue("minMarketCap") || 0}
            onChange={(v) => handleChange("minMarketCap", v || null)}
          />
        </div>

        <div className="flex items-center">
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
        </div>

        {/* Include/Exclude Lists */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-cream-700 dark:text-cream-300 mb-1">
              Always Include
            </label>
            <textarea
              rows={2}
              value={getValue("includeList").join(", ")}
              onChange={(e) =>
                handleChange(
                  "includeList",
                  e.target.value
                    .split(",")
                    .map((s) => s.trim().toUpperCase())
                    .filter(Boolean)
                )
              }
              placeholder="AAPL, MSFT, ..."
              className="w-full px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-cream-900 dark:text-cream-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-cream-700 dark:text-cream-300 mb-1">
              Always Exclude
            </label>
            <textarea
              rows={2}
              value={getValue("excludeList").join(", ")}
              onChange={(e) =>
                handleChange(
                  "excludeList",
                  e.target.value
                    .split(",")
                    .map((s) => s.trim().toUpperCase())
                    .filter(Boolean)
                )
              }
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
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
}

function FormField({ label, hint, value, onChange, suffix, min, max, step = 1 }: FormFieldProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-cream-700 dark:text-cream-300 mb-1">
        {label}
        {hint && <span className="ml-1 text-cream-400 font-normal">({hint})</span>}
      </label>
      <div className="relative">
        <input
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
