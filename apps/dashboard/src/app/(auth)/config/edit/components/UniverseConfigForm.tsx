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

type ListField = "staticSymbols" | "includeList" | "excludeList";

interface RawTextState {
	staticSymbols: string;
	includeList: string;
	excludeList: string;
}

function parseSymbolList(text: string): string[] {
	return text
		.split(",")
		.map((s) => s.trim().toUpperCase())
		.filter(Boolean);
}

function toInitialRawText(config: RuntimeUniverseConfig): RawTextState {
	return {
		staticSymbols: (config.staticSymbols || []).join(", "),
		includeList: config.includeList.join(", "),
		excludeList: config.excludeList.join(", "),
	};
}

type HandleUniverseFieldChange = <K extends keyof RuntimeUniverseConfig>(
	field: K,
	value: RuntimeUniverseConfig[K],
) => void;

function useUniverseConfigDraftState({
	config,
	onSave,
	onChange,
}: Pick<UniverseConfigFormProps, "config" | "onSave" | "onChange">) {
	const [formData, setFormData] = useState<Partial<RuntimeUniverseConfig>>({});
	const hasChanges = Object.keys(formData).length > 0;

	useEffect(() => {
		if (config.source === "index" && !config.indexSource) {
			setFormData((prev) => ({ ...prev, indexSource: "SPY" }));
			onChange();
		}
	}, [config.source, config.indexSource, onChange]);

	const handleChange: HandleUniverseFieldChange = <K extends keyof RuntimeUniverseConfig>(
		field: K,
		value: RuntimeUniverseConfig[K],
	) => {
		setFormData((prev) => ({ ...prev, [field]: value }));
		onChange();
	};

	function handleSave(): void {
		if (Object.keys(formData).length > 0) {
			onSave(formData);
			setFormData({});
		}
	}

	function getValue<K extends keyof RuntimeUniverseConfig>(field: K): RuntimeUniverseConfig[K] {
		return (formData[field] as RuntimeUniverseConfig[K]) ?? config[field];
	}

	return { hasChanges, handleChange, handleSave, getValue };
}

function useUniverseConfigRawText(
	config: RuntimeUniverseConfig,
	onChange: () => void,
	handleChange: HandleUniverseFieldChange,
) {
	const [rawText, setRawText] = useState<RawTextState>(toInitialRawText(config));

	function setRawTextField(field: keyof RawTextState, text: string): void {
		setRawText((prev) => ({ ...prev, [field]: text.toUpperCase() }));
		onChange();
	}

	function handleArrayTextBlur(field: ListField): void {
		const parsed = parseSymbolList(rawText[field]);
		if (field === "staticSymbols") {
			handleChange(field, parsed.length > 0 ? parsed : null);
		} else {
			handleChange(field, parsed);
		}
	}

	return { rawText, setRawTextField, handleArrayTextBlur };
}

function useUniverseConfigFormController({
	config,
	onSave,
	onChange,
}: Pick<UniverseConfigFormProps, "config" | "onSave" | "onChange">) {
	const { hasChanges, handleChange, handleSave, getValue } = useUniverseConfigDraftState({
		config,
		onSave,
		onChange,
	});
	const { rawText, setRawTextField, handleArrayTextBlur } = useUniverseConfigRawText(
		config,
		onChange,
		handleChange,
	);

	function handleSourceChange(source: "static" | "index" | "screener"): void {
		handleChange("source", source);
		if (source === "index" && !getValue("indexSource")) {
			handleChange("indexSource", "SPY");
		}
	}

	return {
		rawText,
		hasChanges,
		source: getValue("source"),
		indexSource: getValue("indexSource") || "SPY",
		minVolume: getValue("minVolume") || 0,
		minMarketCap: getValue("minMarketCap") || 0,
		optionableOnly: getValue("optionableOnly"),
		handleSave,
		handleSourceChange,
		setRawTextField,
		handleArrayTextBlur,
		handleIndexSourceChange: (value: string) => handleChange("indexSource", value),
		handleMinVolumeChange: (value: number) => handleChange("minVolume", value || null),
		handleMinMarketCapChange: (value: number) => handleChange("minMarketCap", value || null),
		handleOptionableOnlyChange: (value: boolean) => handleChange("optionableOnly", value),
	};
}

interface UniverseSourceControlsProps {
	source: "static" | "index" | "screener";
	indexSource: string;
	staticSymbols: string;
	onSourceChange: (source: "static" | "index" | "screener") => void;
	onIndexSourceChange: (value: string) => void;
	onStaticSymbolsChange: (value: string) => void;
	onStaticSymbolsBlur: () => void;
}

function UniverseSourceControls({
	source,
	indexSource,
	staticSymbols,
	onSourceChange,
	onIndexSourceChange,
	onStaticSymbolsChange,
	onStaticSymbolsBlur,
}: UniverseSourceControlsProps) {
	return (
		<>
			<UniverseSourceSelector value={source} onChange={onSourceChange} />
			{source === "static" && (
				<StaticSymbolsInput
					value={staticSymbols}
					onChange={onStaticSymbolsChange}
					onBlur={onStaticSymbolsBlur}
				/>
			)}
			{source === "index" && (
				<IndexSourceSelector value={indexSource} onChange={onIndexSourceChange} />
			)}
		</>
	);
}

interface UniverseThresholdControlsProps {
	minVolume: number;
	minMarketCap: number;
	optionableOnly: boolean;
	onMinVolumeChange: (value: number) => void;
	onMinMarketCapChange: (value: number) => void;
	onOptionableOnlyChange: (value: boolean) => void;
}

function UniverseThresholdControls({
	minVolume,
	minMarketCap,
	optionableOnly,
	onMinVolumeChange,
	onMinMarketCapChange,
	onOptionableOnlyChange,
}: UniverseThresholdControlsProps) {
	return (
		<>
			<div className="grid grid-cols-2 gap-4">
				<FormField
					label="Min Volume"
					tooltip="Minimum average daily trading volume. Filters out illiquid stocks."
					value={minVolume}
					onChange={onMinVolumeChange}
				/>
				<FormField
					label="Min Market Cap"
					tooltip="Minimum market capitalization in dollars. Filters out small-cap stocks."
					value={minMarketCap}
					onChange={onMinMarketCapChange}
				/>
			</div>
			<OptionableCheckbox checked={optionableOnly} onChange={onOptionableOnlyChange} />
		</>
	);
}

interface UniverseListControlsProps {
	includeList: string;
	excludeList: string;
	onIncludeChange: (value: string) => void;
	onExcludeChange: (value: string) => void;
	onIncludeBlur: () => void;
	onExcludeBlur: () => void;
}

function UniverseListControls({
	includeList,
	excludeList,
	onIncludeChange,
	onExcludeChange,
	onIncludeBlur,
	onExcludeBlur,
}: UniverseListControlsProps) {
	return (
		<IncludeExcludeLists
			includeValue={includeList}
			excludeValue={excludeList}
			onIncludeChange={onIncludeChange}
			onExcludeChange={onExcludeChange}
			onIncludeBlur={onIncludeBlur}
			onExcludeBlur={onExcludeBlur}
		/>
	);
}

export function UniverseConfigForm({
	config,
	onSave,
	onChange,
	isSaving,
}: UniverseConfigFormProps) {
	const form = useUniverseConfigFormController({ config, onSave, onChange });

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h3 className="text-lg font-medium text-stone-900 dark:text-night-50">Universe Settings</h3>
				<button
					type="button"
					onClick={form.handleSave}
					disabled={isSaving || !form.hasChanges}
					className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
				>
					{isSaving ? "Saving..." : "Save Changes"}
				</button>
			</div>

			<div className="space-y-4">
				<UniverseSourceControls
					source={form.source}
					indexSource={form.indexSource}
					staticSymbols={form.rawText.staticSymbols}
					onSourceChange={form.handleSourceChange}
					onIndexSourceChange={form.handleIndexSourceChange}
					onStaticSymbolsChange={(value) => form.setRawTextField("staticSymbols", value)}
					onStaticSymbolsBlur={() => form.handleArrayTextBlur("staticSymbols")}
				/>
				<UniverseThresholdControls
					minVolume={form.minVolume}
					minMarketCap={form.minMarketCap}
					optionableOnly={form.optionableOnly}
					onMinVolumeChange={form.handleMinVolumeChange}
					onMinMarketCapChange={form.handleMinMarketCapChange}
					onOptionableOnlyChange={form.handleOptionableOnlyChange}
				/>
				<UniverseListControls
					includeList={form.rawText.includeList}
					excludeList={form.rawText.excludeList}
					onIncludeChange={(value) => form.setRawTextField("includeList", value)}
					onExcludeChange={(value) => form.setRawTextField("excludeList", value)}
					onIncludeBlur={() => form.handleArrayTextBlur("includeList")}
					onExcludeBlur={() => form.handleArrayTextBlur("excludeList")}
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
				<legend className="block text-sm font-medium text-stone-700 dark:text-night-100">
					Universe Source
				</legend>
				<Tooltip>
					<TooltipTrigger>
						<InfoIcon className="w-3.5 h-3.5 text-stone-400 dark:text-night-400 cursor-help" />
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
						<span className="text-sm text-stone-700 dark:text-night-100 capitalize">{source}</span>
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
				className="w-full px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-stone-900 dark:text-night-50"
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
				className="w-full px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-stone-900 dark:text-night-50"
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
				<span className="text-sm font-medium text-stone-700 dark:text-night-100">
					Optionable Symbols Only
				</span>
			</label>
			<Tooltip>
				<TooltipTrigger>
					<InfoIcon className="w-3.5 h-3.5 text-stone-400 dark:text-night-400 cursor-help" />
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
					className="w-full px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-stone-900 dark:text-night-50"
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
					className="w-full px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-stone-900 dark:text-night-50"
				/>
			</div>
		</div>
	);
}
