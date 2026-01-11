"use client";

import { useEffect, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { RuntimeUniverseConfig } from "@/lib/api/types";
import { FormField } from "./FormFields";
import { InfoIcon, LabelWithTooltip } from "./helpers";

export interface UniverseConfigFormProps {
  config: RuntimeUniverseConfig;
  onSave: (updates: Partial<RuntimeUniverseConfig>) => void;
  onChange: () => void;
  isSaving: boolean;
}

export function UniverseConfigForm({
  config,
  onSave,
  onChange,
  isSaving,
}: UniverseConfigFormProps) {
  const [formData, setFormData] = useState<Partial<RuntimeUniverseConfig>>({});

  const [rawText, setRawText] = useState({
    staticSymbols: (config.staticSymbols || []).join(", "),
    includeList: config.includeList.join(", "),
    excludeList: config.excludeList.join(", "),
  });

  useEffect(() => {
    if (config.source === "index" && !config.indexSource) {
      setFormData((prev) => ({ ...prev, indexSource: "SPY" }));
      onChange();
    }
  }, [config.source, config.indexSource, onChange]);

  function handleChange<K extends keyof RuntimeUniverseConfig>(
    field: K,
    value: RuntimeUniverseConfig[K]
  ): void {
    setFormData((prev) => ({ ...prev, [field]: value }));
    onChange();
  }

  function handleSave(): void {
    if (Object.keys(formData).length > 0) {
      onSave(formData);
      setFormData({});
    }
  }

  function getValue<K extends keyof RuntimeUniverseConfig>(field: K): RuntimeUniverseConfig[K] {
    return (formData[field] as RuntimeUniverseConfig[K]) ?? config[field];
  }

  function parseSymbolList(text: string): string[] {
    return text
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
  }

  function handleArrayTextBlur(field: "staticSymbols" | "includeList" | "excludeList"): void {
    const parsed = parseSymbolList(rawText[field]);
    if (field === "staticSymbols") {
      handleChange(field, parsed.length > 0 ? parsed : null);
    } else {
      handleChange(field, parsed);
    }
  }

  function handleSourceChange(source: "static" | "index" | "screener"): void {
    handleChange("source", source);
    if (source === "index" && !getValue("indexSource")) {
      handleChange("indexSource", "SPY");
    }
  }

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
        <UniverseSourceSelector value={getValue("source")} onChange={handleSourceChange} />

        {getValue("source") === "static" && (
          <StaticSymbolsInput
            value={rawText.staticSymbols}
            onChange={(text) => {
              setRawText((prev) => ({ ...prev, staticSymbols: text.toUpperCase() }));
              onChange();
            }}
            onBlur={() => handleArrayTextBlur("staticSymbols")}
          />
        )}

        {getValue("source") === "index" && (
          <IndexSourceSelector
            value={getValue("indexSource") || "SPY"}
            onChange={(v) => handleChange("indexSource", v)}
          />
        )}

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

        <OptionableCheckbox
          checked={getValue("optionableOnly")}
          onChange={(v) => handleChange("optionableOnly", v)}
        />

        <IncludeExcludeLists
          includeValue={rawText.includeList}
          excludeValue={rawText.excludeList}
          onIncludeChange={(text) => {
            setRawText((prev) => ({ ...prev, includeList: text.toUpperCase() }));
            onChange();
          }}
          onExcludeChange={(text) => {
            setRawText((prev) => ({ ...prev, excludeList: text.toUpperCase() }));
            onChange();
          }}
          onIncludeBlur={() => handleArrayTextBlur("includeList")}
          onExcludeBlur={() => handleArrayTextBlur("excludeList")}
        />
      </div>
    </div>
  );
}

interface UniverseSourceSelectorProps {
  value: "static" | "index" | "screener";
  onChange: (source: "static" | "index" | "screener") => void;
}

function UniverseSourceSelector({ value, onChange }: UniverseSourceSelectorProps) {
  return (
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
            How symbols are selected for trading: Static (manual list), Index (ETF constituents), or
            Screener (filtered by criteria)
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
              checked={value === source}
              onChange={() => onChange(source)}
              className="w-4 h-4 text-blue-600"
            />
            <span className="text-sm text-cream-700 dark:text-cream-300 capitalize">{source}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

interface StaticSymbolsInputProps {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}

function StaticSymbolsInput({ value, onChange, onBlur }: StaticSymbolsInputProps) {
  return (
    <div>
      <LabelWithTooltip
        htmlFor="static-symbols"
        label="Static Symbols"
        tooltip="Comma-separated list of stock tickers to include in the trading universe"
      />
      <textarea
        id="static-symbols"
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder="AAPL, MSFT, GOOGL, ..."
        className="w-full px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-cream-900 dark:text-cream-100"
      />
    </div>
  );
}

interface IndexSourceSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

function IndexSourceSelector({ value, onChange }: IndexSourceSelectorProps) {
  return (
    <div>
      <LabelWithTooltip
        htmlFor="index-source"
        label="Index Source"
        tooltip="ETF whose constituents will be used as the trading universe"
      />
      <select
        id="index-source"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-cream-900 dark:text-cream-100"
      >
        <option value="SPY">S&P 500 (SPY)</option>
        <option value="QQQ">Nasdaq 100 (QQQ)</option>
        <option value="IWM">Russell 2000 (IWM)</option>
        <option value="DIA">Dow Jones (DIA)</option>
      </select>
    </div>
  );
}

interface OptionableCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function OptionableCheckbox({ checked, onChange }: OptionableCheckboxProps) {
  return (
    <div className="flex items-center gap-1.5">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
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
  );
}

interface IncludeExcludeListsProps {
  includeValue: string;
  excludeValue: string;
  onIncludeChange: (value: string) => void;
  onExcludeChange: (value: string) => void;
  onIncludeBlur: () => void;
  onExcludeBlur: () => void;
}

function IncludeExcludeLists({
  includeValue,
  excludeValue,
  onIncludeChange,
  onExcludeChange,
  onIncludeBlur,
  onExcludeBlur,
}: IncludeExcludeListsProps) {
  return (
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
          value={includeValue}
          onChange={(e) => onIncludeChange(e.target.value)}
          onBlur={onIncludeBlur}
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
          value={excludeValue}
          onChange={(e) => onExcludeChange(e.target.value)}
          onBlur={onExcludeBlur}
          placeholder="GME, AMC, ..."
          className="w-full px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-cream-900 dark:text-cream-100"
        />
      </div>
    </div>
  );
}
