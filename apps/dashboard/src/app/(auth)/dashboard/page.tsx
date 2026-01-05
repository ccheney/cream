/**
 * Dashboard Page - Control panel with OODA cycle status
 */

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-cream-900 dark:text-cream-100">Dashboard</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-cream-600 dark:text-cream-400">Next cycle in: --:--</span>
        </div>
      </div>

      {/* OODA Cycle Status - placeholder */}
      <div className="grid grid-cols-4 gap-4">
        <OODAPhaseCard phase="Observe" status="idle" />
        <OODAPhaseCard phase="Orient" status="idle" />
        <OODAPhaseCard phase="Decide" status="idle" />
        <OODAPhaseCard phase="Act" status="idle" />
      </div>

      {/* Portfolio Summary - placeholder */}
      <div className="grid grid-cols-3 gap-4">
        <MetricCard label="NAV" value="--" />
        <MetricCard label="Day P&L" value="--" />
        <MetricCard label="Open Positions" value="--" />
      </div>

      {/* Recent Decisions - placeholder */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
        <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-4">
          Recent Decisions
        </h2>
        <p className="text-cream-500 dark:text-cream-400">No decisions yet</p>
      </div>
    </div>
  );
}

function OODAPhaseCard({
  phase,
  status,
}: {
  phase: string;
  status: "idle" | "active" | "complete";
}) {
  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
      <div className="text-sm text-cream-500 dark:text-cream-400">{phase}</div>
      <div className="mt-1 text-lg font-medium text-cream-900 dark:text-cream-100 capitalize">
        {status}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
      <div className="text-sm text-cream-500 dark:text-cream-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-cream-900 dark:text-cream-100">{value}</div>
    </div>
  );
}
