"use client";

/**
 * Constraints Section Editor
 *
 * Configuration editor for position and portfolio limits.
 */

import { useConstraintsConfig, useUpdateConstraintsConfig } from "@/hooks/queries";
import type { ConstraintsConfig } from "@/lib/api/types";
import { useConstraintsEditor } from "../hooks";
import { ConstraintField, EditorHeader, LoadingSkeleton, NotFoundMessage } from "./shared";

export function ConstraintsSection() {
	const { data: constraints, isLoading } = useConstraintsConfig();
	const updateConstraints = useUpdateConstraintsConfig();
	const editor = useConstraintsEditor(constraints, updateConstraints);

	if (isLoading) {
		return <LoadingSkeleton />;
	}

	if (!constraints) {
		return <NotFoundMessage message="No constraints configuration found" />;
	}

	return (
		<div className="space-y-6">
			<PerInstrumentLimits
				constraints={constraints}
				editing={editor.editing}
				formData={editor.formData}
				isPending={editor.isPending}
				onStartEdit={editor.startEdit}
				onCancel={editor.cancelEdit}
				onSave={editor.saveEdit}
				onFormChange={editor.updateFormData}
			/>

			<PortfolioLimits
				constraints={constraints}
				editing={editor.editing}
				formData={editor.formData}
				onFormChange={editor.updateFormData}
			/>

			<OptionsGreeksLimits
				constraints={constraints}
				editing={editor.editing}
				formData={editor.formData}
				onFormChange={editor.updateFormData}
			/>
		</div>
	);
}

interface LimitsSectionProps {
	constraints: ConstraintsConfig;
	editing: boolean;
	formData: Partial<ConstraintsConfig>;
	onFormChange: (data: Partial<ConstraintsConfig>) => void;
}

interface PerInstrumentLimitsProps extends LimitsSectionProps {
	isPending: boolean;
	onStartEdit: () => void;
	onCancel: () => void;
	onSave: () => void;
}

function PerInstrumentLimits({
	constraints,
	editing,
	formData,
	isPending,
	onStartEdit,
	onCancel,
	onSave,
	onFormChange,
}: PerInstrumentLimitsProps) {
	function handlePerInstrumentChange(
		field: keyof ConstraintsConfig["perInstrument"],
		value: number,
	): void {
		onFormChange({
			perInstrument: {
				...(formData.perInstrument ?? constraints.perInstrument),
				[field]: value,
			},
		});
	}

	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
			<EditorHeader
				title="Per-Instrument Limits"
				editing={editing}
				isPending={isPending}
				onStartEdit={onStartEdit}
				onCancel={onCancel}
				onSave={onSave}
				editLabel="Edit All"
			/>

			<div className="grid grid-cols-2 gap-4">
				<ConstraintField
					label="Max Shares"
					value={constraints.perInstrument.maxShares}
					editing={editing}
					onChange={(val) => handlePerInstrumentChange("maxShares", val)}
				/>
				<ConstraintField
					label="Max Contracts"
					value={constraints.perInstrument.maxContracts}
					editing={editing}
					onChange={(val) => handlePerInstrumentChange("maxContracts", val)}
				/>
				<ConstraintField
					label="Max Notional ($)"
					value={constraints.perInstrument.maxNotional}
					editing={editing}
					onChange={(val) => handlePerInstrumentChange("maxNotional", val)}
				/>
				<ConstraintField
					label="Max % Equity"
					value={constraints.perInstrument.maxPctEquity * 100}
					editing={editing}
					suffix="%"
					onChange={(val) => handlePerInstrumentChange("maxPctEquity", val / 100)}
				/>
			</div>
		</div>
	);
}

function PortfolioLimits({ constraints, editing, formData, onFormChange }: LimitsSectionProps) {
	function handlePortfolioChange(field: keyof ConstraintsConfig["portfolio"], value: number): void {
		onFormChange({
			portfolio: {
				...(formData.portfolio ?? constraints.portfolio),
				[field]: value,
			},
		});
	}

	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
			<h2 className="text-lg font-medium text-stone-900 dark:text-night-50 mb-6">
				Portfolio Limits
			</h2>
			<div className="grid grid-cols-2 gap-4">
				<ConstraintField
					label="Max Gross Exposure"
					value={constraints.portfolio.maxGrossExposure * 100}
					editing={editing}
					suffix="%"
					onChange={(val) => handlePortfolioChange("maxGrossExposure", val / 100)}
				/>
				<ConstraintField
					label="Max Net Exposure"
					value={constraints.portfolio.maxNetExposure * 100}
					editing={editing}
					suffix="%"
					onChange={(val) => handlePortfolioChange("maxNetExposure", val / 100)}
				/>
				<ConstraintField
					label="Max Concentration"
					value={constraints.portfolio.maxConcentration * 100}
					editing={editing}
					suffix="%"
					onChange={(val) => handlePortfolioChange("maxConcentration", val / 100)}
				/>
				<ConstraintField
					label="Max Drawdown"
					value={constraints.portfolio.maxDrawdown * 100}
					editing={editing}
					suffix="%"
					onChange={(val) => handlePortfolioChange("maxDrawdown", val / 100)}
				/>
			</div>
		</div>
	);
}

function OptionsGreeksLimits({ constraints, editing, formData, onFormChange }: LimitsSectionProps) {
	function handleOptionsChange(field: keyof ConstraintsConfig["options"], value: number): void {
		onFormChange({
			options: {
				...(formData.options ?? constraints.options),
				[field]: value,
			},
		});
	}

	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
			<h2 className="text-lg font-medium text-stone-900 dark:text-night-50 mb-6">
				Options Greeks Limits
			</h2>
			<div className="grid grid-cols-2 gap-4">
				<ConstraintField
					label="Max Delta"
					value={constraints.options.maxDelta}
					editing={editing}
					onChange={(val) => handleOptionsChange("maxDelta", val)}
				/>
				<ConstraintField
					label="Max Gamma"
					value={constraints.options.maxGamma}
					editing={editing}
					onChange={(val) => handleOptionsChange("maxGamma", val)}
				/>
				<ConstraintField
					label="Max Vega"
					value={constraints.options.maxVega}
					editing={editing}
					onChange={(val) => handleOptionsChange("maxVega", val)}
				/>
				<ConstraintField
					label="Max Theta"
					value={constraints.options.maxTheta}
					editing={editing}
					onChange={(val) => handleOptionsChange("maxTheta", val)}
				/>
			</div>
		</div>
	);
}
