"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfigDiff } from "@/components/config/ConfigDiff";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useRollbackConfig, useRuntimeConfigHistory } from "@/hooks/queries";
import type { ConfigHistoryEntry, Environment, FullRuntimeConfig } from "@/lib/api/types";

export default function ConfigHistoryPage() {
	const router = useRouter();
	const [environment] = useState<Environment>("PAPER");
	const { data: history, isLoading, error } = useRuntimeConfigHistory(environment, 50);
	const rollbackMutation = useRollbackConfig(environment);

	const [selectedVersions, setSelectedVersions] = useState<[string, string] | null>(null);
	const [rollbackTarget, setRollbackTarget] = useState<ConfigHistoryEntry | null>(null);

	const handleCompare = (versionId: string, previousVersionId: string | undefined) => {
		if (previousVersionId) {
			setSelectedVersions([versionId, previousVersionId]);
		}
	};

	const handleRollback = async () => {
		if (!rollbackTarget) {
			return;
		}

		try {
			await rollbackMutation.mutateAsync(rollbackTarget.id);
			setRollbackTarget(null);
			router.push("/config");
		} catch {
			// Mutation's error state handles display
		}
	};

	const getVersionConfig = (versionId: string): FullRuntimeConfig | null => {
		const version = history?.find((v) => v.id === versionId);
		return version?.config ?? null;
	};

	if (isLoading) {
		return (
			<div className="space-y-6">
				<div className="h-12 bg-cream-100 dark:bg-night-700 rounded-lg animate-pulse" />
				{[1, 2, 3].map((i) => (
					<div key={i} className="h-32 bg-cream-100 dark:bg-night-700 rounded-lg animate-pulse" />
				))}
			</div>
		);
	}

	if (error) {
		return (
			<div className="text-center py-12">
				<p className="text-red-600 dark:text-red-400">Failed to load configuration history</p>
				<p className="text-sm text-stone-500 dark:text-night-300 mt-2">
					{error instanceof Error ? error.message : "Unknown error"}
				</p>
			</div>
		);
	}

	if (!history || history.length === 0) {
		return (
			<div className="space-y-6">
				<PageHeader onBack={() => router.back()} />
				<div className="text-center py-12 bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
					<HistoryIcon className="w-12 h-12 text-cream-300 dark:text-stone-600 dark:text-night-200 mx-auto mb-4" />
					<p className="text-stone-500 dark:text-night-300">No configuration history available</p>
					<p className="text-sm text-stone-400 dark:text-night-400 mt-2">
						Configuration changes will appear here after you promote a draft.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<PageHeader onBack={() => router.back()} />

			<div className="relative">
				<div className="absolute left-6 top-0 bottom-0 w-px bg-cream-200 dark:bg-night-600" />

				<div className="space-y-4">
					{history.map((version, index) => (
						<ConfigVersionCard
							key={version.id}
							version={version}
							previousVersionId={history[index + 1]?.id}
							onCompare={() => handleCompare(version.id, history[index + 1]?.id)}
							onRollback={() => setRollbackTarget(version)}
						/>
					))}
				</div>
			</div>

			{selectedVersions && (
				<ComparisonDialog
					open={!!selectedVersions}
					onClose={() => setSelectedVersions(null)}
					beforeConfig={getVersionConfig(selectedVersions[1])}
					afterConfig={getVersionConfig(selectedVersions[0])}
					beforeVersion={history?.find((v) => v.id === selectedVersions[1])?.version}
					afterVersion={history?.find((v) => v.id === selectedVersions[0])?.version}
				/>
			)}

			{rollbackTarget && (
				<Dialog open={!!rollbackTarget} onOpenChange={() => setRollbackTarget(null)}>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Rollback Configuration</DialogTitle>
							<DialogDescription>
								Are you sure you want to rollback to version {rollbackTarget.version}? This will
								immediately update the active configuration.
							</DialogDescription>
						</DialogHeader>
						<div className="px-6 py-4 text-sm text-stone-600 dark:text-night-200 dark:text-night-400">
							<p>
								<strong>Version:</strong> {rollbackTarget.version}
							</p>
							<p>
								<strong>Created:</strong> {formatDate(rollbackTarget.createdAt)}
							</p>
							{rollbackTarget.createdBy && (
								<p>
									<strong>By:</strong> {rollbackTarget.createdBy}
								</p>
							)}
						</div>
						<DialogFooter>
							<DialogClose>Cancel</DialogClose>
							<button
								type="button"
								onClick={handleRollback}
								disabled={rollbackMutation.isPending}
								className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-md hover:bg-amber-700 disabled:opacity-50"
							>
								{rollbackMutation.isPending ? "Rolling back..." : "Confirm Rollback"}
							</button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			)}
		</div>
	);
}

function PageHeader({ onBack }: { onBack: () => void }) {
	return (
		<div className="flex items-center gap-4">
			<button
				type="button"
				onClick={onBack}
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
					Configuration History
				</h1>
				<p className="text-sm text-stone-500 dark:text-night-300">
					View past configurations and rollback if needed
				</p>
			</div>
		</div>
	);
}

interface ConfigVersionCardProps {
	version: ConfigHistoryEntry;
	previousVersionId?: string;
	onCompare: () => void;
	onRollback: () => void;
}

function ConfigVersionCard({
	version,
	previousVersionId,
	onCompare,
	onRollback,
}: ConfigVersionCardProps) {
	return (
		<div className="relative pl-12">
			<div
				className={`absolute left-4 top-6 w-4 h-4 rounded-full border-2 ${
					version.isActive
						? "bg-emerald-500 border-emerald-300 dark:border-emerald-700"
						: "bg-white dark:bg-night-800 border-cream-300 dark:border-night-500"
				}`}
			/>

			<div
				className={`bg-white dark:bg-night-800 rounded-lg border p-4 ${
					version.isActive
						? "border-emerald-300 dark:border-emerald-700 ring-1 ring-emerald-100 dark:ring-emerald-900/30"
						: "border-cream-200 dark:border-night-700"
				}`}
			>
				<div className="flex items-start justify-between">
					<div>
						<div className="flex items-center gap-2">
							<h3 className="text-lg font-medium text-stone-900 dark:text-night-50">
								Version {version.version}
							</h3>
							{version.isActive && (
								<span className="px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-full">
									Active
								</span>
							)}
						</div>
						<p className="text-sm text-stone-500 dark:text-night-300 mt-1">
							{formatDate(version.createdAt)}
							{version.createdBy && ` by ${version.createdBy}`}
						</p>
					</div>

					<div className="flex gap-2">
						{previousVersionId && (
							<button
								type="button"
								onClick={onCompare}
								className="px-3 py-1.5 text-sm font-medium text-stone-600 dark:text-night-200 dark:text-night-300 bg-cream-100 dark:bg-night-700 rounded-md hover:bg-cream-200 dark:hover:bg-night-600"
							>
								Compare
							</button>
						)}
						{!version.isActive && (
							<button
								type="button"
								onClick={onRollback}
								className="px-3 py-1.5 text-sm font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-md hover:bg-amber-100 dark:hover:bg-amber-900/30"
							>
								Rollback
							</button>
						)}
					</div>
				</div>

				{version.changedFields.length > 0 && (
					<div className="mt-3 pt-3 border-t border-cream-100 dark:border-night-700">
						<p className="text-sm text-stone-600 dark:text-night-200 dark:text-night-400">
							{version.changedFields.length} field{version.changedFields.length !== 1 ? "s" : ""}{" "}
							changed
						</p>
						<div className="mt-1 flex flex-wrap gap-1">
							{version.changedFields.slice(0, 5).map((field) => (
								<span
									key={field}
									className="px-2 py-0.5 text-xs bg-cream-100 dark:bg-night-700 text-stone-600 dark:text-night-200 dark:text-night-400 rounded"
								>
									{field}
								</span>
							))}
							{version.changedFields.length > 5 && (
								<span className="px-2 py-0.5 text-xs text-stone-500 dark:text-night-300 dark:text-stone-500 dark:text-night-300">
									+{version.changedFields.length - 5} more
								</span>
							)}
						</div>
					</div>
				)}

				{version.description && (
					<p className="mt-2 text-sm text-stone-600 dark:text-night-200 dark:text-night-400 italic">
						{version.description}
					</p>
				)}
			</div>
		</div>
	);
}

interface ComparisonDialogProps {
	open: boolean;
	onClose: () => void;
	beforeConfig: FullRuntimeConfig | null;
	afterConfig: FullRuntimeConfig | null;
	beforeVersion?: number;
	afterVersion?: number;
}

function ComparisonDialog({
	open,
	onClose,
	beforeConfig,
	afterConfig,
	beforeVersion,
	afterVersion,
}: ComparisonDialogProps) {
	if (!beforeConfig || !afterConfig) {
		return null;
	}

	return (
		<Dialog open={open} onOpenChange={onClose}>
			<DialogContent maxWidth="max-w-4xl">
				<DialogHeader>
					<DialogTitle>
						Compare Version {beforeVersion} &rarr; Version {afterVersion}
					</DialogTitle>
					<DialogDescription>
						Review the configuration changes between these versions.
					</DialogDescription>
				</DialogHeader>
				<div className="px-6 py-4 max-h-[60vh] overflow-auto">
					<ConfigDiff before={beforeConfig} after={afterConfig} />
				</div>
				<DialogFooter>
					<DialogClose>Close</DialogClose>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ============================================
// Helper Functions
// ============================================

function formatDate(dateString: string): string {
	const date = new Date(dateString);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);

	if (diffMins < 1) {
		return "Just now";
	}
	if (diffMins < 60) {
		return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
	}
	if (diffHours < 24) {
		return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
	}
	if (diffDays < 7) {
		return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
	}

	return date.toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

// ============================================
// Icons
// ============================================

function HistoryIcon({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			strokeWidth={1.5}
			aria-hidden="true"
		>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
			/>
		</svg>
	);
}
