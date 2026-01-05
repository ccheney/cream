/**
 * Feed Page - Real-time event stream
 */

export default function FeedPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-cream-900 dark:text-cream-100">
          Real-Time Feed
        </h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm text-cream-500 dark:text-cream-400">
              Live
            </span>
          </div>
        </div>
      </div>

      {/* Filter Controls */}
      <div className="flex items-center gap-4">
        <FilterChip label="Quotes" active />
        <FilterChip label="Orders" active />
        <FilterChip label="Decisions" active />
        <FilterChip label="Agents" active />
        <FilterChip label="Alerts" active />
        <FilterChip label="System" active={false} />
      </div>

      {/* Event Stream */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
        <div className="p-4 border-b border-cream-200 dark:border-night-700 flex items-center justify-between">
          <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100">
            Event Stream
          </h2>
          <button className="text-sm text-cream-500 hover:text-cream-700 dark:text-cream-400 dark:hover:text-cream-200">
            Clear
          </button>
        </div>
        <div className="h-[600px] overflow-auto">
          <div className="p-4 space-y-2">
            <FeedEvent
              type="system"
              time="--:--:--"
              message="Waiting for events..."
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterChip({ label, active }: { label: string; active: boolean }) {
  return (
    <button
      className={`px-3 py-1 rounded-full text-sm transition-colors ${
        active
          ? "bg-cream-900 dark:bg-cream-100 text-cream-100 dark:text-cream-900"
          : "bg-cream-100 dark:bg-night-700 text-cream-600 dark:text-cream-400 hover:bg-cream-200 dark:hover:bg-night-600"
      }`}
    >
      {label}
    </button>
  );
}

function FeedEvent({
  type,
  time,
  message,
  symbol,
  value,
}: {
  type: "quote" | "order" | "decision" | "agent" | "alert" | "system";
  time: string;
  message: string;
  symbol?: string;
  value?: string;
}) {
  const typeColors = {
    quote: "text-blue-500",
    order: "text-purple-500",
    decision: "text-green-500",
    agent: "text-amber-500",
    alert: "text-red-500",
    system: "text-gray-500",
  };

  return (
    <div className="flex items-start gap-3 py-2 border-b border-cream-100 dark:border-night-700 last:border-0">
      <span className="text-xs font-mono text-cream-400 w-20 flex-shrink-0">
        {time}
      </span>
      <span
        className={`text-xs font-medium uppercase w-16 flex-shrink-0 ${typeColors[type]}`}
      >
        {type}
      </span>
      {symbol && (
        <span className="text-sm font-mono font-medium text-cream-900 dark:text-cream-100 w-16 flex-shrink-0">
          {symbol}
        </span>
      )}
      <span className="text-sm text-cream-600 dark:text-cream-400 flex-1">
        {message}
      </span>
      {value && (
        <span className="text-sm font-mono text-cream-900 dark:text-cream-100">
          {value}
        </span>
      )}
    </div>
  );
}
