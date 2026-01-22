"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { ConfigDiff } from "@/components/config/ConfigDiff";
import { useActiveConfig, useDraftConfig, useSaveDraft, useValidateDraft } from "@/hooks/queries";
import type { FullRuntimeConfig, SaveDraftInput } from "@/lib/api/types";
import { AgentConfigList, TradingConfigForm, UniverseConfigForm } from "./components/index";

type TabType = "trading" | "agents" | "universe";

interface ValidationResult {
	valid: boolean;
	errors: { field: string; message: string }[];
	warnings: string[];
}

export default function ConfigEditPage() {
	const router = useRouter();
	const { data: draftConfig, isLoading: draftLoading } = useDraftConfig();
	const { data: activeConfig, isLoading: activeLoading } = useActiveConfig();
	const saveDraft = useSaveDraft();
	const validateDraft = useValidateDraft();

	const [activeTab, setActiveTab] = useState<TabType>("trading");
	const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
	const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

	const handleSave = useCallback(
		async (updates: SaveDraftInput) => {
			await saveDraft.mutateAsync(updates);
			setHasUnsavedChanges(false);
		},
		[saveDraft],
	);

	const handleValidate = useCallback(async () => {
		const result = await validateDraft.mutateAsync();
		setValidationResult(result);
		return result;
	}, [validateDraft]);

	const isLoading = draftLoading || activeLoading;

	if (isLoading) {
		return <LoadingSkeleton />;
	}

	if (!draftConfig) {
		return <NoDraftMessage />;
	}

	return (
		<div className="space-y-6">
			<PageHeader
				hasUnsavedChanges={hasUnsavedChanges}
				isValidating={validateDraft.isPending}
				onBack={() => router.back()}
				onValidate={handleValidate}
				onPromote={() => router.push("/config/promote")}
			/>

			{validationResult && <ValidationResultBanner result={validationResult} />}

			<TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />

			<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
				{activeTab === "trading" && (
					<TradingConfigForm
						config={draftConfig.trading}
						onSave={(updates) => {
							handleSave({ trading: updates });
							setHasUnsavedChanges(false);
						}}
						onChange={() => setHasUnsavedChanges(true)}
						isSaving={saveDraft.isPending}
					/>
				)}
				{activeTab === "agents" && (
					<AgentConfigList
						agents={draftConfig.agents}
						onSave={(agentType, updates) => {
							handleSave({ agents: { [agentType]: updates } });
							setHasUnsavedChanges(false);
						}}
						onChange={() => setHasUnsavedChanges(true)}
						isSaving={saveDraft.isPending}
					/>
				)}
				{activeTab === "universe" && (
					<UniverseConfigForm
						config={draftConfig.universe}
						onSave={(updates) => {
							handleSave({ universe: updates });
							setHasUnsavedChanges(false);
						}}
						onChange={() => setHasUnsavedChanges(true)}
						isSaving={saveDraft.isPending}
					/>
				)}
			</div>

			<DiffPanel activeConfig={activeConfig} draftConfig={draftConfig} />
		</div>
	);
}

function LoadingSkeleton() {
	return (
		<div className="space-y-6">
			<div className="h-12 bg-cream-100 dark:bg-night-700 rounded-lg animate-pulse" />
			<div className="h-96 bg-cream-100 dark:bg-night-700 rounded-lg animate-pulse" />
		</div>
	);
}

function NoDraftMessage() {
	return (
		<div className="text-center py-12">
			<p className="text-stone-500 dark:text-night-300">
				No draft configuration found. Please ensure the system is properly initialized.
			</p>
		</div>
	);
}

interface PageHeaderProps {
	hasUnsavedChanges: boolean;
	isValidating: boolean;
	onBack: () => void;
	onValidate: () => void;
	onPromote: () => void;
}

function PageHeader({
	hasUnsavedChanges,
	isValidating,
	onBack,
	onValidate,
	onPromote,
}: PageHeaderProps) {
	return (
		<div className="flex items-center justify-between">
			<div className="flex items-center gap-4">
				<button
					type="button"
					onClick={onBack}
					className="p-2 text-stone-500 dark:text-night-300 hover:text-stone-700 dark:text-night-100 dark:text-night-400 dark:hover:text-night-100"
					aria-label="Go back"
				>
					<BackIcon />
				</button>
				<div>
					<h1 className="text-2xl font-semibold text-stone-900 dark:text-night-50">
						Edit Configuration
					</h1>
					<p className="text-sm text-stone-500 dark:text-night-300">
						Changes don't affect the running system until promoted
					</p>
				</div>
			</div>
			<div className="flex items-center gap-3">
				{hasUnsavedChanges && (
					<span className="text-sm text-amber-600 dark:text-amber-400">Unsaved changes</span>
				)}
				<span className="px-3 py-1 text-sm font-medium rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
					Draft
				</span>
				<button
					type="button"
					onClick={onValidate}
					disabled={isValidating}
					className="px-4 py-2 text-sm font-medium text-stone-700 dark:text-night-100 dark:text-night-200 bg-cream-100 dark:bg-night-700 rounded-md hover:bg-cream-200 dark:hover:bg-night-600 disabled:opacity-50"
				>
					{isValidating ? "Validating..." : "Validate"}
				</button>
				<button
					type="button"
					onClick={onPromote}
					className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
				>
					Promote &rarr;
				</button>
			</div>
		</div>
	);
}

function BackIcon() {
	return (
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
	);
}

interface ValidationResultBannerProps {
	result: ValidationResult;
}

function ValidationResultBanner({ result }: ValidationResultBannerProps) {
	const isValid = result.valid;

	return (
		<div
			className={`p-4 rounded-lg border ${
				isValid
					? "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800"
					: "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800"
			}`}
		>
			<div className="flex items-center gap-2">
				{isValid ? <SuccessIcon /> : <ErrorIcon />}
				<span
					className={`font-medium ${
						isValid ? "text-emerald-800 dark:text-emerald-300" : "text-red-800 dark:text-red-300"
					}`}
				>
					{isValid ? "Valid - Ready to promote" : `${result.errors.length} error(s) found`}
				</span>
			</div>
			{result.errors.length > 0 && (
				<ul className="mt-2 space-y-1 text-sm text-red-700 dark:text-red-400">
					{result.errors.map((err) => (
						<li key={`${err.field}-${err.message}`}>
							<strong>{err.field}:</strong> {err.message}
						</li>
					))}
				</ul>
			)}
			{result.warnings.length > 0 && (
				<ul className="mt-2 space-y-1 text-sm text-amber-700 dark:text-amber-400">
					{result.warnings.map((warning) => (
						<li key={warning}>{warning}</li>
					))}
				</ul>
			)}
		</div>
	);
}

function SuccessIcon() {
	return (
		<svg
			className="w-5 h-5 text-emerald-600"
			fill="currentColor"
			viewBox="0 0 20 20"
			aria-hidden="true"
		>
			<path
				fillRule="evenodd"
				d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
				clipRule="evenodd"
			/>
		</svg>
	);
}

function ErrorIcon() {
	return (
		<svg
			className="w-5 h-5 text-red-600"
			fill="currentColor"
			viewBox="0 0 20 20"
			aria-hidden="true"
		>
			<path
				fillRule="evenodd"
				d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
				clipRule="evenodd"
			/>
		</svg>
	);
}

interface TabNavigationProps {
	activeTab: TabType;
	onTabChange: (tab: TabType) => void;
}

function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
	const tabs: TabType[] = ["trading", "agents", "universe"];

	return (
		<div className="border-b border-cream-200 dark:border-night-700">
			<nav className="flex gap-4" aria-label="Config sections">
				{tabs.map((tab) => (
					<button
						key={tab}
						type="button"
						onClick={() => onTabChange(tab)}
						className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
							activeTab === tab
								? "border-blue-500 text-blue-600 dark:text-blue-400"
								: "border-transparent text-stone-500 dark:text-night-300 hover:text-stone-700 dark:text-night-100 dark:text-night-400 dark:hover:text-night-100"
						}`}
					>
						{tab.charAt(0).toUpperCase() + tab.slice(1)}
					</button>
				))}
			</nav>
		</div>
	);
}

interface DiffPanelProps {
	activeConfig: FullRuntimeConfig | undefined;
	draftConfig: FullRuntimeConfig;
}

function DiffPanel({ activeConfig, draftConfig }: DiffPanelProps) {
	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
			<h3 className="text-lg font-medium text-stone-900 dark:text-night-50 mb-4">
				Changes from Active
			</h3>
			{activeConfig ? (
				<ConfigDiff before={activeConfig as unknown as FullRuntimeConfig} after={draftConfig} />
			) : (
				<p className="text-stone-500 dark:text-night-300">
					No active configuration to compare against
				</p>
			)}
		</div>
	);
}
