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

				<IncludeExcludeLists
					universe={universe}
					editing={editor.editing}
					formData={editor.formData}
					onFormChange={editor.updateFormData}
				/>
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
			<h3 className="text-sm font-medium text-stone-900 dark:text-night-50 mb-3">Source</h3>
			<div className="grid grid-cols-2 gap-4">
				<div>
					{/* biome-ignore lint/a11y/noLabelWithoutControl: input is inside label when editing */}
					<label className="block text-sm text-stone-600 dark:text-night-200 dark:text-night-400 mb-1">
						Source Type
						{editing ? (
							<select
								value={formData.source ?? universe.source}
								onChange={(e) =>
									onFormChange({
										source: e.target.value as RuntimeUniverseConfig["source"],
									})
								}
								className="mt-1 w-full px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-stone-900 dark:text-night-50"
							>
								<option value="static">Static</option>
								<option value="index">Index</option>
								<option value="screener">Screener</option>
							</select>
						) : (
							<div className="text-stone-900 dark:text-night-50 capitalize">{universe.source}</div>
						)}
					</label>
				</div>
				{(formData.source ?? universe.source) === "static" && (
					<div>
						<label
							htmlFor="static-symbols"
							className="block text-sm text-stone-600 dark:text-night-200 dark:text-night-400 mb-1"
						>
							Static Symbols
						</label>
						{editing ? (
							<textarea
								id="static-symbols"
								rows={3}
								defaultValue={(formData.staticSymbols ?? universe.staticSymbols)?.join(", ") || ""}
								onChange={(e) => {
									const symbols = e.target.value
										.split(",")
										.map((s) => s.trim().toUpperCase())
										.filter(Boolean);
									onFormChange({ staticSymbols: symbols.length > 0 ? symbols : null });
								}}
								placeholder="AAPL, MSFT, GOOGL, ..."
								className="w-full px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-stone-900 dark:text-night-50"
							/>
						) : (
							<div className="text-stone-900 dark:text-night-50">
								{universe.staticSymbols?.join(", ") || "None"}
							</div>
						)}
					</div>
				)}
				{(formData.source ?? universe.source) === "index" && (
					<div>
						<label
							htmlFor="index-source"
							className="block text-sm text-stone-600 dark:text-night-200 dark:text-night-400 mb-1"
						>
							Index Source
						</label>
						{editing ? (
							<select
								id="index-source"
								value={formData.indexSource ?? universe.indexSource ?? "SPY"}
								onChange={(e) => onFormChange({ indexSource: e.target.value })}
								className="w-full px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-stone-900 dark:text-night-50"
							>
								<option value="SPY">S&P 500 (SPY)</option>
								<option value="QQQ">Nasdaq 100 (QQQ)</option>
								<option value="IWM">Russell 2000 (IWM)</option>
								<option value="DIA">Dow Jones (DIA)</option>
							</select>
						) : (
							<div className="text-stone-900 dark:text-night-50">
								{universe.indexSource || "None"}
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

function FiltersSection({ universe, editing, formData, onFormChange }: SectionProps) {
	return (
		<div>
			<h3 className="text-sm font-medium text-stone-900 dark:text-night-50 mb-3">Filters</h3>
			<div className="grid grid-cols-2 gap-4">
				<div>
					{/* biome-ignore lint/a11y/noLabelWithoutControl: input is inside label when editing */}
					<label className="block text-sm text-stone-600 dark:text-night-200 dark:text-night-400 mb-1">
						Optionable Only
						{editing ? (
							<select
								value={String(formData.optionableOnly ?? universe.optionableOnly)}
								onChange={(e) =>
									onFormChange({
										optionableOnly: e.target.value === "true",
									})
								}
								className="mt-1 w-full px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-stone-900 dark:text-night-50"
							>
								<option value="true">Yes</option>
								<option value="false">No</option>
							</select>
						) : (
							<div className="text-stone-900 dark:text-night-50">
								{universe.optionableOnly ? "Yes" : "No"}
							</div>
						)}
					</label>
				</div>
				<div>
					{/* biome-ignore lint/a11y/noLabelWithoutControl: input is inside label when editing */}
					<label className="block text-sm text-stone-600 dark:text-night-200 dark:text-night-400 mb-1">
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
								className="mt-1 w-full px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-stone-900 dark:text-night-50"
							/>
						) : (
							<div className="text-stone-900 dark:text-night-50">
								{universe.minVolume?.toLocaleString() ?? "Not set"}
							</div>
						)}
					</label>
				</div>
				<div>
					{/* biome-ignore lint/a11y/noLabelWithoutControl: input is inside label when editing */}
					<label className="block text-sm text-stone-600 dark:text-night-200 dark:text-night-400 mb-1">
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
								className="mt-1 w-full px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-stone-900 dark:text-night-50"
							/>
						) : (
							<div className="text-stone-900 dark:text-night-50">
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

function IncludeExcludeLists({ universe, editing, formData, onFormChange }: SectionProps) {
	return (
		<div className="grid grid-cols-2 gap-6">
			<div>
				<label
					htmlFor="include-list"
					className="text-sm font-medium text-stone-900 dark:text-night-50 mb-2 block"
				>
					Always Include
				</label>
				{editing ? (
					<textarea
						id="include-list"
						rows={2}
						defaultValue={(formData.includeList ?? universe.includeList).join(", ")}
						onChange={(e) => {
							const symbols = e.target.value
								.split(",")
								.map((s) => s.trim().toUpperCase())
								.filter(Boolean);
							onFormChange({ includeList: symbols });
						}}
						placeholder="AAPL, MSFT, ..."
						className="w-full px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-stone-900 dark:text-night-50 text-sm"
					/>
				) : (
					<div className="text-sm text-stone-600 dark:text-night-200 dark:text-night-400">
						{universe.includeList.length > 0 ? universe.includeList.join(", ") : "None"}
					</div>
				)}
			</div>
			<div>
				<label
					htmlFor="exclude-list"
					className="text-sm font-medium text-stone-900 dark:text-night-50 mb-2 block"
				>
					Always Exclude
				</label>
				{editing ? (
					<textarea
						id="exclude-list"
						rows={2}
						defaultValue={(formData.excludeList ?? universe.excludeList).join(", ")}
						onChange={(e) => {
							const symbols = e.target.value
								.split(",")
								.map((s) => s.trim().toUpperCase())
								.filter(Boolean);
							onFormChange({ excludeList: symbols });
						}}
						placeholder="GME, AMC, ..."
						className="w-full px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-stone-900 dark:text-night-50 text-sm"
					/>
				) : (
					<div className="text-sm text-stone-600 dark:text-night-200 dark:text-night-400">
						{universe.excludeList.length > 0 ? universe.excludeList.join(", ") : "None"}
					</div>
				)}
			</div>
		</div>
	);
}
