"use client";

/**
 * Config Page - System configuration management
 */

import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import {
  useActiveConfig,
  useConstraintsConfig,
  useRuntimeConfigHistory,
  useUniverseConfig,
} from "@/hooks/queries";

export default function ConfigPage() {
  const { data: config, isLoading: configLoading } = useActiveConfig();
  const { data: universe } = useUniverseConfig();
  const { data: constraints } = useConstraintsConfig();
  const { data: history, isLoading: historyLoading } = useRuntimeConfigHistory();

  const envColors = {
    BACKTEST: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    PAPER: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    LIVE: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-cream-900 dark:text-cream-100">Configuration</h1>
        <div className="flex items-center gap-2">
          {config && (
            <>
              <span
                className={`px-3 py-1 text-sm font-medium rounded-full ${
                  envColors[config.trading.environment as keyof typeof envColors] ?? envColors.PAPER
                }`}
              >
                {config.trading.environment}
              </span>
              <span className="text-sm text-cream-500 dark:text-cream-400">
                v{config.trading.version}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Config Sections */}
      {configLoading ? (
        <div className="grid grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-48 bg-cream-100 dark:bg-night-700 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : config ? (
        <div className="grid grid-cols-2 gap-6">
          {/* Trading Config */}
          <ConfigSection title="Trading" href="/config/edit">
            <ConfigField label="Environment" value={config.trading.environment} />
            <ConfigField
              label="Cycle Interval"
              value={`${config.trading.tradingCycleIntervalMs / 60000}m`}
            />
            <ConfigField label="Agent Timeout" value={`${config.trading.agentTimeoutMs / 1000}s`} />
            <ConfigField
              label="Kelly Fraction"
              value={`${(config.trading.kellyFraction * 100).toFixed(0)}%`}
            />
          </ConfigSection>

          {/* Universe Config */}
          <ConfigSection title="Universe" href="/config/universe">
            <ConfigField label="Source" value={universe?.source ?? "--"} />
            <ConfigField
              label="Optionable Only"
              value={String(universe?.optionableOnly ?? false)}
            />
            <ConfigField
              label="Min Volume"
              value={universe?.minVolume?.toLocaleString() ?? "Not set"}
            />
            <ConfigField
              label="Min Market Cap"
              value={
                universe?.minMarketCap ? `$${(universe.minMarketCap / 1e9).toFixed(1)}B` : "Not set"
              }
            />
          </ConfigSection>

          {/* Per-Instrument Limits */}
          <ConfigSection title="Per-Instrument Limits" href="/config/constraints">
            <ConfigField
              label="Max Shares"
              value={constraints?.perInstrument.maxShares.toLocaleString() ?? "--"}
            />
            <ConfigField
              label="Max Contracts"
              value={String(constraints?.perInstrument.maxContracts ?? "--")}
            />
            <ConfigField
              label="Max Notional"
              value={`$${((constraints?.perInstrument.maxNotional ?? 0) / 1000).toFixed(0)}K`}
            />
            <ConfigField
              label="Max % Equity"
              value={`${((constraints?.perInstrument.maxPctEquity ?? 0) * 100).toFixed(0)}%`}
            />
          </ConfigSection>

          {/* Portfolio Limits */}
          <ConfigSection title="Portfolio Limits" href="/config/constraints">
            <ConfigField
              label="Max Gross Exposure"
              value={`${((constraints?.portfolio.maxGrossExposure ?? 0) * 100).toFixed(0)}%`}
            />
            <ConfigField
              label="Max Net Exposure"
              value={`${((constraints?.portfolio.maxNetExposure ?? 0) * 100).toFixed(0)}%`}
            />
            <ConfigField
              label="Max Concentration"
              value={`${((constraints?.portfolio.maxConcentration ?? 0) * 100).toFixed(0)}%`}
            />
            <ConfigField
              label="Max Drawdown"
              value={`${((constraints?.portfolio.maxDrawdown ?? 0) * 100).toFixed(0)}%`}
            />
          </ConfigSection>

          {/* Options Limits */}
          <ConfigSection title="Options Greeks Limits" href="/config/constraints">
            <ConfigField label="Max Delta" value={String(constraints?.options.maxDelta ?? "--")} />
            <ConfigField label="Max Gamma" value={String(constraints?.options.maxGamma ?? "--")} />
            <ConfigField label="Max Vega" value={String(constraints?.options.maxVega ?? "--")} />
            <ConfigField label="Max Theta" value={String(constraints?.options.maxTheta ?? "--")} />
          </ConfigSection>

          {/* Consensus Config */}
          <ConfigSection title="Consensus" href="/config/edit">
            <ConfigField
              label="Max Iterations"
              value={String(config.trading.maxConsensusIterations)}
            />
            <ConfigField
              label="Delta Hold"
              value={`${(config.trading.convictionDeltaHold * 100).toFixed(0)}%`}
            />
            <ConfigField
              label="Delta Action"
              value={`${(config.trading.convictionDeltaAction * 100).toFixed(0)}%`}
            />
            <ConfigField
              label="Min Risk/Reward"
              value={`${config.trading.minRiskRewardRatio.toFixed(1)}:1`}
            />
          </ConfigSection>
        </div>
      ) : null}

      {/* Config History */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
        <div className="p-4 border-b border-cream-200 dark:border-night-700">
          <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100">
            Configuration History
          </h2>
        </div>
        {historyLoading ? (
          <div className="p-4 space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
            ))}
          </div>
        ) : history && history.length > 0 ? (
          <div className="divide-y divide-cream-100 dark:divide-night-700">
            {history.map((entry, index) => (
              <div key={entry.id ?? index} className="p-4 flex items-center justify-between">
                <div>
                  <span className="font-medium text-cream-900 dark:text-cream-100">
                    v{entry.version}
                  </span>
                  {entry.isActive && (
                    <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 rounded">
                      Active
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-cream-500 dark:text-cream-400">
                    {entry.changedFields?.join(", ") ?? "Configuration updated"}
                  </span>
                  <span className="text-xs text-cream-400">
                    {entry.createdAt
                      ? formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })
                      : "Unknown"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 text-cream-400">No configuration changes</div>
        )}
      </div>
    </div>
  );
}

function ConfigSection({
  title,
  href,
  children,
}: {
  title: string;
  href?: string;
  children: React.ReactNode;
}) {
  const content = (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100">{title}</h2>
        {href && (
          <span className="text-xs text-cream-400 dark:text-cream-500 group-hover:text-blue-500">
            Edit &rarr;
          </span>
        )}
      </div>
      <div className="space-y-3">{children}</div>
    </>
  );

  if (href) {
    return (
      <Link
        href={href as `/config/${string}`}
        className="block bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4 hover:border-blue-300 dark:hover:border-blue-700 transition-colors group"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
      {content}
    </div>
  );
}

function ConfigField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-cream-600 dark:text-cream-400">{label}</span>
      <span className="text-sm font-mono text-cream-900 dark:text-cream-100">{value}</span>
    </div>
  );
}
