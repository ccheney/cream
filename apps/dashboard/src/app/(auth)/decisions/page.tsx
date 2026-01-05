/**
 * Decisions Page - Timeline of trading decisions
 */

export default function DecisionsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-cream-900 dark:text-cream-100">Decisions</h1>
        <div className="flex items-center gap-2">
          <select className="text-sm border border-cream-200 dark:border-night-700 rounded-md px-3 py-1.5 bg-white dark:bg-night-800">
            <option>All Actions</option>
            <option>BUY</option>
            <option>SELL</option>
            <option>HOLD</option>
          </select>
        </div>
      </div>

      {/* Decision Timeline - placeholder */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
        <div className="p-4 border-b border-cream-200 dark:border-night-700">
          <p className="text-cream-500 dark:text-cream-400">
            Decision timeline will display here with full agent reasoning
          </p>
        </div>
        <div className="p-8 text-center text-cream-400">No decisions to display</div>
      </div>
    </div>
  );
}
