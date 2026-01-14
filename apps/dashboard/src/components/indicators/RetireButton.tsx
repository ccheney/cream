/**
 * Retire Button Component
 *
 * Button with confirmation dialog to retire an indicator.
 */

import { useState } from "react";
import { useRetireIndicator } from "@/hooks/queries";

interface RetireButtonProps {
	indicatorId: string;
	indicatorName: string;
	disabled?: boolean;
	onSuccess?: () => void;
}

export function RetireButton({
	indicatorId,
	indicatorName,
	disabled = false,
	onSuccess,
}: RetireButtonProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [reason, setReason] = useState("");
	const retireMutation = useRetireIndicator();

	const handleRetire = async () => {
		try {
			await retireMutation.mutateAsync({
				id: indicatorId,
				reason: reason || undefined,
			});
			setIsOpen(false);
			setReason("");
			onSuccess?.();
		} catch {
			// Error handled by mutation
		}
	};

	return (
		<>
			<button
				type="button"
				onClick={() => setIsOpen(true)}
				disabled={disabled}
				className="px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
			>
				Retire Indicator
			</button>

			{/* Confirmation Modal */}
			{isOpen && (
				<div className="fixed inset-0 z-50 flex items-center justify-center">
					{/* Backdrop */}
					<button
						type="button"
						className="fixed inset-0 bg-black/50 cursor-default"
						onClick={() => setIsOpen(false)}
						onKeyDown={(e) => {
							if (e.key === "Escape") {
								setIsOpen(false);
							}
						}}
						aria-label="Close modal"
					/>

					{/* Modal */}
					<div className="relative bg-white dark:bg-night-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
						<h3 className="text-lg font-semibold text-stone-900 dark:text-night-50 mb-2">
							Retire Indicator
						</h3>
						<p className="text-stone-600 dark:text-night-200 dark:text-night-400 mb-4">
							Are you sure you want to retire <strong>{indicatorName}</strong>? This action will
							remove it from production use.
						</p>

						<div className="mb-4">
							<label
								htmlFor="retire-reason"
								className="block text-sm font-medium text-stone-700 dark:text-night-100 mb-1"
							>
								Reason (optional)
							</label>
							<textarea
								id="retire-reason"
								value={reason}
								onChange={(e) => setReason(e.target.value)}
								placeholder="e.g., IC decay below threshold, regime change..."
								rows={3}
								className="w-full px-3 py-2 text-sm border border-cream-300 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-stone-900 dark:text-night-50 placeholder:text-stone-400 dark:text-night-400 focus:outline-none focus:ring-2 focus:ring-red-500"
							/>
						</div>

						<div className="flex justify-end gap-3">
							<button
								type="button"
								onClick={() => {
									setIsOpen(false);
									setReason("");
								}}
								className="px-4 py-2 text-sm font-medium text-stone-700 dark:text-night-100 bg-cream-100 dark:bg-night-700 rounded-md hover:bg-cream-200 dark:hover:bg-night-600 transition-colors"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleRetire}
								disabled={retireMutation.isPending}
								className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
							>
								{retireMutation.isPending ? "Retiring..." : "Confirm Retire"}
							</button>
						</div>

						{retireMutation.isError && (
							<p className="mt-3 text-sm text-red-600 dark:text-red-400">
								Failed to retire indicator. Please try again.
							</p>
						)}
					</div>
				</div>
			)}
		</>
	);
}
