/**
 * Portfolio Page - Position management and P&L tracking
 */

export default function PortfolioPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-cream-900 dark:text-cream-100">Portfolio</h1>
      </div>

      {/* Portfolio Summary - placeholder */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard label="Total NAV" value="$--" />
        <MetricCard label="Cash" value="$--" />
        <MetricCard label="Unrealized P&L" value="$--" change="--%" />
        <MetricCard label="Day P&L" value="$--" change="--%" />
      </div>

      {/* Positions Table - placeholder */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
        <div className="p-4 border-b border-cream-200 dark:border-night-700">
          <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100">Open Positions</h2>
        </div>
        <div className="p-8 text-center text-cream-400">No positions</div>
      </div>

      {/* Equity Curve Chart - placeholder */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
        <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-4">
          Equity Curve
        </h2>
        <div className="h-64 flex items-center justify-center text-cream-400">
          Chart placeholder
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, change }: { label: string; value: string; change?: string }) {
  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
      <div className="text-sm text-cream-500 dark:text-cream-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-cream-900 dark:text-cream-100">{value}</div>
      {change && <div className="mt-1 text-sm text-cream-500 dark:text-cream-400">{change}</div>}
    </div>
  );
}
