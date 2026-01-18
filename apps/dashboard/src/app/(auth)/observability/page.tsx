"use client";

const OPENOBSERVE_URL = process.env.NEXT_PUBLIC_OPENOBSERVE_URL ?? "http://localhost:5080";

export default function ObservabilityPage() {
	return (
		<div className="flex flex-col h-full">
			<div className="flex items-center justify-between mb-4">
				<h1 className="text-2xl font-semibold text-stone-900 dark:text-night-50">Observability</h1>
				<a
					href={OPENOBSERVE_URL}
					target="_blank"
					rel="noopener noreferrer"
					className="text-sm text-stone-500 dark:text-night-400 hover:text-stone-700 dark:hover:text-night-200"
				>
					Open in new tab ↗
				</a>
			</div>

			<iframe
				src={`${OPENOBSERVE_URL}/web`}
				className="flex-1 w-full min-h-0 border border-cream-200 dark:border-night-700 rounded-lg bg-white dark:bg-night-900"
				title="OpenObserve"
			/>
		</div>
	);
}
