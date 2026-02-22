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

export function ScannerConfigForm({
	config,
	onSave,
	onChange,
	isSaving,
}: ScannerConfigFormProps) {
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

	function handleSave(): void {
		if (!hasChanges) {
			return;
		}
		onSave(formData);
		setFormData({});
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h3 className="text-lg font-medium text-stone-900 dark:text-night-50">Scanner Settings</h3>
				<div className="flex items-center gap-4">
					<label className="flex items-center gap-2 text-sm text-stone-700 dark:text-night-100">
						<input
							type="checkbox"
							checked={getValue("enabled")}
							onChange={(event) => updateField("enabled", event.target.checked)}
							className="w-4 h-4 text-blue-600 rounded"
						/>
						Enabled
					</label>
					<button
						type="button"
						onClick={handleSave}
						disabled={isSaving || !hasChanges}
						className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
					>
						{isSaving ? "Saving..." : "Save Changes"}
					</button>
				</div>
			</div>

			<div className="grid grid-cols-2 gap-4">
				<FormField
					label="Min Price"
					tooltip="Minimum stock price required before the scanner considers a symbol."
					value={getValue("minPrice")}
					onChange={(value) => updateField("minPrice", Math.max(0, value))}
					min={0}
					step={0.1}
					suffix="USD"
				/>
				<FormField
					label="Min Avg Volume"
					tooltip="Minimum rolling average volume filter for scanner eligibility."
					value={getValue("minAvgVolume")}
					onChange={(value) => updateField("minAvgVolume", Math.max(0, Math.trunc(value)))}
					min={0}
					step={1}
				/>
				<FormField
					label="Volume Spike Threshold"
					tooltip="Minimum ratio of current volume to rolling average volume for alerts."
					value={getValue("volumeSpikeThreshold")}
					onChange={(value) => updateField("volumeSpikeThreshold", Math.max(1, value))}
					min={1}
					step={0.1}
					suffix="x"
				/>
				<FormField
					label="Price Move Threshold"
					tooltip="Minimum absolute intraday price move percentage for alerts."
					value={getValue("priceMoveThreshold")}
					onChange={(value) => updateField("priceMoveThreshold", Math.max(0, value))}
					min={0}
					step={0.1}
					suffix="%"
				/>
				<FormField
					label="Gap Threshold"
					tooltip="Minimum absolute gap percentage versus prior close for alerts."
					value={getValue("gapThreshold")}
					onChange={(value) => updateField("gapThreshold", Math.max(0, value))}
					min={0}
					step={0.1}
					suffix="%"
				/>
				<FormField
					label="Max Candidates"
					tooltip="Maximum number of symbols forwarded per scanner batch."
					value={getValue("maxCandidates")}
					onChange={(value) => updateField("maxCandidates", Math.max(1, Math.trunc(value)))}
					min={1}
					step={1}
				/>
				<FormField
					label="Cooldown Seconds"
					tooltip="Per-symbol cooldown period after an alert is emitted."
					value={getValue("cooldownSeconds")}
					onChange={(value) => updateField("cooldownSeconds", Math.max(0, Math.trunc(value)))}
					min={0}
					step={1}
					suffix="sec"
				/>
			</div>
		</div>
	);
}
