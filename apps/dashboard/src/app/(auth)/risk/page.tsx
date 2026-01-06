"use client";

/**
 * Risk Page - Risk exposure monitoring
 */

import { useExposure, useGreeks, useLimits, useVaR } from "@/hooks/queries";

export default function RiskPage() {
  const { data: exposure, isLoading: exposureLoading } = useExposure();
  const { data: greeks, isLoading: greeksLoading } = useGreeks();
  const { data: var_, isLoading: varLoading } = useVaR();
  const { data: limits, isLoading: limitsLoading } = useLimits();

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);

  const formatPct = (value: number) => `${(value * 100).toFixed(1)}%`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-cream-900 dark:text-cream-100">Risk Exposure</h1>
      </div>

      {/* Risk Metrics Summary */}
      <div className="grid grid-cols-4 gap-4">
        <RiskMetricCard
          label="Gross Exposure"
          value={exposureLoading ? "--" : formatPct(exposure?.gross.pct ?? 0)}
          limit={exposureLoading ? undefined : formatCurrency(exposure?.gross.limit ?? 0)}
          status={getStatus(exposure?.gross.pct ?? 0, 0.8, 0.95)}
          isLoading={exposureLoading}
        />
        <RiskMetricCard
          label="Net Exposure"
          value={exposureLoading ? "--" : formatPct(exposure?.net.pct ?? 0)}
          limit={exposureLoading ? undefined : formatCurrency(exposure?.net.limit ?? 0)}
          status={getStatus(exposure?.net.pct ?? 0, 0.7, 0.9)}
          isLoading={exposureLoading}
        />
        <RiskMetricCard
          label="VaR (95%)"
          value={varLoading ? "--" : formatCurrency(var_?.oneDay95 ?? 0)}
          status="normal"
          isLoading={varLoading}
        />
        <RiskMetricCard
          label="Max Concentration"
          value={
            exposureLoading
              ? "--"
              : exposure?.concentrationMax?.symbol
                ? `${exposure.concentrationMax.symbol} ${formatPct(
                    exposure.concentrationMax.pct ?? 0
                  )}`
                : "0.0%"
          }
          status={getStatus(exposure?.concentrationMax?.pct ?? 0, 0.15, 0.2)}
          isLoading={exposureLoading}
        />
      </div>

      {/* Sector Exposure */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
        <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-4">
          Sector Exposure
        </h2>
        {exposureLoading ? (
          <div className="h-48 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
        ) : exposure?.sectorExposure ? (
          <div className="space-y-3">
            {Object.entries(exposure.sectorExposure).map(([sector, pct]) => (
              <div key={sector}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-cream-700 dark:text-cream-300">{sector}</span>
                  <span className="text-cream-500 dark:text-cream-400">{formatPct(pct)}</span>
                </div>
                <div className="h-2 bg-cream-100 dark:bg-night-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{ width: `${pct * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-48 flex items-center justify-center text-cream-400">
            No sector data available
          </div>
        )}
      </div>

      {/* Greeks */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
        <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-4">
          Portfolio Greeks
        </h2>
        {greeksLoading ? (
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
            ))}
          </div>
        ) : greeks ? (
          <div className="grid grid-cols-4 gap-4">
            <GreekCard
              letter="Δ"
              name="Delta"
              value={greeks.delta.current.toFixed(1)}
              limit={greeks.delta.limit}
            />
            <GreekCard
              letter="Γ"
              name="Gamma"
              value={greeks.gamma.current.toFixed(2)}
              limit={greeks.gamma.limit}
            />
            <GreekCard
              letter="Θ"
              name="Theta"
              value={greeks.theta.current.toFixed(0)}
              limit={greeks.theta.limit}
            />
            <GreekCard
              letter="V"
              name="Vega"
              value={greeks.vega.current.toFixed(0)}
              limit={greeks.vega.limit}
            />
          </div>
        ) : (
          <div className="text-center text-cream-400">No Greeks data</div>
        )}
      </div>

      {/* Limit Utilization */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
        <div className="p-4 border-b border-cream-200 dark:border-night-700">
          <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100">
            Limit Utilization
          </h2>
        </div>
        {limitsLoading ? (
          <div className="p-4 space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
            ))}
          </div>
        ) : limits && limits.length > 0 ? (
          <div className="divide-y divide-cream-100 dark:divide-night-700">
            {limits.map((limit) => (
              <div key={limit.name} className="p-4 flex items-center justify-between">
                <div>
                  <span className="font-medium text-cream-900 dark:text-cream-100">
                    {limit.name}
                  </span>
                  <span className="ml-2 text-xs text-cream-500 dark:text-cream-400 uppercase">
                    {limit.category.replace("_", " ")}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-32">
                    <div className="h-2 bg-cream-100 dark:bg-night-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          limit.status === "critical"
                            ? "bg-red-500"
                            : limit.status === "warning"
                              ? "bg-amber-500"
                              : "bg-green-500"
                        }`}
                        style={{ width: `${limit.utilization * 100}%` }}
                      />
                    </div>
                  </div>
                  <span
                    className={`text-sm font-mono ${
                      limit.status === "critical"
                        ? "text-red-500"
                        : limit.status === "warning"
                          ? "text-amber-500"
                          : "text-green-500"
                    }`}
                  >
                    {(limit.utilization * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 text-cream-400">No limit data</div>
        )}
      </div>
    </div>
  );
}

function getStatus(
  value: number,
  warningThreshold: number,
  criticalThreshold: number
): "normal" | "warning" | "critical" {
  if (value >= criticalThreshold) {
    return "critical";
  }
  if (value >= warningThreshold) {
    return "warning";
  }
  return "normal";
}

function RiskMetricCard({
  label,
  value,
  limit,
  status,
  isLoading,
}: {
  label: string;
  value: string;
  limit?: string;
  status: "normal" | "warning" | "critical";
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
        <div className="h-4 w-20 bg-cream-100 dark:bg-night-700 rounded animate-pulse mb-2" />
        <div className="h-8 w-16 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
      </div>
    );
  }

  const statusColors = {
    normal: "text-green-500",
    warning: "text-amber-500",
    critical: "text-red-500",
  };

  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
      <div className="text-sm text-cream-500 dark:text-cream-400">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${statusColors[status]}`}>{value}</div>
      {limit && <div className="mt-1 text-xs text-cream-400">Limit: {limit}</div>}
    </div>
  );
}

function GreekCard({
  letter,
  name,
  value,
  limit,
}: {
  letter: string;
  name: string;
  value: string;
  limit: number;
}) {
  return (
    <div className="text-center p-4 bg-cream-50 dark:bg-night-750 rounded-lg">
      <div className="text-3xl font-serif text-cream-400">{letter}</div>
      <div className="text-xs text-cream-500 dark:text-cream-400 mt-1">{name}</div>
      <div className="mt-2 text-xl font-mono text-cream-900 dark:text-cream-100">{value}</div>
      <div className="text-xs text-cream-400 mt-1">Limit: {limit}</div>
    </div>
  );
}
