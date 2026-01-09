"use client";

/**
 * Config Section Page
 *
 * Dynamic routing for configuration sections:
 * - universe: Trading universe settings
 * - constraints: Position and portfolio limits
 * - agents: Agent configuration
 * - risk: Risk management settings
 * - notifications: Alert preferences
 */

import { notFound, useParams, useRouter } from "next/navigation";
import { useState } from "react";
import {
  useAgentConfig,
  useAgentStatuses,
  useAlertSettings,
  useConstraintsConfig,
  useUniverseConfig,
  useUpdateAgentConfig,
  useUpdateAlertSettings,
  useUpdateConstraintsConfig,
  useUpdateUniverseConfig,
} from "@/hooks/queries";
import type {
  AgentConfig,
  AlertSettings,
  ConstraintsConfig,
  RuntimeUniverseConfig,
} from "@/lib/api/types";

const VALID_SECTIONS = ["universe", "constraints", "agents", "risk", "notifications"] as const;
type Section = (typeof VALID_SECTIONS)[number];

export default function ConfigSectionPage() {
  const params = useParams();
  const router = useRouter();
  const section = params.section as string;

  if (!VALID_SECTIONS.includes(section as Section)) {
    notFound();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
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
        <h1 className="text-2xl font-semibold text-cream-900 dark:text-cream-100 capitalize">
          {section} Configuration
        </h1>
      </div>

      {/* Section Content */}
      {section === "universe" && <UniverseEditor />}
      {section === "constraints" && <ConstraintsEditor />}
      {section === "agents" && <AgentsEditor />}
      {section === "risk" && <RiskEditor />}
      {section === "notifications" && <NotificationsEditor />}
    </div>
  );
}

// ============================================
// Universe Editor
// ============================================

function UniverseEditor() {
  const { data: universe, isLoading } = useUniverseConfig();
  const updateUniverse = useUpdateUniverseConfig();
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<RuntimeUniverseConfig>>({});

  const handleStartEdit = () => {
    if (universe) {
      setFormData(universe);
      setEditing(true);
    }
  };

  const handleSave = () => {
    if (formData) {
      updateUniverse.mutate(formData as RuntimeUniverseConfig, {
        onSuccess: () => setEditing(false),
      });
    }
  };

  if (isLoading) {
    return <div className="h-64 bg-cream-100 dark:bg-night-700 rounded-lg animate-pulse" />;
  }

  if (!universe) {
    return <div className="text-cream-500">No universe configuration found</div>;
  }

  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100">
          Universe Settings
        </h2>
        {!editing ? (
          <button
            type="button"
            onClick={handleStartEdit}
            className="px-4 py-2 text-sm font-medium text-cream-700 dark:text-cream-200 bg-cream-100 dark:bg-night-700 rounded-md hover:bg-cream-200 dark:hover:bg-night-600"
          >
            Edit
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-4 py-2 text-sm font-medium text-cream-700 dark:text-cream-200 bg-cream-100 dark:bg-night-700 rounded-md hover:bg-cream-200 dark:hover:bg-night-600"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={updateUniverse.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {updateUniverse.isPending ? "Saving..." : "Save"}
            </button>
          </div>
        )}
      </div>

      <div className="space-y-6">
        {/* Source */}
        <div>
          <h3 className="text-sm font-medium text-cream-900 dark:text-cream-100 mb-3">Source</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              {/* biome-ignore lint/a11y/noLabelWithoutControl: input is inside label when editing */}
              <label className="block text-sm text-cream-600 dark:text-cream-400 mb-1">
                Source Type
                {editing ? (
                  <select
                    value={formData.source ?? universe.source}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        source: e.target.value as RuntimeUniverseConfig["source"],
                      })
                    }
                    className="mt-1 w-full px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-cream-900 dark:text-cream-100"
                  >
                    <option value="static">Static</option>
                    <option value="index">Index</option>
                    <option value="screener">Screener</option>
                  </select>
                ) : (
                  <div className="text-cream-900 dark:text-cream-100 capitalize">
                    {universe.source}
                  </div>
                )}
              </label>
            </div>
            {universe.source === "static" && (
              <div>
                <div className="block text-sm text-cream-600 dark:text-cream-400 mb-1">
                  Static Symbols
                </div>
                <div className="text-cream-900 dark:text-cream-100">
                  {universe.staticSymbols?.join(", ") || "None"}
                </div>
              </div>
            )}
            {universe.source === "index" && (
              <div>
                <div className="block text-sm text-cream-600 dark:text-cream-400 mb-1">
                  Index Source
                </div>
                <div className="text-cream-900 dark:text-cream-100">
                  {universe.indexSource || "None"}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Filters */}
        <div>
          <h3 className="text-sm font-medium text-cream-900 dark:text-cream-100 mb-3">Filters</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              {/* biome-ignore lint/a11y/noLabelWithoutControl: input is inside label when editing */}
              <label className="block text-sm text-cream-600 dark:text-cream-400 mb-1">
                Optionable Only
                {editing ? (
                  <select
                    value={String(formData.optionableOnly ?? universe.optionableOnly)}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        optionableOnly: e.target.value === "true",
                      })
                    }
                    className="mt-1 w-full px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-cream-900 dark:text-cream-100"
                  >
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                ) : (
                  <div className="text-cream-900 dark:text-cream-100">
                    {universe.optionableOnly ? "Yes" : "No"}
                  </div>
                )}
              </label>
            </div>
            <div>
              {/* biome-ignore lint/a11y/noLabelWithoutControl: input is inside label when editing */}
              <label className="block text-sm text-cream-600 dark:text-cream-400 mb-1">
                Min Volume
                {editing ? (
                  <input
                    type="number"
                    value={formData.minVolume ?? universe.minVolume ?? 0}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        minVolume: parseInt(e.target.value, 10) || null,
                      })
                    }
                    className="mt-1 w-full px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-cream-900 dark:text-cream-100"
                  />
                ) : (
                  <div className="text-cream-900 dark:text-cream-100">
                    {universe.minVolume?.toLocaleString() ?? "Not set"}
                  </div>
                )}
              </label>
            </div>
            <div>
              {/* biome-ignore lint/a11y/noLabelWithoutControl: input is inside label when editing */}
              <label className="block text-sm text-cream-600 dark:text-cream-400 mb-1">
                Min Market Cap
                {editing ? (
                  <input
                    type="number"
                    value={formData.minMarketCap ?? universe.minMarketCap ?? 0}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        minMarketCap: parseInt(e.target.value, 10) || null,
                      })
                    }
                    className="mt-1 w-full px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-cream-900 dark:text-cream-100"
                  />
                ) : (
                  <div className="text-cream-900 dark:text-cream-100">
                    {universe.minMarketCap
                      ? `$${(universe.minMarketCap / 1e9).toFixed(1)}B`
                      : "Not set"}
                  </div>
                )}
              </label>
            </div>
          </div>
        </div>

        {/* Include/Exclude Lists */}
        <div className="grid grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-medium text-cream-900 dark:text-cream-100 mb-2">
              Always Include
            </h3>
            <div className="text-sm text-cream-600 dark:text-cream-400">
              {universe.includeList.length > 0 ? universe.includeList.join(", ") : "None"}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-medium text-cream-900 dark:text-cream-100 mb-2">
              Always Exclude
            </h3>
            <div className="text-sm text-cream-600 dark:text-cream-400">
              {universe.excludeList.length > 0 ? universe.excludeList.join(", ") : "None"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Constraints Editor
// ============================================

function ConstraintsEditor() {
  const { data: constraints, isLoading } = useConstraintsConfig();
  const updateConstraints = useUpdateConstraintsConfig();
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<ConstraintsConfig>>({});

  const handleStartEdit = () => {
    if (constraints) {
      setFormData(constraints);
      setEditing(true);
    }
  };

  const handleSave = () => {
    if (formData) {
      updateConstraints.mutate(formData as ConstraintsConfig, {
        onSuccess: () => setEditing(false),
      });
    }
  };

  if (isLoading) {
    return <div className="h-64 bg-cream-100 dark:bg-night-700 rounded-lg animate-pulse" />;
  }

  if (!constraints) {
    return <div className="text-cream-500">No constraints configuration found</div>;
  }

  return (
    <div className="space-y-6">
      {/* Per-Instrument Limits */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100">
            Per-Instrument Limits
          </h2>
          {!editing ? (
            <button
              type="button"
              onClick={handleStartEdit}
              className="px-4 py-2 text-sm font-medium text-cream-700 dark:text-cream-200 bg-cream-100 dark:bg-night-700 rounded-md hover:bg-cream-200 dark:hover:bg-night-600"
            >
              Edit All
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="px-4 py-2 text-sm font-medium text-cream-700 dark:text-cream-200 bg-cream-100 dark:bg-night-700 rounded-md hover:bg-cream-200 dark:hover:bg-night-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={updateConstraints.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {updateConstraints.isPending ? "Saving..." : "Save"}
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <ConstraintField
            label="Max Shares"
            value={constraints.perInstrument.maxShares}
            editing={editing}
            onChange={(val) =>
              setFormData({
                ...formData,
                perInstrument: {
                  ...(formData.perInstrument ?? constraints.perInstrument),
                  maxShares: val,
                },
              })
            }
          />
          <ConstraintField
            label="Max Contracts"
            value={constraints.perInstrument.maxContracts}
            editing={editing}
            onChange={(val) =>
              setFormData({
                ...formData,
                perInstrument: {
                  ...(formData.perInstrument ?? constraints.perInstrument),
                  maxContracts: val,
                },
              })
            }
          />
          <ConstraintField
            label="Max Notional ($)"
            value={constraints.perInstrument.maxNotional}
            editing={editing}
            onChange={(val) =>
              setFormData({
                ...formData,
                perInstrument: {
                  ...(formData.perInstrument ?? constraints.perInstrument),
                  maxNotional: val,
                },
              })
            }
          />
          <ConstraintField
            label="Max % Equity"
            value={constraints.perInstrument.maxPctEquity * 100}
            editing={editing}
            suffix="%"
            onChange={(val) =>
              setFormData({
                ...formData,
                perInstrument: {
                  ...(formData.perInstrument ?? constraints.perInstrument),
                  maxPctEquity: val / 100,
                },
              })
            }
          />
        </div>
      </div>

      {/* Portfolio Limits */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
        <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-6">
          Portfolio Limits
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <ConstraintField
            label="Max Gross Exposure"
            value={constraints.portfolio.maxGrossExposure * 100}
            editing={editing}
            suffix="%"
            onChange={(val) =>
              setFormData({
                ...formData,
                portfolio: {
                  ...(formData.portfolio ?? constraints.portfolio),
                  maxGrossExposure: val / 100,
                },
              })
            }
          />
          <ConstraintField
            label="Max Net Exposure"
            value={constraints.portfolio.maxNetExposure * 100}
            editing={editing}
            suffix="%"
            onChange={(val) =>
              setFormData({
                ...formData,
                portfolio: {
                  ...(formData.portfolio ?? constraints.portfolio),
                  maxNetExposure: val / 100,
                },
              })
            }
          />
          <ConstraintField
            label="Max Concentration"
            value={constraints.portfolio.maxConcentration * 100}
            editing={editing}
            suffix="%"
            onChange={(val) =>
              setFormData({
                ...formData,
                portfolio: {
                  ...(formData.portfolio ?? constraints.portfolio),
                  maxConcentration: val / 100,
                },
              })
            }
          />
          <ConstraintField
            label="Max Drawdown"
            value={constraints.portfolio.maxDrawdown * 100}
            editing={editing}
            suffix="%"
            onChange={(val) =>
              setFormData({
                ...formData,
                portfolio: {
                  ...(formData.portfolio ?? constraints.portfolio),
                  maxDrawdown: val / 100,
                },
              })
            }
          />
        </div>
      </div>

      {/* Options Limits */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
        <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-6">
          Options Greeks Limits
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <ConstraintField
            label="Max Delta"
            value={constraints.options.maxDelta}
            editing={editing}
            onChange={(val) =>
              setFormData({
                ...formData,
                options: { ...(formData.options ?? constraints.options), maxDelta: val },
              })
            }
          />
          <ConstraintField
            label="Max Gamma"
            value={constraints.options.maxGamma}
            editing={editing}
            onChange={(val) =>
              setFormData({
                ...formData,
                options: { ...(formData.options ?? constraints.options), maxGamma: val },
              })
            }
          />
          <ConstraintField
            label="Max Vega"
            value={constraints.options.maxVega}
            editing={editing}
            onChange={(val) =>
              setFormData({
                ...formData,
                options: { ...(formData.options ?? constraints.options), maxVega: val },
              })
            }
          />
          <ConstraintField
            label="Max Theta"
            value={constraints.options.maxTheta}
            editing={editing}
            onChange={(val) =>
              setFormData({
                ...formData,
                options: { ...(formData.options ?? constraints.options), maxTheta: val },
              })
            }
          />
        </div>
      </div>
    </div>
  );
}

function ConstraintField({
  label,
  value,
  editing,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  editing: boolean;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      {/* biome-ignore lint/a11y/noLabelWithoutControl: input is inside label when editing */}
      <label className="block text-sm text-cream-600 dark:text-cream-400 mb-1">
        {label}
        {editing ? (
          <input
            type="number"
            defaultValue={value}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
            className="mt-1 w-full px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-cream-900 dark:text-cream-100"
          />
        ) : (
          <div className="text-cream-900 dark:text-cream-100">
            {value.toLocaleString()}
            {suffix}
          </div>
        )}
      </label>
    </div>
  );
}

// ============================================
// Agents Editor
// ============================================

function AgentsEditor() {
  const { data: statuses, isLoading } = useAgentStatuses();
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const { data: config, isLoading: configLoading } = useAgentConfig(selectedAgent || "");
  const updateConfig = useUpdateAgentConfig();
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<AgentConfig>>({});

  const handleStartEdit = () => {
    if (config) {
      setFormData(config);
      setEditing(true);
    }
  };

  const handleSave = () => {
    if (selectedAgent && formData) {
      updateConfig.mutate(
        { agentType: selectedAgent, config: formData },
        { onSuccess: () => setEditing(false) }
      );
    }
  };

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
      {/* Agent Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statuses?.map((agent) => (
          <button
            type="button"
            key={agent.type}
            onClick={() => {
              setSelectedAgent(agent.type);
              setEditing(false);
            }}
            className={`p-4 rounded-lg border text-left transition-all ${
              selectedAgent === agent.type
                ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-500"
                : "border-cream-200 dark:border-night-700 bg-white dark:bg-night-800 hover:border-cream-300 dark:hover:border-night-600"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  agent.status === "processing"
                    ? "bg-blue-500 animate-pulse"
                    : agent.status === "error"
                      ? "bg-red-500"
                      : "bg-emerald-500"
                }`}
              />
              <span className="text-sm font-medium text-cream-900 dark:text-cream-100 truncate">
                {agent.displayName}
              </span>
            </div>
            <div className="text-xs text-cream-500 dark:text-cream-400">
              {agent.outputsToday} outputs today
            </div>
          </button>
        ))}
      </div>

      {/* Selected Agent Config Panel */}
      {selectedAgent && (
        <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-medium text-cream-900 dark:text-cream-100">
              {statuses?.find((a) => a.type === selectedAgent)?.displayName} Configuration
            </h3>
            {!editing ? (
              <button
                type="button"
                onClick={handleStartEdit}
                disabled={configLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                Edit
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="px-4 py-2 text-sm font-medium text-cream-700 dark:text-cream-300 bg-cream-100 dark:bg-night-700 rounded-md hover:bg-cream-200 dark:hover:bg-night-600"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={updateConfig.isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {updateConfig.isPending ? "Saving..." : "Save"}
                </button>
              </div>
            )}
          </div>

          {configLoading ? (
            <div className="animate-pulse space-y-4">
              <div className="h-4 bg-cream-200 dark:bg-night-700 rounded w-1/4" />
              <div className="h-10 bg-cream-200 dark:bg-night-700 rounded" />
            </div>
          ) : config ? (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="agent-model-select"
                  className="block text-sm font-medium text-cream-700 dark:text-cream-300 mb-1"
                >
                  Model
                </label>
                {editing ? (
                  <select
                    id="agent-model-select"
                    value={formData.model || ""}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    className="w-full px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-cream-900 dark:text-cream-100"
                  >
                    <option value="gemini-2.5-flash-preview-05-20">Gemini 2.5 Flash</option>
                    <option value="gemini-2.5-pro-preview-05-06">Gemini 2.5 Pro</option>
                    <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                    <option value="claude-opus-4-20250514">Claude Opus 4</option>
                  </select>
                ) : (
                  <div className="px-3 py-2 text-cream-900 dark:text-cream-100">{config.model}</div>
                )}
              </div>

              <div>
                <label
                  htmlFor="agent-enabled-checkbox"
                  className="block text-sm font-medium text-cream-700 dark:text-cream-300 mb-1"
                >
                  Enabled
                </label>
                {editing ? (
                  <label className="flex items-center gap-2">
                    <input
                      id="agent-enabled-checkbox"
                      type="checkbox"
                      checked={formData.enabled ?? config.enabled}
                      onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                      className="w-4 h-4 text-blue-600 bg-white dark:bg-night-700 border-cream-300 dark:border-night-600 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-cream-700 dark:text-cream-300">
                      Agent is active
                    </span>
                  </label>
                ) : (
                  <div className="px-3 py-2 text-cream-900 dark:text-cream-100">
                    {config.enabled ? "Yes" : "No"}
                  </div>
                )}
              </div>

              <div>
                <label
                  htmlFor="agent-system-prompt"
                  className="block text-sm font-medium text-cream-700 dark:text-cream-300 mb-1"
                >
                  System Prompt
                </label>
                {editing ? (
                  <textarea
                    id="agent-system-prompt"
                    value={formData.systemPrompt || ""}
                    onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
                    rows={4}
                    className="w-full px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-cream-900 dark:text-cream-100 font-mono text-sm"
                  />
                ) : (
                  <div className="px-3 py-2 text-cream-900 dark:text-cream-100 text-sm bg-cream-50 dark:bg-night-900 rounded-md whitespace-pre-wrap max-h-32 overflow-y-auto">
                    {config.systemPrompt}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-cream-500 dark:text-cream-400">No configuration found</p>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// Risk Editor
// ============================================

function RiskEditor() {
  // Risk editor reuses the ConstraintsEditor since constraints ARE risk limits
  return <ConstraintsEditor />;
}

// ============================================
// Notifications Editor
// ============================================

function NotificationsEditor() {
  const { data: settings, isLoading } = useAlertSettings();
  const updateSettings = useUpdateAlertSettings();
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<AlertSettings>>({});

  const handleStartEdit = () => {
    if (settings) {
      setFormData(settings);
      setEditing(true);
    }
  };

  const handleSave = () => {
    if (formData) {
      updateSettings.mutate(formData as AlertSettings, {
        onSuccess: () => setEditing(false),
      });
    }
  };

  if (isLoading) {
    return <div className="h-64 bg-cream-100 dark:bg-night-700 rounded-lg animate-pulse" />;
  }

  if (!settings) {
    return <div className="text-cream-500">No notification settings found</div>;
  }

  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100">
          Notification Preferences
        </h2>
        {!editing ? (
          <button
            type="button"
            onClick={handleStartEdit}
            className="px-4 py-2 text-sm font-medium text-cream-700 dark:text-cream-200 bg-cream-100 dark:bg-night-700 rounded-md hover:bg-cream-200 dark:hover:bg-night-600"
          >
            Edit
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-4 py-2 text-sm font-medium text-cream-700 dark:text-cream-200 bg-cream-100 dark:bg-night-700 rounded-md hover:bg-cream-200 dark:hover:bg-night-600"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={updateSettings.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {updateSettings.isPending ? "Saving..." : "Save"}
            </button>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between py-3 border-b border-cream-100 dark:border-night-700">
          <div>
            <div className="text-sm font-medium text-cream-900 dark:text-cream-100">
              Push Notifications
            </div>
            <div className="text-xs text-cream-500 dark:text-cream-400">
              Receive browser push notifications for alerts
            </div>
          </div>
          {editing ? (
            <input
              type="checkbox"
              checked={formData.enablePush ?? false}
              onChange={(e) => setFormData({ ...formData, enablePush: e.target.checked })}
              className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
            />
          ) : (
            <span
              className={`px-2 py-0.5 text-xs font-medium rounded ${
                settings.enablePush
                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-cream-100 text-cream-600 dark:bg-night-700 dark:text-cream-400"
              }`}
            >
              {settings.enablePush ? "Enabled" : "Disabled"}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between py-3 border-b border-cream-100 dark:border-night-700">
          <div>
            <div className="text-sm font-medium text-cream-900 dark:text-cream-100">
              Email Notifications
            </div>
            <div className="text-xs text-cream-500 dark:text-cream-400">
              Receive email notifications for critical alerts
            </div>
          </div>
          {editing ? (
            <input
              type="checkbox"
              checked={formData.enableEmail ?? false}
              onChange={(e) => setFormData({ ...formData, enableEmail: e.target.checked })}
              className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
            />
          ) : (
            <span
              className={`px-2 py-0.5 text-xs font-medium rounded ${
                settings.enableEmail
                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-cream-100 text-cream-600 dark:bg-night-700 dark:text-cream-400"
              }`}
            >
              {settings.enableEmail ? "Enabled" : "Disabled"}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between py-3 border-b border-cream-100 dark:border-night-700">
          <div>
            <div className="text-sm font-medium text-cream-900 dark:text-cream-100">
              Critical Only
            </div>
            <div className="text-xs text-cream-500 dark:text-cream-400">
              Only send notifications for critical-level alerts
            </div>
          </div>
          {editing ? (
            <input
              type="checkbox"
              checked={formData.criticalOnly ?? false}
              onChange={(e) => setFormData({ ...formData, criticalOnly: e.target.checked })}
              className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
            />
          ) : (
            <span
              className={`px-2 py-0.5 text-xs font-medium rounded ${
                settings.criticalOnly
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                  : "bg-cream-100 text-cream-600 dark:bg-night-700 dark:text-cream-400"
              }`}
            >
              {settings.criticalOnly ? "Critical Only" : "All Alerts"}
            </span>
          )}
        </div>

        {settings.emailAddress && (
          <div className="py-3">
            <div className="text-sm font-medium text-cream-900 dark:text-cream-100 mb-1">
              Email Address
            </div>
            <div className="text-sm text-cream-600 dark:text-cream-400">
              {settings.emailAddress}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
