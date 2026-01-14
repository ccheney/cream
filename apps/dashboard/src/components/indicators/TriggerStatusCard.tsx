/**
 * Trigger Status Card
 *
 * Displays the current state of indicator generation triggers.
 */

import type { TriggerStatus } from "@/hooks/queries";

interface TriggerStatusCardProps {
	status: TriggerStatus | undefined;
	isLoading: boolean;
	onTriggerCheck?: () => void;
}

export function TriggerStatusCard({ status, isLoading, onTriggerCheck }: TriggerStatusCardProps) {
	if (isLoading) {
		return (
			<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
				<div className="h-6 w-32 bg-cream-100 dark:bg-night-700 rounded animate-pulse mb-4" />
				<div className="space-y-3">
					<div className="h-4 w-48 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
					<div className="h-4 w-40 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
					<div className="h-4 w-44 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
				</div>
			</div>
		);
	}

	if (!status) {
		return (
			<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
				<h3 className="text-lg font-medium text-stone-900 dark:text-night-50">Trigger Status</h3>
				<p className="text-stone-500 dark:text-night-300 mt-2">Unable to load trigger status</p>
			</div>
		);
	}

	const { conditions, shouldTrigger, recommendation, lastCheck } = status;

	// Status indicators
	const getStatusIndicator = (healthy: boolean, label: string, value: string) => (
		<div className="flex items-center gap-2">
			<span className={`w-2 h-2 rounded-full ${healthy ? "bg-green-500" : "bg-amber-500"}`} />
			<span className="text-stone-600 dark:text-night-200 dark:text-night-400">{label}:</span>
			<span className="text-stone-900 dark:text-night-50 font-medium">{value}</span>
		</div>
	);

	const icHealthy = conditions.rollingIC30Day >= 0.02;
	const capacityHealthy = conditions.activeIndicatorCount < conditions.maxIndicatorCapacity;
	const cooldownActive = conditions.daysSinceLastAttempt < 30;

	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
			<div className="p-4 border-b border-cream-200 dark:border-night-700 flex items-center justify-between">
				<h3 className="text-lg font-medium text-stone-900 dark:text-night-50">Trigger Status</h3>
				{onTriggerCheck && (
					<button
						type="button"
						onClick={onTriggerCheck}
						className="px-3 py-1.5 text-sm font-medium bg-cream-100 dark:bg-night-700 text-stone-700 dark:text-night-100 rounded-md hover:bg-cream-200 dark:hover:bg-night-600 transition-colors"
					>
						Check Now
					</button>
				)}
			</div>

			<div className="p-4 space-y-3">
				<div className="text-sm text-stone-500 dark:text-night-300">
					Last check: {new Date(lastCheck).toLocaleString()}
				</div>

				<div className="space-y-2">
					{getStatusIndicator(
						!conditions.regimeGapDetected,
						"Regime Gap",
						conditions.regimeGapDetected ? "Detected" : "None detected"
					)}
					{getStatusIndicator(
						icHealthy,
						"IC Performance",
						`${conditions.rollingIC30Day.toFixed(4)} ${icHealthy ? "(healthy)" : "(low)"}`
					)}
					{getStatusIndicator(
						!cooldownActive,
						"Cooldown",
						cooldownActive ? `${30 - conditions.daysSinceLastAttempt} days remaining` : "Ready"
					)}
					{getStatusIndicator(
						capacityHealthy,
						"Capacity",
						`${conditions.activeIndicatorCount}/${conditions.maxIndicatorCapacity} indicators`
					)}
				</div>

				<div
					className={`mt-4 px-3 py-2 rounded-md text-sm ${
						shouldTrigger
							? "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300"
							: "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300"
					}`}
				>
					{recommendation}
				</div>
			</div>
		</div>
	);
}
