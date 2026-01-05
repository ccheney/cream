/**
 * Config Page - System configuration management
 */

export default function ConfigPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-cream-900 dark:text-cream-100">
          Configuration
        </h1>
        <div className="flex items-center gap-2">
          <span className="text-sm px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
            PAPER
          </span>
        </div>
      </div>

      {/* Config Sections */}
      <div className="grid grid-cols-2 gap-6">
        {/* Trading Config */}
        <ConfigSection title="Trading">
          <ConfigField label="Environment" value="PAPER" />
          <ConfigField label="Broker" value="ALPACA" />
          <ConfigField label="Max Position Size" value="--%" />
          <ConfigField label="Daily Stop Loss" value="--%" />
        </ConfigSection>

        {/* Universe Config */}
        <ConfigSection title="Universe">
          <ConfigField label="Source" value="S&P 500" />
          <ConfigField label="Symbols" value="--" />
          <ConfigField label="Min Market Cap" value="--" />
        </ConfigSection>

        {/* Agent Config */}
        <ConfigSection title="Agents">
          <ConfigField label="Consensus" value="Risk + Critic" />
          <ConfigField label="Max Tokens" value="--" />
          <ConfigField label="Temperature" value="--" />
        </ConfigSection>

        {/* Risk Config */}
        <ConfigSection title="Risk Limits">
          <ConfigField label="Max Leverage" value="--x" />
          <ConfigField label="Max Drawdown" value="--%" />
          <ConfigField label="VaR Limit (95%)" value="--%" />
        </ConfigSection>
      </div>

      {/* Config History */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
        <div className="p-4 border-b border-cream-200 dark:border-night-700">
          <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100">
            Configuration History
          </h2>
        </div>
        <div className="p-4 text-cream-400">No configuration changes</div>
      </div>
    </div>
  );
}

function ConfigSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
      <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-4">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function ConfigField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-cream-600 dark:text-cream-400">
        {label}
      </span>
      <span className="text-sm font-mono text-cream-900 dark:text-cream-100">
        {value}
      </span>
    </div>
  );
}
