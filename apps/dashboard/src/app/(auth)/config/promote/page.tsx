"use client";

/**
 * Config Promote Page
 *
 * Test draft config in PAPER mode, then promote to LIVE.
 * Three-step workflow: Review → Test → Promote
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfigDiff } from "@/components/config/ConfigDiff";
import {
	useActiveConfig,
	useDraftConfig,
	usePromoteDraft,
	useTriggerCycle,
	useValidateDraft,
} from "@/hooks/queries";
import { useCycleProgress } from "@/hooks/useCycleProgress";
import type { CycleResult, Environment, FullRuntimeConfig } from "@/lib/api/types";

export default function ConfigPromotePage() {
	const router = useRouter();
	const { data: activeConfig, isLoading: activeLoading } = useActiveConfig();
	const { data: draftConfig, isLoading: draftLoading } = useDraftConfig();
	const validateDraft = useValidateDraft();
	const promoteDraft = usePromoteDraft();
	const triggerCycle = useTriggerCycle();

	const [testResult, setTestResult] = useState<CycleResult | null>(null);
	const [showLiveConfirm, setShowLiveConfirm] = useState(false);
	const [validationResult, setValidationResult] = useState<{
		valid: boolean;
		errors: { field: string; message: string }[];
		warnings: string[];
	} | null>(null);

	// Subscribe to cycle progress
	const {
		status: cycleStatus,
		progress: cycleProgress,
		result: cycleResult,
		currentStep,
	} = useCycleProgress(triggerCycle.data?.cycleId ?? null);

	const isTestInProgress = triggerCycle.isPending || cycleStatus === "running";

	const handleValidate = async () => {
		const result = await validateDraft.mutateAsync();
		setValidationResult(result);
		return result;
	};

	const handleTestInPaper = async () => {
		const validation = await handleValidate();
		if (!validation.valid) {
			return;
		}

		await triggerCycle.mutateAsync({
			environment: "PAPER",
			useDraftConfig: true,
		});
	};

	const handlePromote = async (environment: Environment) => {
		if (environment === "LIVE") {
			setShowLiveConfirm(true);
			return;
		}

		await promoteDraft.mutateAsync();
		router.push("/config");
	};

	const handleLivePromotion = async () => {
		await promoteDraft.mutateAsync();
		setShowLiveConfirm(false);
		router.push("/config");
	};

	const isLoading = activeLoading || draftLoading;
	const canPromoteToPaper = validationResult?.valid ?? false;
	const canPromoteToLive =
		canPromoteToPaper && testResult?.status === "completed" && !testResult.error;

	if (cycleStatus === "completed" && cycleResult && !testResult) {
		setTestResult(cycleResult);
	}

	if (isLoading) {
		return (
			<div className="space-y-6">
				<div className="h-12 bg-cream-100 dark:bg-night-700 rounded-lg animate-pulse" />
				<div className="h-64 bg-cream-100 dark:bg-night-700 rounded-lg animate-pulse" />
			</div>
		);
	}

	if (!draftConfig || !activeConfig) {
		return (
			<div className="text-center py-12">
				<p className="text-stone-500 dark:text-night-300">
					Configuration not available. Please ensure the system is properly initialized.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<button
						type="button"
						onClick={() => router.back()}
						className="p-2 text-stone-500 dark:text-night-300 hover:text-stone-700 dark:text-night-100 dark:text-night-400 dark:hover:text-night-100"
						aria-label="Go back"
					>
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
					</button>
					<div>
						<h1 className="text-2xl font-semibold text-stone-900 dark:text-night-50">
							Promote Configuration
						</h1>
						<p className="text-sm text-stone-500 dark:text-night-300">
							Test draft config in PAPER, then promote to LIVE
						</p>
					</div>
				</div>
			</div>

			<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
				<div className="flex items-center gap-3 mb-4">
					<span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-sm font-medium">
						1
					</span>
					<h2 className="text-lg font-medium text-stone-900 dark:text-night-50">
						Review Draft Changes
					</h2>
				</div>

				<ConfigDiff before={activeConfig as unknown as FullRuntimeConfig} after={draftConfig} />

				<div className="mt-4 flex items-center justify-between">
					<Link
						href="/config/edit"
						className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
					>
						Edit Draft &rarr;
					</Link>
					<button
						type="button"
						onClick={handleValidate}
						disabled={validateDraft.isPending}
						className="px-4 py-2 text-sm font-medium text-stone-700 dark:text-night-100 dark:text-night-200 bg-cream-100 dark:bg-night-700 rounded-md hover:bg-cream-200 dark:hover:bg-night-600 disabled:opacity-50"
					>
						{validateDraft.isPending ? "Validating..." : "Validate Config"}
					</button>
				</div>

				{validationResult && (
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
				)}
			</div>

			<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
				<div className="flex items-center gap-3 mb-4">
					<span
						className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
							canPromoteToPaper
								? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
								: "bg-cream-100 dark:bg-night-700 text-stone-400 dark:text-night-400"
						}`}
					>
						2
					</span>
					<h2 className="text-lg font-medium text-stone-900 dark:text-night-50">
						Test in PAPER Mode
					</h2>
				</div>

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
			</div>

			<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
				<div className="flex items-center gap-3 mb-4">
					<span
						className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
							canPromoteToLive
								? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
								: "bg-cream-100 dark:bg-night-700 text-stone-400 dark:text-night-400"
						}`}
					>
						3
					</span>
					<h2 className="text-lg font-medium text-stone-900 dark:text-night-50">
						Promote to Environment
					</h2>
				</div>

				<div className="flex flex-col sm:flex-row gap-4">
					<button
						type="button"
						onClick={() => handlePromote("PAPER")}
						disabled={!canPromoteToPaper || promoteDraft.isPending}
						className="px-6 py-3 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
					>
						{promoteDraft.isPending ? "Promoting..." : "Promote to PAPER (Activate)"}
					</button>

					<button
						type="button"
						onClick={() => handlePromote("LIVE")}
						disabled={!canPromoteToLive || promoteDraft.isPending}
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
			</div>

			{showLiveConfirm && (
				<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
					<div className="bg-white dark:bg-night-800 rounded-lg p-6 max-w-md mx-4 shadow-xl">
						<h3 className="text-lg font-semibold text-stone-900 dark:text-night-50 mb-2">
							Confirm LIVE Promotion
						</h3>
						<p className="text-stone-600 dark:text-night-200 dark:text-night-400 mb-6">
							This will immediately affect production trading. All active positions and pending
							orders will be managed with the new configuration. Are you sure you want to proceed?
						</p>
						<div className="flex gap-3 justify-end">
							<button
								type="button"
								onClick={() => setShowLiveConfirm(false)}
								className="px-4 py-2 text-sm font-medium text-stone-700 dark:text-night-100 dark:text-night-200 bg-cream-100 dark:bg-night-700 rounded-md hover:bg-cream-200 dark:hover:bg-night-600"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleLivePromotion}
								disabled={promoteDraft.isPending}
								className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
							>
								{promoteDraft.isPending ? "Promoting..." : "Confirm Promotion"}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

function TestResultDisplay({ result }: { result: CycleResult }) {
	const formatDuration = (ms: number) => {
		if (ms < 1000) {
			return `${ms}ms`;
		}
		return `${(ms / 1000).toFixed(1)}s`;
	};

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

// ============================================
// Helper Components
// ============================================

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<div className="text-xs text-stone-500 dark:text-night-300">{label}</div>
			<div className="text-lg font-semibold text-stone-900 dark:text-night-50">{value}</div>
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
				d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
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
				d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
				clipRule="evenodd"
			/>
		</svg>
	);
}
