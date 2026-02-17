"use client";

import Link from "next/link";
import { ConfigDiff } from "@/components/config/ConfigDiff";
import type { CycleResult, FullRuntimeConfig } from "@/lib/api/types";
import type { PromoteFlowHookReturn, ValidationResult } from "./promote-page-state";

interface StepIndicatorProps {
	step: number;
	children: React.ReactNode;
}

interface DraftSectionProps {
	activeConfig: FullRuntimeConfig;
	draftConfig: FullRuntimeConfig;
	validationResult: ValidationResult | null;
	handleValidate: () => Promise<ValidationResult | null>;
	isValidating: boolean;
	validateDraftPending: boolean;
}

interface TestSectionProps {
	canPromoteToPaper: boolean;
	isTestInProgress: boolean;
	handleTestInPaper: () => void;
	cycleProgress: ReturnType<
		typeof import("@/hooks/useCycleProgress")["useCycleProgress"]
	>["progress"];
	currentStep: ReturnType<
		typeof import("@/hooks/useCycleProgress")["useCycleProgress"]
	>["currentStep"];
	testResult: CycleResult | null;
}

interface PromotionSectionProps {
	canPromoteToPaper: boolean;
	canPromoteToLive: boolean;
	promoteDraftPending: boolean;
	onPromote: (environment: "PAPER" | "LIVE") => void;
}

interface LivePromotionDialogProps {
	show: boolean;
	isPending: boolean;
	onCancel: () => void;
	onConfirm: () => void;
}

interface PromotePageContentProps {
	state: PromoteFlowHookReturn;
	onCancelLiveConfirm: () => void;
	onConfirmLiveConfirm: () => void;
}

function StepIndicator({ step, children }: StepIndicatorProps) {
	return (
		<div className="flex items-center gap-3 mb-4">
			<span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-sm font-medium">
				{step}
			</span>
			<h2 className="text-lg font-medium text-stone-900 dark:text-night-50">{children}</h2>
		</div>
	);
}

function ValidationSummary({ validationResult }: { validationResult: ValidationResult }) {
	return (
		<div
			className={`mt-4 p-4 rounded-lg border ${
				validationResult.valid
					? "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800"
					: "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800"
			}`}
		>
			<div className="flex items-center gap-2">
				{validationResult.valid ? (
					<>
						<CheckIcon className="text-emerald-600" />
						<span className="font-medium text-emerald-800 dark:text-emerald-300">
							Valid - Ready to test
						</span>
					</>
				) : (
					<>
						<XIcon className="text-red-600" />
						<span className="font-medium text-red-800 dark:text-red-300">
							{validationResult.errors.length} error(s) found
						</span>
					</>
				)}
			</div>
			{validationResult.errors.length > 0 && (
				<ul className="mt-2 space-y-1 text-sm text-red-700 dark:text-red-400">
					{validationResult.errors.map((err) => (
						<li key={err.field}>
							<strong>{err.field}:</strong> {err.message}
						</li>
					))}
				</ul>
			)}
			{validationResult.warnings.length > 0 && (
				<ul className="mt-2 space-y-1 text-sm text-amber-700 dark:text-amber-400">
					{validationResult.warnings.map((warning) => (
						<li key={warning}>{warning}</li>
					))}
				</ul>
			)}
		</div>
	);
}

function Header() {
	return (
		<div className="flex items-center justify-between">
			<div className="flex items-center gap-4">
				<h1 className="text-2xl font-semibold text-stone-900 dark:text-night-50">
					Promote Configuration
				</h1>
				<p className="text-sm text-stone-500 dark:text-night-300">
					Test draft config in PAPER, then promote to LIVE
				</p>
			</div>
		</div>
	);
}

function DraftSection({
	activeConfig,
	draftConfig,
	validationResult,
	handleValidate,
	isValidating,
	validateDraftPending,
}: DraftSectionProps) {
	return (
		<section className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
			<StepIndicator step={1}>Review Draft Changes</StepIndicator>
			<ConfigDiff before={activeConfig} after={draftConfig} />
			<div className="mt-4 flex items-center justify-between">
				<Link
					href="/config/edit"
					className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
				>
					Edit Draft →
				</Link>
				<button
					type="button"
					onClick={handleValidate}
					disabled={validateDraftPending}
					className="px-4 py-2 text-sm font-medium text-stone-700 dark:text-night-100 dark:text-night-200 bg-cream-100 dark:bg-night-700 rounded-md hover:bg-cream-200 dark:hover:bg-night-600 disabled:opacity-50"
				>
					{isValidating ? "Validating..." : "Validate Draft"}
				</button>
			</div>
			{validationResult && <ValidationSummary validationResult={validationResult} />}
		</section>
	);
}

function formatDuration(ms: number) {
	if (ms < 1000) {
		return `${ms}ms`;
	}
	return `${(ms / 1000).toFixed(1)}s`;
}

function TestResultDisplay({ result }: { result: CycleResult }) {
	return (
		<div className="mt-4 p-4 border border-cream-200 dark:border-night-700 rounded-lg">
			<div className="flex items-center gap-2 mb-4">
				{result.status === "completed" && !result.error ? (
					<>
						<CheckIcon className="text-emerald-600" />
						<span className="font-medium text-emerald-800 dark:text-emerald-300">Test Passed</span>
					</>
				) : (
					<>
						<XIcon className="text-red-600" />
						<span className="font-medium text-red-800 dark:text-red-300">Test Failed</span>
					</>
				)}
			</div>
			<div className="grid grid-cols-2 gap-4">
				<Stat label="Duration" value={formatDuration(result.durationMs)} />
				<Stat label="Decisions" value={(result.result?.decisions.length ?? 0).toString()} />
				<Stat label="Orders" value={(result.result?.orders.length ?? 0).toString()} />
				<Stat label="Iterations" value={(result.result?.iterations ?? 0).toString()} />
			</div>
			{result.error && (
				<div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
					<p className="text-sm text-red-700 dark:text-red-400">{result.error}</p>
				</div>
			)}
		</div>
	);
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<div className="text-xs text-stone-500 dark:text-night-300">{label}</div>
			<div className="text-lg font-semibold text-stone-900 dark:text-night-50">{value}</div>
		</div>
	);
}

function TestSection({
	canPromoteToPaper,
	isTestInProgress,
	handleTestInPaper,
	cycleProgress,
	currentStep,
	testResult,
}: TestSectionProps) {
	return (
		<section className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
			<StepIndicator step={2}>Test in PAPER Mode</StepIndicator>
			<p className="text-sm text-stone-500 dark:text-night-300 mb-4">
				Run a trading cycle with draft config to validate behavior before promoting.
			</p>
			<button
				type="button"
				onClick={handleTestInPaper}
				disabled={!canPromoteToPaper || isTestInProgress}
				className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
			>
				{isTestInProgress ? "Running Test..." : "Run Paper Test"}
			</button>
			{cycleProgress && (
				<div className="mt-4 p-4 border border-cream-200 dark:border-night-700 rounded-lg">
					<div className="flex items-center justify-between mb-2">
						<span className="text-sm font-medium text-stone-900 dark:text-night-50">
							Phase: {cycleProgress.phase}
						</span>
						<span className="text-sm text-stone-500 dark:text-night-300">
							{Math.round(cycleProgress.progress)}%
						</span>
					</div>
					<div className="w-full bg-cream-200 dark:bg-night-600 rounded-full h-2">
						<div
							className="bg-blue-600 h-2 rounded-full transition-all duration-300"
							style={{ width: `${Math.min(cycleProgress.progress, 100)}%` }}
						/>
					</div>
					{currentStep && (
						<p className="mt-2 text-xs text-stone-500 dark:text-night-300">{currentStep}</p>
					)}
				</div>
			)}
			{testResult && <TestResultDisplay result={testResult} />}
		</section>
	);
}

function PromotionSection({
	canPromoteToPaper,
	canPromoteToLive,
	promoteDraftPending,
	onPromote,
}: PromotionSectionProps) {
	return (
		<section className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
			<StepIndicator step={3}>Promote to Environment</StepIndicator>
			<div className="flex flex-col sm:flex-row gap-4">
				<button
					type="button"
					onClick={() => onPromote("PAPER")}
					disabled={!canPromoteToPaper || promoteDraftPending}
					className="px-6 py-3 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
				>
					{promoteDraftPending ? "Promoting..." : "Promote to PAPER (Activate)"}
				</button>
				<button
					type="button"
					onClick={() => onPromote("LIVE")}
					disabled={!canPromoteToLive || promoteDraftPending}
					className="px-6 py-3 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
				>
					Promote to LIVE
				</button>
			</div>
			{!canPromoteToPaper && (
				<p className="mt-4 text-sm text-stone-500 dark:text-night-300">
					Validate the configuration first to enable promotion.
				</p>
			)}
			{canPromoteToPaper && !canPromoteToLive && (
				<p className="mt-4 text-sm text-stone-500 dark:text-night-300">
					Run and pass a paper test before promoting to LIVE.
				</p>
			)}
		</section>
	);
}

function LivePromotionDialog({ show, isPending, onCancel, onConfirm }: LivePromotionDialogProps) {
	if (!show) {
		return null;
	}

	return (
		<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
			<div className="bg-white dark:bg-night-800 rounded-lg p-6 max-w-md mx-4 shadow-xl">
				<h3 className="text-lg font-semibold text-stone-900 dark:text-night-50 mb-2">
					Confirm LIVE Promotion
				</h3>
				<p className="text-stone-600 dark:text-night-200 mb-6">
					This will immediately affect production trading. All active positions and pending orders
					will be managed with the new configuration. Are you sure you want to proceed?
				</p>
				<div className="flex gap-3 justify-end">
					<button
						type="button"
						onClick={onCancel}
						className="px-4 py-2 text-sm font-medium text-stone-700 dark:text-night-100 dark:text-night-200 bg-cream-100 dark:bg-night-700 rounded-md hover:bg-cream-200 dark:hover:bg-night-600"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={onConfirm}
						disabled={isPending}
						className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
					>
						{isPending ? "Promoting..." : "Confirm Promotion"}
					</button>
				</div>
			</div>
		</div>
	);
}

function isPromoteFlowReady(state: PromoteFlowHookReturn): state is PromoteFlowHookReturn & {
	activeConfig: FullRuntimeConfig;
	draftConfig: FullRuntimeConfig;
} {
	return Boolean(state.activeConfig && state.draftConfig);
}

function PromotionFlowSections({
	state,
	onCancelLiveConfirm,
	onConfirmLiveConfirm,
}: {
	state: PromoteFlowHookReturn & {
		activeConfig: FullRuntimeConfig;
		draftConfig: FullRuntimeConfig;
	};
	onCancelLiveConfirm: () => void;
	onConfirmLiveConfirm: () => void;
}) {
	return (
		<div className="space-y-6">
			<Header />
			<DraftSection
				activeConfig={state.activeConfig}
				draftConfig={state.draftConfig}
				validationResult={state.validationResult}
				handleValidate={state.handleValidate}
				isValidating={state.validateDraftPending || state.isTestInProgress}
				validateDraftPending={state.validateDraftPending}
			/>
			<TestSection
				canPromoteToPaper={state.canPromoteToPaper}
				isTestInProgress={state.isTestInProgress}
				handleTestInPaper={state.handleTestInPaper}
				cycleProgress={state.cycleProgress}
				currentStep={state.currentStep}
				testResult={state.testResult}
			/>
			<PromotionSection
				canPromoteToPaper={state.canPromoteToPaper}
				canPromoteToLive={state.canPromoteToLive}
				promoteDraftPending={state.promoteDraftPending}
				onPromote={state.handlePromote}
			/>
			<LivePromotionDialog
				show={state.showLiveConfirm}
				isPending={state.promoteDraftPending}
				onCancel={onCancelLiveConfirm}
				onConfirm={onConfirmLiveConfirm}
			/>
		</div>
	);
}

function PromotePageLoadingState() {
	return (
		<div className="space-y-6">
			<div className="h-12 bg-cream-100 dark:bg-night-700 rounded-lg animate-pulse" />
			<div className="h-64 bg-cream-100 dark:bg-night-700 rounded-lg animate-pulse" />
		</div>
	);
}

function PromotePageUnavailableState() {
	return (
		<div className="text-center py-12">
			<p className="text-stone-500 dark:text-night-300">
				Configuration not available. Please ensure the system is properly initialized.
			</p>
		</div>
	);
}

function CheckIcon({ className }: { className?: string }) {
	return (
		<svg
			className={`w-5 h-5 ${className}`}
			fill="currentColor"
			viewBox="0 0 20 20"
			aria-hidden="true"
		>
			<path
				fillRule="evenodd"
				d="M10 18a8 8 0 100-16 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
				clipRule="evenodd"
			/>
		</svg>
	);
}

function XIcon({ className }: { className?: string }) {
	return (
		<svg
			className={`w-5 h-5 ${className}`}
			fill="currentColor"
			viewBox="0 0 20 20"
			aria-hidden="true"
		>
			<path
				fillRule="evenodd"
				d="M10 18a8 8 0 100-16 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
				clipRule="evenodd"
			/>
		</svg>
	);
}

export function PromotePageContent({
	state,
	onCancelLiveConfirm,
	onConfirmLiveConfirm,
}: PromotePageContentProps) {
	const isLoading = state.isLoading;
	const isReady = isPromoteFlowReady(state);

	if (isLoading) {
		return <PromotePageLoadingState />;
	}

	if (!isReady) {
		return <PromotePageUnavailableState />;
	}

	return (
		<PromotionFlowSections
			state={state}
			onCancelLiveConfirm={onCancelLiveConfirm}
			onConfirmLiveConfirm={onConfirmLiveConfirm}
		/>
	);
}
