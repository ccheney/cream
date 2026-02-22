"use client";

import { useState } from "react";
import type { RuntimeScannerConfig } from "@/lib/api/types";
import { FormField } from "./FormFields";

export interface ScannerConfigFormProps {
	config: RuntimeScannerConfig;
	onSave: (updates: Partial<RuntimeScannerConfig>) => void;
	onChange: () => void;
	isSaving: boolean;
}

type ScannerNumericField =
	| "minPrice"
	| "minAvgVolume"
	| "volumeSpikeThreshold"
	| "priceMoveThreshold"
	| "gapThreshold"
	| "maxCandidates"
	| "cooldownSeconds";

interface ScannerFieldDefinition {
	field: ScannerNumericField;
	label: string;
	tooltip: string;
	min: number;
	step: number;
	suffix?: string;
	normalize: (value: number) => number;
}

const SCANNER_FIELDS: ScannerFieldDefinition[] = [
	{
		field: "minPrice",
		label: "Min Price",
		tooltip: "Minimum stock price required before the scanner considers a symbol.",
		min: 0,
		step: 0.1,
		suffix: "USD",
		normalize: (value) => Math.max(0, value),
	},
	{
		field: "minAvgVolume",
		label: "Min Avg Volume",
		tooltip: "Minimum rolling average volume filter for scanner eligibility.",
		min: 0,
		step: 1,
		normalize: (value) => Math.max(0, Math.trunc(value)),
	},
	{
		field: "volumeSpikeThreshold",
		label: "Volume Spike Threshold",
		tooltip: "Minimum ratio of current volume to rolling average volume for alerts.",
		min: 1,
		step: 0.1,
		suffix: "x",
		normalize: (value) => Math.max(1, value),
	},
	{
		field: "priceMoveThreshold",
		label: "Price Move Threshold",
		tooltip: "Minimum absolute intraday price move percentage for alerts.",
		min: 0,
		step: 0.1,
		suffix: "%",
		normalize: (value) => Math.max(0, value),
	},
	{
		field: "gapThreshold",
		label: "Gap Threshold",
		tooltip: "Minimum absolute gap percentage versus prior close for alerts.",
		min: 0,
		step: 0.1,
		suffix: "%",
		normalize: (value) => Math.max(0, value),
	},
	{
		field: "maxCandidates",
		label: "Max Candidates",
		tooltip: "Maximum number of symbols forwarded per scanner batch.",
		min: 1,
		step: 1,
		normalize: (value) => Math.max(1, Math.trunc(value)),
	},
	{
		field: "cooldownSeconds",
		label: "Cooldown Seconds",
		tooltip: "Per-symbol cooldown period after an alert is emitted.",
		min: 0,
		step: 1,
		suffix: "sec",
		normalize: (value) => Math.max(0, Math.trunc(value)),
	},
];

function useScannerFormModel({
	config,
	onChange,
	onSave,
}: Pick<ScannerConfigFormProps, "config" | "onChange" | "onSave">) {
	const [formData, setFormData] = useState<Partial<RuntimeScannerConfig>>({});
	const hasChanges = Object.keys(formData).length > 0;

	function getValue<K extends keyof RuntimeScannerConfig>(field: K): RuntimeScannerConfig[K] {
		return (formData[field] as RuntimeScannerConfig[K]) ?? config[field];
	}

	function updateField<K extends keyof RuntimeScannerConfig>(
		field: K,
		value: RuntimeScannerConfig[K],
	): void {
		setFormData((prev) => ({ ...prev, [field]: value }));
		onChange();
	}

	function save(): void {
		if (!hasChanges) {
			return;
		}
		onSave(formData);
		setFormData({});
	}

	return {
		getValue,
		hasChanges,
		save,
		updateField,
	};
}

function ScannerHeader({
	enabled,
	hasChanges,
	isSaving,
	onEnabledChange,
	onSave,
}: {
	enabled: boolean;
	hasChanges: boolean;
	isSaving: boolean;
	onEnabledChange: (enabled: boolean) => void;
	onSave: () => void;
}) {
	return (
		<div className="flex items-center justify-between">
			<h3 className="text-lg font-medium text-stone-900 dark:text-night-50">Scanner Settings</h3>
			<div className="flex items-center gap-4">
				<label className="flex items-center gap-2 text-sm text-stone-700 dark:text-night-100">
					<input
						type="checkbox"
						checked={enabled}
						onChange={(event) => onEnabledChange(event.target.checked)}
						className="h-4 w-4 rounded text-blue-600"
					/>
					Enabled
				</label>
				<button
					type="button"
					onClick={onSave}
					disabled={isSaving || !hasChanges}
					className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
				>
					{isSaving ? "Saving..." : "Save Changes"}
				</button>
			</div>
		</div>
	);
}

function ScannerFieldsGrid({
	getValue,
	updateField,
}: {
	getValue: <K extends keyof RuntimeScannerConfig>(field: K) => RuntimeScannerConfig[K];
	updateField: <K extends keyof RuntimeScannerConfig>(
		field: K,
		value: RuntimeScannerConfig[K],
	) => void;
}) {
	return (
		<div className="grid grid-cols-2 gap-4">
			{SCANNER_FIELDS.map((field) => (
				<FormField
					key={field.field}
					label={field.label}
					tooltip={field.tooltip}
					value={getValue(field.field)}
					onChange={(value) => updateField(field.field, field.normalize(value))}
					min={field.min}
					step={field.step}
					suffix={field.suffix}
				/>
			))}
		</div>
	);
}

export function ScannerConfigForm({ config, onSave, onChange, isSaving }: ScannerConfigFormProps) {
	const model = useScannerFormModel({ config, onSave, onChange });

	return (
		<div className="space-y-6">
			<ScannerHeader
				enabled={model.getValue("enabled")}
				hasChanges={model.hasChanges}
				isSaving={isSaving}
				onEnabledChange={(enabled) => model.updateField("enabled", enabled)}
				onSave={model.save}
			/>
			<ScannerFieldsGrid getValue={model.getValue} updateField={model.updateField} />
		</div>
	);
}
