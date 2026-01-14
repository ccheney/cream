"use client";

import { format } from "date-fns";
import type { Citation } from "@/lib/api/types";

export interface CitationCardProps {
	citation: Citation;
}

export function CitationCard({ citation }: CitationCardProps): React.ReactElement {
	return (
		<div className="p-3 bg-cream-50 dark:bg-night-700 rounded-lg">
			<div className="flex items-start justify-between gap-4">
				<div className="min-w-0 flex-1">
					<a
						href={citation.url}
						target="_blank"
						rel="noopener noreferrer"
						className="text-sm font-medium text-stone-900 dark:text-night-50 hover:text-stone-600 dark:text-night-200 dark:hover:text-night-200"
					>
						{citation.title}
					</a>
					<div className="text-xs text-stone-500 dark:text-night-300 mt-0.5">
						{citation.source} &bull; {format(new Date(citation.fetchedAt), "MMM d, yyyy")}
					</div>
				</div>
				<div className="text-xs text-stone-400 dark:text-night-400">
					{Math.round(citation.relevanceScore * 100)}% relevant
				</div>
			</div>
			{citation.snippet && (
				<p className="mt-2 text-xs text-stone-600 dark:text-night-200 dark:text-night-400 line-clamp-2">
					&ldquo;{citation.snippet}&rdquo;
				</p>
			)}
		</div>
	);
}
