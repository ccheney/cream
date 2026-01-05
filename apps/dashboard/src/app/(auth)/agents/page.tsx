/**
 * Agents Page - Monitor 8-agent consensus network
 */

const AGENTS = [
  { id: "technical", name: "Technical Analyst", color: "#3B82F6" },
  { id: "news", name: "News & Sentiment", color: "#10B981" },
  { id: "fundamentals", name: "Fundamentals & Macro", color: "#F59E0B" },
  { id: "bullish", name: "Bullish Research", color: "#22C55E" },
  { id: "bearish", name: "Bearish Research", color: "#EF4444" },
  { id: "trader", name: "Trader", color: "#8B5CF6" },
  { id: "risk", name: "Risk Manager", color: "#EC4899" },
  { id: "critic", name: "Critic", color: "#6366F1" },
] as const;

export default function AgentsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-cream-900 dark:text-cream-100">Agent Network</h1>
        <div className="text-sm text-cream-500 dark:text-cream-400">
          Consensus: APPROVE / REJECT requires Risk + Critic agreement
        </div>
      </div>

      {/* Agent Grid */}
      <div className="grid grid-cols-4 gap-4">
        {AGENTS.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>

      {/* Agent Output Stream - placeholder */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
        <div className="p-4 border-b border-cream-200 dark:border-night-700">
          <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100">
            Agent Output Stream
          </h2>
        </div>
        <div className="p-4 h-64 overflow-auto font-mono text-sm text-cream-600 dark:text-cream-400">
          <p>Agent outputs will stream here in real-time...</p>
        </div>
      </div>
    </div>
  );
}

function AgentCard({ agent }: { agent: { id: string; name: string; color: string } }) {
  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: agent.color }} />
        <span className="text-sm font-medium text-cream-900 dark:text-cream-100">{agent.name}</span>
      </div>
      <div className="mt-2 text-sm text-cream-500 dark:text-cream-400">Status: Idle</div>
      <div className="mt-1 text-xs text-cream-400">Last output: --</div>
    </div>
  );
}
