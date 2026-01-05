/**
 * Charts Page - Market context with TradingView-style charts
 */

export default function ChartsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-cream-900 dark:text-cream-100">
          Charts
        </h1>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Symbol..."
            className="text-sm border border-cream-200 dark:border-night-700 rounded-md px-3 py-1.5 bg-white dark:bg-night-800"
          />
          <select className="text-sm border border-cream-200 dark:border-night-700 rounded-md px-3 py-1.5 bg-white dark:bg-night-800">
            <option>1H</option>
            <option>4H</option>
            <option>1D</option>
            <option>1W</option>
          </select>
        </div>
      </div>

      {/* Main Chart - placeholder */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
        <div className="h-96 flex items-center justify-center text-cream-400">
          <div className="text-center">
            <p className="text-lg">Lightweight Charts placeholder</p>
            <p className="text-sm mt-2">
              Candlestick chart with indicators will render here
            </p>
          </div>
        </div>
      </div>

      {/* Indicators Panel - placeholder */}
      <div className="grid grid-cols-4 gap-4">
        <IndicatorCard name="RSI(14)" value="--" />
        <IndicatorCard name="ATR(14)" value="--" />
        <IndicatorCard name="SMA(20)" value="--" />
        <IndicatorCard name="Volume" value="--" />
      </div>
    </div>
  );
}

function IndicatorCard({ name, value }: { name: string; value: string }) {
  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
      <div className="text-sm text-cream-500 dark:text-cream-400">{name}</div>
      <div className="mt-1 text-xl font-mono font-medium text-cream-900 dark:text-cream-100">
        {value}
      </div>
    </div>
  );
}
