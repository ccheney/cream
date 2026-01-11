/**
 * Shared test fixtures for Claude Code Indicator tests
 */

import type { IndicatorHypothesis } from "@cream/indicators";
import type {
  SDKMessage,
  SDKProvider,
  Session,
  SessionOptions,
} from "../../claudeCodeIndicator.js";

/**
 * Create a mock indicator hypothesis with optional overrides
 */
export function createMockHypothesis(
  overrides?: Partial<IndicatorHypothesis>
): IndicatorHypothesis {
  return {
    name: "sector_rotation_momentum",
    category: "correlation",
    // Min 50 chars for hypothesis
    hypothesis:
      "Measures relative strength of sector ETFs to detect rotation patterns in institutional capital flows across market sectors",
    // Min 100 chars for economicRationale
    economicRationale:
      "Sector rotation precedes market moves due to capital flows between sectors as institutions rebalance portfolios based on economic cycle positioning and risk appetite changes over time",
    // Min 50 chars for mathematicalApproach
    mathematicalApproach:
      "Rolling correlation of sector ETF returns with market benchmark using exponential weighting",
    // Each criterion min 10 chars
    falsificationCriteria: [
      "IC below 0.01 over 60 trading days",
      "Correlation above 0.7 with existing indicators",
    ],
    expectedProperties: {
      expectedICRange: [0.02, 0.08] as [number, number],
      maxCorrelationWithExisting: 0.3,
      targetTimeframe: "1d",
      applicableRegimes: ["TRENDING", "ROTATING"],
    },
    relatedAcademicWork: ["Fama-French sector momentum research"],
    ...overrides,
  };
}

/**
 * Mock existing indicator patterns for testing
 */
export const mockExistingPatterns = `
export function calculateRSI(candles: Candle[], config: RSIConfig = DEFAULT_CONFIG): RSIResult {
  if (candles.length < config.period) {
    return { values: [], period: config.period };
  }
  // ... implementation
}
`;

/**
 * Captured values container for mock SDK testing
 */
export interface CapturedValues {
  options: SessionOptions | null;
  prompt: string | null;
}

/**
 * Options for creating a mock SDK provider
 */
export interface MockSDKProviderOptions {
  messages?: SDKMessage[];
  shouldFail?: boolean;
  capturedOptions?: { value: SessionOptions | null };
  capturedPrompt?: { value: string | null };
}

/**
 * Create a mock SDK provider for testing
 */
export function createMockSDKProvider(options: MockSDKProviderOptions): SDKProvider {
  const {
    messages = [],
    shouldFail = false,
    capturedOptions = { value: null },
    capturedPrompt = { value: null },
  } = options;

  return {
    createSession: (sessionOptions: SessionOptions): Session => {
      capturedOptions.value = sessionOptions;

      return {
        send: async (prompt: string) => {
          capturedPrompt.value = prompt;
          if (shouldFail) {
            throw new Error("Mock SDK send failed");
          }
        },
        stream: async function* (): AsyncGenerator<SDKMessage> {
          for (const msg of messages) {
            yield msg;
          }
        },
        close: () => {
          // No-op for mock
        },
      };
    },
  };
}
