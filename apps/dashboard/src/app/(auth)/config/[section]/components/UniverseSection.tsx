"use client";

/**
 * Universe Section Editor
 *
 * Configuration editor for trading universe settings.
 */

import { useUniverseConfig, useUpdateUniverseConfig } from "@/hooks/queries";
import type { RuntimeUniverseConfig } from "@/lib/api/types";
import { useUniverseEditor } from "../hooks";
import { EditorHeader, LoadingSkeleton, NotFoundMessage } from "./shared";

export function UniverseSection() {
  const { data: universe, isLoading } = useUniverseConfig();
  const updateUniverse = useUpdateUniverseConfig();
  const editor = useUniverseEditor(universe, updateUniverse);

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (!universe) {
    return <NotFoundMessage message="No universe configuration found" />;
  }

  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
      <EditorHeader
        title="Universe Settings"
        editing={editor.editing}
        isPending={editor.isPending}
        onStartEdit={editor.startEdit}
        onCancel={editor.cancelEdit}
        onSave={editor.saveEdit}
      />

      <div className="space-y-6">
        <SourceSection
          universe={universe}
          editing={editor.editing}
          formData={editor.formData}
          onFormChange={editor.updateFormData}
        />

        <FiltersSection
          universe={universe}
          editing={editor.editing}
          formData={editor.formData}
          onFormChange={editor.updateFormData}
        />

        <IncludeExcludeLists universe={universe} />
      </div>
    </div>
  );
}

interface SectionProps {
  universe: RuntimeUniverseConfig;
  editing: boolean;
  formData: Partial<RuntimeUniverseConfig>;
  onFormChange: (data: Partial<RuntimeUniverseConfig>) => void;
}

function SourceSection({ universe, editing, formData, onFormChange }: SectionProps) {
  return (
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
                  onFormChange({
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
              <div className="text-cream-900 dark:text-cream-100 capitalize">{universe.source}</div>
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
  );
}

function FiltersSection({ universe, editing, formData, onFormChange }: SectionProps) {
  return (
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
                  onFormChange({
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
                  onFormChange({
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
                  onFormChange({
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
  );
}

interface IncludeExcludeListsProps {
  universe: RuntimeUniverseConfig;
}

function IncludeExcludeLists({ universe }: IncludeExcludeListsProps) {
  return (
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
  );
}
