"use client";

import type { AgentOutput } from "@/lib/api/types";
import { AgentVoteCard } from "./AgentVoteCard";

export interface AgentVotesGridProps {
  outputs: AgentOutput[];
}

export function AgentVotesGrid({ outputs }: AgentVotesGridProps): React.ReactElement {
  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
      <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-4">Agent Votes</h2>
      {outputs.length > 0 ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {outputs.map((output) => (
            <AgentVoteCard key={output.agentType} output={output} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-cream-500 dark:text-cream-400">No agent votes recorded</p>
      )}
    </div>
  );
}
