"use client";

export function LoadingState(): React.ReactElement {
	return (
		<div className="space-y-6">
			<div className="h-8 w-32 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
			<div className="h-48 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
			<div className="h-64 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
		</div>
	);
}
