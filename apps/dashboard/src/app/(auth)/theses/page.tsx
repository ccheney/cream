/**
 * Theses Page - Investment thesis tracker
 */

export default function ThesesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-cream-900 dark:text-cream-100">
          Investment Theses
        </h1>
        <button
          type="button"
          className="px-4 py-2 bg-cream-900 dark:bg-cream-100 text-cream-100 dark:text-cream-900 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          New Thesis
        </button>
      </div>

      {/* Active Theses */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
        <div className="p-4 border-b border-cream-200 dark:border-night-700">
          <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100">Active Theses</h2>
        </div>
        <div className="p-4">
          <p className="text-cream-400">Track investment theses and their performance over time</p>
          <div className="mt-4 space-y-4">
            <ThesisCard
              title="Placeholder Thesis"
              symbol="--"
              direction="LONG"
              status="active"
              conviction="--"
              pnl="--"
            />
          </div>
        </div>
      </div>

      {/* Thesis Template */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
        <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-4">
          Thesis Structure
        </h2>
        <div className="text-sm text-cream-600 dark:text-cream-400 space-y-2">
          <p>
            • <strong>Core Idea:</strong> What is the investment thesis?
          </p>
          <p>
            • <strong>Catalyst:</strong> What will drive the price movement?
          </p>
          <p>
            • <strong>Time Horizon:</strong> When do we expect the thesis to play out?
          </p>
          <p>
            • <strong>Risk Factors:</strong> What could invalidate the thesis?
          </p>
          <p>
            • <strong>Position Sizing:</strong> How much capital to allocate?
          </p>
        </div>
      </div>
    </div>
  );
}

function ThesisCard({
  title,
  symbol,
  direction,
  status,
  conviction,
  pnl,
}: {
  title: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  status: "active" | "closed" | "invalidated";
  conviction: string;
  pnl: string;
}) {
  const directionColor = direction === "LONG" ? "text-green-500" : "text-red-500";
  const statusColors = {
    active: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
    closed: "bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-400",
    invalidated: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
  };

  return (
    <div className="border border-cream-200 dark:border-night-700 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-mono font-medium text-cream-900 dark:text-cream-100">{symbol}</span>
          <span className={`text-sm font-medium ${directionColor}`}>{direction}</span>
          <span className={`text-xs px-2 py-0.5 rounded ${statusColors[status]}`}>{status}</span>
        </div>
        <div className="text-right">
          <div className="text-sm text-cream-500 dark:text-cream-400">P&L</div>
          <div className="font-mono font-medium text-cream-900 dark:text-cream-100">{pnl}</div>
        </div>
      </div>
      <div className="mt-2 text-sm text-cream-600 dark:text-cream-400">{title}</div>
      <div className="mt-2 text-xs text-cream-500 dark:text-cream-400">
        Conviction: {conviction}
      </div>
    </div>
  );
}
