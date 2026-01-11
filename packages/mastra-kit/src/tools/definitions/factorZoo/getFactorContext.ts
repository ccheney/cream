/**
 * Get Factor Context Tool
 *
 * Returns detailed context about a specific factor including
 * hypothesis background, validation scores, and performance metrics.
 */

import type { FactorZooRepository } from "@cream/storage";
import { createTool } from "@mastra/core/tools";
import {
  createFactorZooService,
  type FactorZooDependencies,
} from "../../../services/factor-zoo.js";
import {
  type GetFactorContextInput,
  GetFactorContextInputSchema,
  type GetFactorContextOutput,
  GetFactorContextOutputSchema,
} from "./schemas.js";

function createNotFoundResponse(factorId: string): GetFactorContextOutput {
  return {
    factorId,
    name: "",
    hypothesisId: null,
    status: "unknown",
    currentWeight: 0,
    performance: {
      recentIC: 0,
      rolling30IC: 0,
      icTrend: "stable" as const,
      isDecaying: false,
      decayRate: null,
    },
    validation: {
      stage1Sharpe: null,
      stage2PBO: null,
      stage2WFE: null,
      paperValidationPassed: false,
    },
    found: false,
    message: `Factor ${factorId} not found`,
  };
}

function createErrorResponse(factorId: string, errorMessage: string): GetFactorContextOutput {
  return {
    factorId,
    name: "",
    hypothesisId: null,
    status: "error",
    currentWeight: 0,
    performance: {
      recentIC: 0,
      rolling30IC: 0,
      icTrend: "stable" as const,
      isDecaying: false,
      decayRate: null,
    },
    validation: {
      stage1Sharpe: null,
      stage2PBO: null,
      stage2WFE: null,
      paperValidationPassed: false,
    },
    found: false,
    message: `Failed to get factor context: ${errorMessage}`,
  };
}

function calculateICTrend(
  recentIC: number,
  olderIC: number,
  hasEnoughData: boolean
): "improving" | "stable" | "declining" {
  if (!hasEnoughData) {
    return "stable";
  }
  const diff = recentIC - olderIC;
  if (diff > 0.005) {
    return "improving";
  }
  if (diff < -0.005) {
    return "declining";
  }
  return "stable";
}

export function createGetFactorContextTool(factorZoo: FactorZooRepository) {
  const deps: FactorZooDependencies = { factorZoo };
  const service = createFactorZooService(deps);

  return createTool({
    id: "get_factor_context",
    description: `Get detailed context about a specific factor.

Returns hypothesis background, validation scores, and performance metrics.
Use this tool when you need to understand why a factor signal should be trusted
or when evaluating factor-based recommendations.`,
    inputSchema: GetFactorContextInputSchema,
    outputSchema: GetFactorContextOutputSchema,
    execute: async (inputData: GetFactorContextInput): Promise<GetFactorContextOutput> => {
      const { factorId } = inputData;

      try {
        const factor = await factorZoo.findFactorById(factorId);

        if (!factor) {
          return createNotFoundResponse(factorId);
        }

        const history = await factorZoo.getPerformanceHistory(factorId, 30);
        const recent5 = history.slice(0, 5);
        const older = history.slice(5, 15);

        const recentIC =
          recent5.length > 0 ? recent5.reduce((sum, h) => sum + h.ic, 0) / recent5.length : 0;
        const rolling30IC =
          history.length > 0 ? history.reduce((sum, h) => sum + h.ic, 0) / history.length : 0;
        const olderIC =
          older.length > 0 ? older.reduce((sum, h) => sum + h.ic, 0) / older.length : 0;

        const hasEnoughData = recent5.length >= 5 && older.length >= 5;
        const icTrend = calculateICTrend(recentIC, olderIC, hasEnoughData);

        const decayResult = await service.checkFactorDecay(factorId);
        const isDecaying = decayResult?.isDecaying ?? false;

        return {
          factorId: factor.factorId,
          name: factor.name,
          hypothesisId: factor.hypothesisId,
          status: factor.status,
          currentWeight: factor.currentWeight,
          performance: {
            recentIC,
            rolling30IC,
            icTrend,
            isDecaying,
            decayRate: factor.decayRate,
          },
          validation: {
            stage1Sharpe: factor.stage1Sharpe,
            stage2PBO: factor.stage2Pbo,
            stage2WFE: factor.stage2Wfe,
            paperValidationPassed: factor.paperValidationPassed,
          },
          found: true,
          message: `Factor ${factor.name}: ${factor.status}, weight=${factor.currentWeight.toFixed(3)}, IC trend=${icTrend}`,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return createErrorResponse(factorId, errorMessage);
      }
    },
  });
}
