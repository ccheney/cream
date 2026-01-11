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
            className="text-sm font-medium text-cream-900 dark:text-cream-100 hover:text-cream-600 dark:hover:text-cream-300"
          >
            {citation.title}
          </a>
          <div className="text-xs text-cream-500 dark:text-cream-400 mt-0.5">
            {citation.source} &bull; {format(new Date(citation.fetchedAt), "MMM d, yyyy")}
          </div>
        </div>
        <div className="text-xs text-cream-400 dark:text-cream-500">
          {Math.round(citation.relevanceScore * 100)}% relevant
        </div>
      </div>
      {citation.snippet && (
        <p className="mt-2 text-xs text-cream-600 dark:text-cream-400 line-clamp-2">
          &ldquo;{citation.snippet}&rdquo;
        </p>
      )}
    </div>
  );
}
