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
  useAlertSettings,
  useConstraintsConfig,
  useUniverseConfig,
  useUpdateAlertSettings,
  useUpdateConstraintsConfig,
  useUpdateUniverseConfig,
} from "@/hooks/queries";
import type { AlertSettings, ConstraintsConfig, UniverseConfig } from "@/lib/api/types";

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
  const [formData, setFormData] = useState<Partial<UniverseConfig>>({});

  const handleStartEdit = () => {
    if (universe) {
      setFormData(universe);
      setEditing(true);
    }
  };

  const handleSave = () => {
    if (formData) {
      updateUniverse.mutate(formData as UniverseConfig, {
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
        {/* Filters */}
        <div>
          <h3 className="text-sm font-medium text-cream-900 dark:text-cream-100 mb-3">Filters</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-cream-600 dark:text-cream-400 mb-1">
                Optionable Only
              </label>
              {editing ? (
                <select
                  value={String(formData.filters?.optionableOnly ?? false)}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      filters: { ...formData.filters!, optionableOnly: e.target.value === "true" },
                    })
                  }
                  className="w-full px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-cream-900 dark:text-cream-100"
                >
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              ) : (
                <div className="text-cream-900 dark:text-cream-100">
                  {universe.filters.optionableOnly ? "Yes" : "No"}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm text-cream-600 dark:text-cream-400 mb-1">
                Min Avg Volume
              </label>
              {editing ? (
                <input
                  type="number"
                  value={formData.filters?.minAvgVolume ?? 0}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      filters: { ...formData.filters!, minAvgVolume: parseInt(e.target.value) },
                    })
                  }
                  className="w-full px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-cream-900 dark:text-cream-100"
                />
              ) : (
                <div className="text-cream-900 dark:text-cream-100">
                  {universe.filters.minAvgVolume.toLocaleString()}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm text-cream-600 dark:text-cream-400 mb-1">
                Min Market Cap
              </label>
              {editing ? (
                <input
                  type="number"
                  value={formData.filters?.minMarketCap ?? 0}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      filters: { ...formData.filters!, minMarketCap: parseInt(e.target.value) },
                    })
                  }
                  className="w-full px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-cream-900 dark:text-cream-100"
                />
              ) : (
                <div className="text-cream-900 dark:text-cream-100">
                  ${(universe.filters.minMarketCap / 1e9).toFixed(1)}B
                </div>
              )}
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
              {universe.include.length > 0 ? universe.include.join(", ") : "None"}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-medium text-cream-900 dark:text-cream-100 mb-2">
              Always Exclude
            </h3>
            <div className="text-sm text-cream-600 dark:text-cream-400">
              {universe.exclude.length > 0 ? universe.exclude.join(", ") : "None"}
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
                perInstrument: { ...formData.perInstrument!, maxShares: val },
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
                perInstrument: { ...formData.perInstrument!, maxContracts: val },
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
                perInstrument: { ...formData.perInstrument!, maxNotional: val },
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
                perInstrument: { ...formData.perInstrument!, maxPctEquity: val / 100 },
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
                portfolio: { ...formData.portfolio!, maxGrossExposure: val / 100 },
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
                portfolio: { ...formData.portfolio!, maxNetExposure: val / 100 },
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
                portfolio: { ...formData.portfolio!, maxConcentration: val / 100 },
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
                portfolio: { ...formData.portfolio!, maxDrawdown: val / 100 },
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
                options: { ...formData.options!, maxDelta: val },
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
                options: { ...formData.options!, maxGamma: val },
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
                options: { ...formData.options!, maxVega: val },
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
                options: { ...formData.options!, maxTheta: val },
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
      <label className="block text-sm text-cream-600 dark:text-cream-400 mb-1">{label}</label>
      {editing ? (
        <input
          type="number"
          defaultValue={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-full px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-cream-900 dark:text-cream-100"
        />
      ) : (
        <div className="text-cream-900 dark:text-cream-100">
          {value.toLocaleString()}
          {suffix}
        </div>
      )}
    </div>
  );
}

// ============================================
// Agents Editor (Placeholder)
// ============================================

function AgentsEditor() {
  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
      <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-4">
        Agent Configuration
      </h2>
      <p className="text-cream-500 dark:text-cream-400">
        Agent configuration is managed through the Agents page. Navigate to Agents to view and
        modify individual agent settings.
      </p>
      <a
        href="/agents"
        className="inline-block mt-4 px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
      >
        Go to Agents &rarr;
      </a>
    </div>
  );
}

// ============================================
// Risk Editor (Placeholder)
// ============================================

function RiskEditor() {
  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
      <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-4">
        Risk Configuration
      </h2>
      <p className="text-cream-500 dark:text-cream-400">
        Risk limits are configured through the Constraints section. Position and portfolio-level
        limits can be edited there.
      </p>
      <a
        href="/config/constraints"
        className="inline-block mt-4 px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
      >
        Go to Constraints &rarr;
      </a>
    </div>
  );
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
