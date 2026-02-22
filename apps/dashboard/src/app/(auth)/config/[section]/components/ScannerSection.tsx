"use client";

import Link from "next/link";
import { useScannerConfig, useUpdateScannerConfig } from "@/hooks/queries";
import type { RuntimeScannerConfig } from "@/lib/api/types";
import { useScannerEditor } from "../hooks";
import { EditorHeader, LoadingSkeleton, NotFoundMessage, StatusBadge } from "./shared";

interface ScannerFieldProps {
	label: string;
	value: number;
	editing: boolean;
	suffix?: string;
	step?: number;
	min?: number;
	onChange: (value: number) => void;
}

function ScannerField({
	label,
	value,
	editing,
	suffix,
	step = 1,
	min = 0,
	onChange,
}: ScannerFieldProps) {
	const inputId = `scanner-${label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`;

	return (
		<div>
			<label htmlFor={inputId} className="block text-sm text-stone-600 dark:text-night-400 mb-1">
				{label}
			</label>
			{editing ? (
				<input
					id={inputId}
					type="number"
					value={value}
					onChange={(event) => onChange(parseFloat(event.target.value) || 0)}
					step={step}
					min={min}
					className="mt-1 w-full px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-stone-900 dark:text-night-50"
				/>
			) : (
				<div className="text-stone-900 dark:text-night-50 font-mono tabular-nums">
					{value.toLocaleString()}
					{suffix}
				</div>
			)}
		</div>
	);
}

interface ScannerSectionProps {
	scanner: RuntimeScannerConfig;
	editing: boolean;
	formData: Partial<RuntimeScannerConfig>;
	onFormChange: (data: Partial<RuntimeScannerConfig>) => void;
}

interface ScannerCurrentValues {
	minPrice: number;
	minAvgVolume: number;
	volumeSpikeThreshold: number;
	priceMoveThreshold: number;
	gapThreshold: number;
	maxCandidates: number;
	cooldownSeconds: number;
	enabled: boolean;
}

type ScannerNumericKey = Exclude<keyof ScannerCurrentValues, "enabled">;

interface ScannerNumericFieldDefinition {
	label: string;
	field: ScannerNumericKey;
	suffix?: string;
	step?: number;
	min?: number;
	normalize: (value: number) => number;
}

const SCANNER_NUMERIC_FIELDS: ScannerNumericFieldDefinition[] = [
	{
		label: "Min Price",
		field: "minPrice",
		suffix: " USD",
		step: 0.1,
		normalize: (value) => Math.max(0, value),
	},
	{
		label: "Min Avg Volume",
		field: "minAvgVolume",
		normalize: (value) => Math.max(0, Math.trunc(value)),
	},
	{
		label: "Volume Spike Threshold",
		field: "volumeSpikeThreshold",
		suffix: "x",
		step: 0.1,
		min: 1,
		normalize: (value) => Math.max(1, value),
	},
	{
		label: "Price Move Threshold",
		field: "priceMoveThreshold",
		suffix: "%",
		step: 0.1,
		normalize: (value) => Math.max(0, value),
	},
	{
		label: "Gap Threshold",
		field: "gapThreshold",
		suffix: "%",
		step: 0.1,
		normalize: (value) => Math.max(0, value),
	},
	{
		label: "Max Candidates",
		field: "maxCandidates",
		min: 1,
		normalize: (value) => Math.max(1, Math.trunc(value)),
	},
	{
		label: "Cooldown Seconds",
		field: "cooldownSeconds",
		suffix: " sec",
		normalize: (value) => Math.max(0, Math.trunc(value)),
	},
];

function resolveScannerValues(
	scanner: RuntimeScannerConfig,
	formData: Partial<RuntimeScannerConfig>,
) {
	return {
		minPrice: formData.minPrice ?? scanner.minPrice,
		minAvgVolume: formData.minAvgVolume ?? scanner.minAvgVolume,
		volumeSpikeThreshold: formData.volumeSpikeThreshold ?? scanner.volumeSpikeThreshold,
		priceMoveThreshold: formData.priceMoveThreshold ?? scanner.priceMoveThreshold,
		gapThreshold: formData.gapThreshold ?? scanner.gapThreshold,
		maxCandidates: formData.maxCandidates ?? scanner.maxCandidates,
		cooldownSeconds: formData.cooldownSeconds ?? scanner.cooldownSeconds,
		enabled: formData.enabled ?? scanner.enabled,
	} satisfies ScannerCurrentValues;
}

function ScannerEnabledField({
	enabled,
	editing,
	onFormChange,
}: {
	enabled: boolean;
	editing: boolean;
	onFormChange: (data: Partial<RuntimeScannerConfig>) => void;
}) {
	return (
		<div className="flex items-center justify-between rounded-md border border-cream-200 bg-cream-50 p-3 dark:border-night-600 dark:bg-night-700">
			<div>
				<div className="text-sm text-stone-600 dark:text-night-400">Scanner Enabled</div>
				<div className="font-medium text-stone-900 dark:text-night-50">
					{enabled ? "Enabled" : "Disabled"}
				</div>
			</div>
			{editing ? (
				<input
					type="checkbox"
					checked={enabled}
					onChange={(event) => onFormChange({ enabled: event.target.checked })}
					className="h-5 w-5 rounded text-blue-600"
				/>
			) : (
				<StatusBadge enabled={enabled} enabledLabel="Active" disabledLabel="Paused" />
			)}
		</div>
	);
}

function ScannerNumericFields({
	values,
	editing,
	onFormChange,
}: {
	values: ScannerCurrentValues;
	editing: boolean;
	onFormChange: (data: Partial<RuntimeScannerConfig>) => void;
}) {
	return (
		<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
			{SCANNER_NUMERIC_FIELDS.map((field) => (
				<ScannerField
					key={field.field}
					label={field.label}
					value={values[field.field]}
					suffix={field.suffix}
					step={field.step}
					min={field.min}
					editing={editing}
					onChange={(value) =>
						onFormChange({
							[field.field]: field.normalize(value),
						} as Partial<RuntimeScannerConfig>)
					}
				/>
			))}
		</div>
	);
}

function ScannerConfigFields({ scanner, editing, formData, onFormChange }: ScannerSectionProps) {
	const values = resolveScannerValues(scanner, formData);

	return (
		<>
			<ScannerEnabledField enabled={values.enabled} editing={editing} onFormChange={onFormChange} />
			<ScannerNumericFields values={values} editing={editing} onFormChange={onFormChange} />
		</>
	);
}

export function ScannerSection() {
	const { data: scanner, isLoading } = useScannerConfig();
	const updateScanner = useUpdateScannerConfig();
	const editor = useScannerEditor(scanner, updateScanner);

	if (isLoading) {
		return <LoadingSkeleton />;
	}

	if (!scanner) {
		return <NotFoundMessage message="No scanner configuration found" />;
	}

	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
			<EditorHeader
				title="Scanner Settings"
				editing={editor.editing}
				isPending={editor.isPending}
				onStartEdit={editor.startEdit}
				onCancel={editor.cancelEdit}
				onSave={editor.saveEdit}
			/>

			<div className="mb-6 flex justify-end">
				<Link
					href="/scanner"
					className="inline-flex items-center rounded-md bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-800 dark:bg-night-600 dark:hover:bg-night-500"
				>
					Open Scanner Live
				</Link>
			</div>

			<div className="space-y-6">
				<ScannerConfigFields
					scanner={scanner}
					editing={editor.editing}
					formData={editor.formData}
					onFormChange={editor.updateFormData}
				/>
			</div>
		</div>
	);
}
