/**
 * Run Decay Monitor Tool
 *
 * Comprehensive decay monitoring for all active factors.
 */

import type { FactorZooRepository } from "@cream/storage";
import { createTool } from "@mastra/core/tools";
import {
  createDecayMonitorService,
  type DecayAlertService,
  type DecayMonitorConfig,
  type MarketDataProvider,
} from "../../../services/decay-monitor.js";
import {
  RunDecayMonitorInputSchema,
  type RunDecayMonitorOutput,
  RunDecayMonitorOutputSchema,
} from "./schemas.js";

export function createRunDecayMonitorTool(
  factorZoo: FactorZooRepository,
  alertService?: DecayAlertService,
  marketData?: MarketDataProvider,
  config?: Partial<DecayMonitorConfig>
) {
  const service = createDecayMonitorService({ factorZoo, alertService, marketData }, config);

  return createTool({
    id: "run_decay_monitor",
    description: `Run comprehensive decay monitoring for all active factors.

Checks for:
- IC decay (below 50% of peak for 20+ days)
- Sharpe decay (below 0.5 for 10+ days)
- Market crowding (>80% correlation to SPY)
- Factor-factor correlation spikes (>70%)

Returns alerts with recommendations for risk management.
Run this daily after market close or on-demand for risk assessment.`,
    inputSchema: RunDecayMonitorInputSchema,
    outputSchema: RunDecayMonitorOutputSchema,
    execute: async (): Promise<RunDecayMonitorOutput> => {
      try {
        const result = await service.runDailyCheck();

        const hasAlerts = result.alerts.length > 0;
        let message = `Checked ${result.factorsChecked} factors. `;

        if (hasAlerts) {
          message += `Found ${result.alerts.length} alerts: `;
          message += `${result.decayingFactors.length} decaying, `;
          message += `${result.crowdedFactors.length} crowded, `;
          message += `${result.correlatedPairs.length} correlated pairs.`;
        } else {
          message += "All factors healthy.";
        }

        return {
          alerts: result.alerts,
          factorsChecked: result.factorsChecked,
          decayingFactors: result.decayingFactors,
          crowdedFactors: result.crowdedFactors,
          correlatedPairs: result.correlatedPairs,
          hasAlerts,
          message,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          alerts: [],
          factorsChecked: 0,
          decayingFactors: [],
          crowdedFactors: [],
          correlatedPairs: [],
          hasAlerts: false,
          message: `Failed to run decay monitor: ${errorMessage}`,
        };
      }
    },
  });
}
