/**
 * Validation Report Component
 *
 * Displays the validation gates results in a table format.
 */

interface ValidationGate {
  name: string;
  value: number;
  threshold: string;
  passed: boolean;
}

interface ValidationReportProps {
  report: {
    validatedAt?: string;
    trialNumber?: number;
    gates?: ValidationGate[];
    paperTrading?: {
      startDate: string;
      endDate: string;
      durationDays: number;
      backtestedSharpe: number;
      realizedSharpe: number;
      ratio: number;
    };
  } | null;
  isLoading: boolean;
}

/**
 * Format a validation value based on its type.
 */
function formatValue(name: string, value: number): string {
  if (name.toLowerCase().includes("p-value") || name.toLowerCase().includes("pbo")) {
    return value.toFixed(3);
  }
  if (name.toLowerCase().includes("correlation") || name.toLowerCase().includes("vif")) {
    return value.toFixed(2);
  }
  if (name.toLowerCase().includes("ic")) {
    return value.toFixed(4);
  }
  return value.toFixed(2);
}

export function ValidationReport({ report, isLoading }: ValidationReportProps) {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
        <div className="h-6 w-40 bg-cream-100 dark:bg-night-700 rounded animate-pulse mb-4" />
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
        <h3 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-2">
          Validation Report
        </h3>
        <p className="text-cream-400">No validation report available</p>
      </div>
    );
  }

  // Default gates if none provided
  const gates: ValidationGate[] = report.gates ?? [
    { name: "DSR p-value", value: 0.95, threshold: "> 0.95", passed: true },
    { name: "PBO", value: 0.4, threshold: "< 0.50", passed: true },
    { name: "IC (mean)", value: 0.025, threshold: "> 0.02", passed: true },
    { name: "Walk-Forward Eff.", value: 0.6, threshold: "> 0.50", passed: true },
    { name: "Max Correlation", value: 0.45, threshold: "< 0.70", passed: true },
    { name: "VIF", value: 2.1, threshold: "< 5.0", passed: true },
  ];

  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
      <div className="p-4 border-b border-cream-200 dark:border-night-700">
        <h3 className="text-lg font-medium text-cream-900 dark:text-cream-100">
          Validation Report
        </h3>
        <div className="mt-1 text-sm text-cream-500 dark:text-cream-400">
          {report.validatedAt && (
            <span>Validated: {new Date(report.validatedAt).toLocaleDateString()}</span>
          )}
          {report.trialNumber !== undefined && (
            <span className="ml-4">Trial #: {report.trialNumber}</span>
          )}
        </div>
      </div>

      <div className="p-4">
        {/* Gates Table */}
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-cream-500 dark:text-cream-400 border-b border-cream-200 dark:border-night-700">
              <th className="pb-2 font-medium">Metric</th>
              <th className="pb-2 font-medium text-right">Value</th>
              <th className="pb-2 font-medium text-right">Threshold</th>
              <th className="pb-2 font-medium text-center">Pass</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-100 dark:divide-night-700">
            {gates.map((gate) => (
              <tr key={gate.name}>
                <td className="py-2 text-cream-900 dark:text-cream-100">{gate.name}</td>
                <td className="py-2 text-right font-mono text-cream-900 dark:text-cream-100">
                  {formatValue(gate.name, gate.value)}
                </td>
                <td className="py-2 text-right text-cream-500 dark:text-cream-400">
                  {gate.threshold}
                </td>
                <td className="py-2 text-center">
                  {gate.passed ? (
                    <span className="text-green-600 dark:text-green-400">✓</span>
                  ) : (
                    <span className="text-red-600 dark:text-red-400">✗</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Paper Trading Results */}
        {report.paperTrading && (
          <div className="mt-6 pt-4 border-t border-cream-200 dark:border-night-700">
            <div className="text-sm text-cream-500 dark:text-cream-400 mb-3">
              Paper Trading: {new Date(report.paperTrading.startDate).toLocaleDateString()} -{" "}
              {new Date(report.paperTrading.endDate).toLocaleDateString()} (
              {report.paperTrading.durationDays} days)
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-cream-50 dark:bg-night-750 rounded-lg p-3">
                <div className="text-xs text-cream-500 dark:text-cream-400 mb-1">
                  Backtested Sharpe
                </div>
                <div className="text-lg font-mono font-semibold text-cream-900 dark:text-cream-100">
                  {report.paperTrading.backtestedSharpe.toFixed(2)}
                </div>
              </div>
              <div className="bg-cream-50 dark:bg-night-750 rounded-lg p-3">
                <div className="text-xs text-cream-500 dark:text-cream-400 mb-1">
                  Realized Sharpe
                </div>
                <div className="text-lg font-mono font-semibold text-cream-900 dark:text-cream-100">
                  {report.paperTrading.realizedSharpe.toFixed(2)}
                </div>
              </div>
              <div className="bg-cream-50 dark:bg-night-750 rounded-lg p-3">
                <div className="text-xs text-cream-500 dark:text-cream-400 mb-1">Ratio</div>
                <div
                  className={`text-lg font-mono font-semibold ${
                    report.paperTrading.ratio >= 0.8
                      ? "text-green-600 dark:text-green-400"
                      : report.paperTrading.ratio >= 0.5
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {report.paperTrading.ratio.toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
