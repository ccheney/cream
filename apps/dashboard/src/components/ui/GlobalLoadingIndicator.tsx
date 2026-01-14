/**
 * GlobalLoadingIndicator
 *
 * A subtle top-of-viewport progress bar that shows when any loading operation is active.
 * Uses warm amber gradient (not cold blue) for "Calm Confidence" per design philosophy.
 *
 * @see docs/plans/ui/20-design-philosophy.md
 */

"use client";

import { useLoadingStore } from "@/stores/loading-store";

export function GlobalLoadingIndicator() {
	const isAnyLoading = useLoadingStore((s) => s.isAnyLoading());

	if (!isAnyLoading) {
		return null;
	}

	return (
		<div className="fixed top-0 left-0 right-0 z-50 h-0.5 overflow-hidden">
			<div
				className="h-full w-full bg-gradient-to-r from-amber-400/80 via-amber-500 to-amber-400/80 animate-pulse"
				style={{
					backgroundSize: "200% 100%",
					animation: "gradient-slide 1.5s ease-in-out infinite",
				}}
			/>
			<style jsx>{`
        @keyframes gradient-slide {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }
      `}</style>
		</div>
	);
}

export default GlobalLoadingIndicator;
