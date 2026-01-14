/**
 * Alert Banner Component
 *
 * Full-width critical alert banner with acknowledgment button.
 * Uses The Cream Glow for visual emphasis.
 *
 * @see docs/plans/ui/31-realtime-patterns.md lines 89-118
 */

"use client";

import { selectCriticalBanner, useAlertStore } from "@/stores/alert-store";

export function AlertBanner() {
	const criticalBanner = useAlertStore(selectCriticalBanner);
	const acknowledge = useAlertStore((state) => state.acknowledgeCritical);

	if (!criticalBanner) {
		return null;
	}

	const isAcknowledged = criticalBanner.acknowledged;

	return (
		<div
			role="alert"
			aria-live="assertive"
			className={`
        fixed top-0 left-0 right-0 z-50
        bg-loss/95 backdrop-blur-sm
        border-b-2 border-loss
        animate-glow-critical
        transition-all duration-200
        ${isAcknowledged ? "opacity-0 -translate-y-full" : "opacity-100 translate-y-0"}
      `}
		>
			<div className="max-w-7xl mx-auto px-4 py-3 sm:px-6 lg:px-8">
				<div className="flex items-center justify-between flex-wrap gap-2">
					<div className="flex items-center gap-3 flex-1 min-w-0">
						<span className="flex-shrink-0" aria-hidden="true">
							<svg
								className="h-6 w-6 text-white"
								fill="none"
								viewBox="0 0 24 24"
								strokeWidth={2}
								stroke="currentColor"
								aria-hidden="true"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
								/>
							</svg>
						</span>

						<div className="min-w-0 flex-1">
							<p className="font-semibold text-white text-sm sm:text-base">
								{criticalBanner.title}
							</p>
							<p className="text-white/90 text-xs sm:text-sm truncate">{criticalBanner.message}</p>
						</div>
					</div>

					<div className="flex items-center gap-2 flex-shrink-0">
						{criticalBanner.action && (
							<button
								type="button"
								onClick={criticalBanner.action.onClick}
								className="
                  px-3 py-1.5
                  bg-white/20 hover:bg-white/30
                  text-white text-sm font-medium
                  rounded-md
                  transition-colors duration-150
                  focus:outline-none focus:ring-2 focus:ring-white/50
                "
							>
								{criticalBanner.action.label}
							</button>
						)}

						<button
							type="button"
							onClick={acknowledge}
							className="
                px-3 py-1.5
                bg-white text-loss
                text-sm font-semibold
                rounded-md
                hover:bg-white/90
                transition-colors duration-150
                focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-loss
              "
						>
							Acknowledge
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

export default AlertBanner;
