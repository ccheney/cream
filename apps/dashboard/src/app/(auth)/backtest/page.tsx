/**
 * Backtest Page - Historical strategy testing
 */

export default function BacktestPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-cream-900 dark:text-cream-100">Backtest</h1>
        <button
          type="button"
          className="px-4 py-2 bg-cream-900 dark:bg-cream-100 text-cream-100 dark:text-cream-900 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          New Backtest
        </button>
      </div>

      {/* Backtest Configuration - placeholder */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
        <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-4">
          Configuration
        </h2>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label
              htmlFor="backtest-start-date"
              className="block text-sm text-cream-500 dark:text-cream-400 mb-1"
            >
              Start Date
            </label>
            <input
              id="backtest-start-date"
              type="date"
              className="w-full text-sm border border-cream-200 dark:border-night-700 rounded-md px-3 py-1.5 bg-white dark:bg-night-800"
            />
          </div>
          <div>
            <label
              htmlFor="backtest-end-date"
              className="block text-sm text-cream-500 dark:text-cream-400 mb-1"
            >
              End Date
            </label>
            <input
              id="backtest-end-date"
              type="date"
              className="w-full text-sm border border-cream-200 dark:border-night-700 rounded-md px-3 py-1.5 bg-white dark:bg-night-800"
            />
          </div>
          <div>
            <label
              htmlFor="backtest-capital"
              className="block text-sm text-cream-500 dark:text-cream-400 mb-1"
            >
              Initial Capital
            </label>
            <input
              id="backtest-capital"
              type="text"
              placeholder="$100,000"
              className="w-full text-sm border border-cream-200 dark:border-night-700 rounded-md px-3 py-1.5 bg-white dark:bg-night-800"
            />
          </div>
          <div>
            <label
              htmlFor="backtest-universe"
              className="block text-sm text-cream-500 dark:text-cream-400 mb-1"
            >
              Universe
            </label>
            <select
              id="backtest-universe"
              className="w-full text-sm border border-cream-200 dark:border-night-700 rounded-md px-3 py-1.5 bg-white dark:bg-night-800"
            >
              <option>S&P 500</option>
              <option>NASDAQ-100</option>
              <option>Custom</option>
            </select>
          </div>
        </div>
      </div>

      {/* Backtest Results - placeholder */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard label="Total Return" value="--%" />
        <MetricCard label="Sharpe Ratio" value="--" />
        <MetricCard label="Max Drawdown" value="--%" />
        <MetricCard label="Win Rate" value="--%" />
      </div>

      {/* Equity Curve - placeholder */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
        <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-4">
          Equity Curve
        </h2>
        <div className="h-64 flex items-center justify-center text-cream-400">
          Run a backtest to see results
        </div>
      </div>

      {/* Trade Log - placeholder */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
        <div className="p-4 border-b border-cream-200 dark:border-night-700">
          <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100">Trade Log</h2>
        </div>
        <div className="p-4 text-cream-400">No trades</div>
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
