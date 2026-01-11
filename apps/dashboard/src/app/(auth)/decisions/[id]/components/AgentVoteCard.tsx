"use client";

import type { AgentOutput } from "@/lib/api/types";
import { formatAgentName } from "./utils";

export interface AgentVoteCardProps {
  output: AgentOutput;
}

const voteColors: Record<string, string> = {
  APPROVE: "text-green-600 bg-green-50 dark:bg-green-900/20",
  REJECT: "text-red-600 bg-red-50 dark:bg-red-900/20",
};

export function AgentVoteCard({ output }: AgentVoteCardProps): React.ReactElement {
  return (
    <div className="p-4 bg-cream-50 dark:bg-night-700 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-cream-900 dark:text-cream-100">
          {formatAgentName(output.agentType)}
        </span>
        <span className={`px-2 py-0.5 text-xs font-medium rounded ${voteColors[output.vote]}`}>
          {output.vote}
        </span>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 h-1.5 bg-cream-200 dark:bg-night-600 rounded-full overflow-hidden">
          <div
            className="h-full bg-cream-600 dark:bg-cream-400 rounded-full"
            style={{ width: `${output.confidence * 100}%` }}
          />
        </div>
        <span className="text-xs text-cream-500 dark:text-cream-400">
          {Math.round(output.confidence * 100)}%
        </span>
      </div>
      <p className="text-xs text-cream-600 dark:text-cream-400 line-clamp-3">{output.reasoning}</p>
      <div className="mt-2 text-xs text-cream-400 dark:text-cream-500">
        {output.processingTimeMs}ms
      </div>
    </div>
  );
}
