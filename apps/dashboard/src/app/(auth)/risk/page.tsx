/**
 * Risk Page - Risk exposure monitoring
 */

export default function RiskPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-cream-900 dark:text-cream-100">Risk Exposure</h1>
      </div>

      {/* Risk Metrics Summary */}
      <div className="grid grid-cols-4 gap-4">
        <RiskMetricCard label="Gross Exposure" value="--%" status="normal" />
        <RiskMetricCard label="Net Exposure" value="--%" status="normal" />
        <RiskMetricCard label="VaR (95%)" value="--%" status="normal" />
        <RiskMetricCard label="Max Drawdown" value="--%" status="normal" />
      </div>

      {/* Sector Exposure */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
        <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-4">
          Sector Exposure
        </h2>
        <div className="h-48 flex items-center justify-center text-cream-400">
          Sector allocation chart placeholder
        </div>
      </div>

      {/* Greeks (Options) */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
        <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-4">
          Portfolio Greeks
        </h2>
        <div className="grid grid-cols-5 gap-4">
          <GreekCard letter="Δ" name="Delta" value="--" />
          <GreekCard letter="Γ" name="Gamma" value="--" />
          <GreekCard letter="Θ" name="Theta" value="--" />
          <GreekCard letter="V" name="Vega" value="--" />
          <GreekCard letter="ρ" name="Rho" value="--" />
        </div>
      </div>

      {/* Risk Alerts */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
        <div className="p-4 border-b border-cream-200 dark:border-night-700">
          <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100">Risk Alerts</h2>
        </div>
        <div className="p-4 text-cream-400">No active risk alerts</div>
      </div>
    </div>
  );
}

function RiskMetricCard({
  label,
  value,
  status,
}: {
  label: string;
  value: string;
  status: "normal" | "warning" | "critical";
}) {
  const statusColors = {
    normal: "text-green-500",
    warning: "text-amber-500",
    critical: "text-red-500",
  };

  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
      <div className="text-sm text-cream-500 dark:text-cream-400">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${statusColors[status]}`}>{value}</div>
    </div>
  );
}

function GreekCard({ letter, name, value }: { letter: string; name: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-2xl font-serif text-cream-400">{letter}</div>
      <div className="text-xs text-cream-500 dark:text-cream-400">{name}</div>
      <div className="mt-1 text-lg font-mono text-cream-900 dark:text-cream-100">{value}</div>
    </div>
  );
}
