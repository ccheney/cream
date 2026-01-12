"use client";

import type { Citation } from "@/lib/api/types";
import { CitationCard } from "./CitationCard";

export interface CitationsSectionProps {
  citations: Citation[];
}

export function CitationsSection({ citations }: CitationsSectionProps): React.ReactElement | null {
  if (citations.length === 0) {
    return null;
  }

  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
      <h2 className="text-lg font-medium text-stone-900 dark:text-night-50 mb-4">
        Citations ({citations.length})
      </h2>
      <div className="space-y-3">
        {citations.map((citation) => (
          <CitationCard key={citation.id} citation={citation} />
        ))}
      </div>
    </div>
  );
}
