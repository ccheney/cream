/**
 * Mock LLM Infrastructure
 *
 * Provides deterministic LLM responses for agent testing.
 * Uses prompt key extraction to match requests to predefined responses.
 *
 * @see docs/plans/14-testing.md for mocking strategy
 */

import { createHash } from "node:crypto";

// ============================================
// Types
// ============================================

/**
 * Response configuration for mock LLM
 */
export interface MockResponse {
  /** Response content (string or JSON-serializable object) */
  content: string | object;
  /** Simulate error instead of returning response */
  error?: string;
  /** Simulate latency (ms) */
  delay?: number;
}

/**
 * Response map: key → response configuration
 */
export type ResponseMap = Record<string, MockResponse | string>;

/**
 * Mock LLM configuration
 */
export interface MockLLMConfig {
  /** Response map: prompt key → response */
  responses: ResponseMap;
  /** Default response for unmatched prompts */
  defaultResponse?: MockResponse | string;
  /** Throw error on unmatched prompts (default: true) */
  strictMode?: boolean;
  /** Key extraction strategy */
  keyStrategy?: "hash" | "pattern" | "exact";
  /** Default delay for all responses (ms) */
  defaultDelay?: number;
}

/**
 * LLM completion options
 */
export interface CompletionOptions {
  /** Temperature (ignored in mock, but accepted for interface compatibility) */
  temperature?: number;
  /** Max tokens (ignored in mock) */
  maxTokens?: number;
  /** System prompt */
  systemPrompt?: string;
}

/**
 * LLM interface that mock implements
 */
export interface LLMInterface {
  complete(prompt: string, options?: CompletionOptions): Promise<string>;
  completeJSON<T = unknown>(prompt: string, options?: CompletionOptions): Promise<T>;
}

/**
 * Recorded LLM call
 */
export interface RecordedCall {
  prompt: string;
  systemPrompt?: string;
  response: string;
  timestamp: Date;
  duration: number;
  key: string;
}

// ============================================
// Key Extraction
// ============================================

/**
 * Extract a key from a prompt using hash strategy
 */
export function extractKeyHash(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex").slice(0, 16);
}

/**
 * Extract a key from a prompt using pattern strategy
 *
 * Looks for patterns like:
 * - "agent_name:instrument" (e.g., "technical_analyst:AAPL")
 * - "agent:action" (e.g., "trader:plan", "risk_manager:validate")
 * - "[AGENT_NAME]...[SYMBOL]..." format
 */
export function extractKeyPattern(prompt: string): string {
  // Try to extract agent name and target from structured prompts
  const patterns = [
    // Pattern: [AGENT_NAME] ... analyze ... [SYMBOL]
    /\[(\w+)\].*?(?:analyze|evaluate|validate|plan|review).*?\[(\w+)\]/i,
    // Pattern: As a <agent>, <action> for <TICKER> (e.g., "As a trader, plan for AAPL")
    /as (?:a|an|the) (\w+(?:\s+\w+)?),?\s+\w+\s+for\s+([A-Z]{1,5})\b/i,
    // Pattern: As a <agent>, analyze <TICKER> (e.g., "As a technical analyst, analyze AAPL")
    /as (?:a|an|the) (\w+(?:\s+\w+)?),?\s+(?:analyze|evaluate|validate|review)\s+([A-Z]{1,5})\b/i,
    // Pattern: <Agent> analysis for <SYMBOL>
    /(\w+(?:\s+\w+)?)\s+analysis\s+for\s+([A-Z]{1,5})\b/i,
    // Pattern: You are the <agent>...Symbol: <SYMBOL>
    /you are (?:a|an|the) (\w+(?:\s+\w+)?).*?symbol[:\s]+(\w+)/is,
    // Pattern: Role: <agent>...Symbol: <SYMBOL>
    /role[:\s]+(\w+(?:\s+\w+)?).*?symbol[:\s]+(\w+)/is,
    // Pattern: Agent: <agent>, Instrument: <symbol>
    /agent[:\s]+(\w+).*?instrument[:\s]+(\w+)/is,
    // Pattern: Just action words like "trader:plan" or "risk_manager:reject"
    /^(\w+)[:\s]+(\w+)$/,
  ];

  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    if (match?.[1] && match[2]) {
      const agent = match[1].toLowerCase().replace(/\s+/g, "_");
      const target = match[2].toUpperCase();
      return `${agent}:${target}`;
    }
  }

  // Fallback: look for any capitalized ticker-like symbol
  const tickerMatch = prompt.match(/\b([A-Z]{1,5})\b/);
  const agentMatch = prompt.match(/(?:analyst|trader|manager|critic|agent)/i);

  if (tickerMatch && agentMatch) {
    return `${agentMatch[0].toLowerCase()}:${tickerMatch[1]}`;
  }

  // Last resort: hash the prompt
  return extractKeyHash(prompt);
}

/**
 * Extract a key from a prompt based on strategy
 */
export function extractPromptKey(
  prompt: string,
  strategy: "hash" | "pattern" | "exact" = "pattern"
): string {
  switch (strategy) {
    case "hash":
      return extractKeyHash(prompt);
    case "pattern":
      return extractKeyPattern(prompt);
    case "exact":
      return prompt.trim();
    default:
      return extractKeyPattern(prompt);
  }
}

// ============================================
// Mock LLM
// ============================================

/**
 * Mock LLM for deterministic agent testing
 *
 * Features:
 * - Predefined responses keyed by prompt patterns
 * - Simulated errors and latency
 * - Multiple key extraction strategies
 * - Recording mode for capturing real responses
 */
export class MockLLM implements LLMInterface {
  private config: Required<MockLLMConfig>;
  private calls: RecordedCall[] = [];

  constructor(config: MockLLMConfig) {
    this.config = {
      responses: config.responses,
      defaultResponse: config.defaultResponse ?? { content: "" },
      strictMode: config.strictMode ?? true,
      keyStrategy: config.keyStrategy ?? "pattern",
      defaultDelay: config.defaultDelay ?? 0,
    };
  }

  /**
   * Complete a prompt and return text response
   */
  async complete(prompt: string, options?: CompletionOptions): Promise<string> {
    const key = extractPromptKey(prompt, this.config.keyStrategy);
    const startTime = Date.now();

    // Find response
    let response = this.config.responses[key];

    // Try exact match if pattern didn't work
    if (!response && this.config.keyStrategy === "pattern") {
      response = this.config.responses[prompt.trim()];
    }

    // Try hash as fallback
    if (!response) {
      const hashKey = extractKeyHash(prompt);
      response = this.config.responses[hashKey];
    }

    // Use default or throw
    if (!response) {
      if (this.config.strictMode) {
        throw new Error(
          `MockLLM: No response found for key "${key}". ` +
            `Available keys: ${Object.keys(this.config.responses).join(", ")}`
        );
      }
      response = this.config.defaultResponse;
    }

    // Normalize response
    const normalized = this.normalizeResponse(response);

    // Simulate delay
    const delay = normalized.delay ?? this.config.defaultDelay;
    if (delay > 0) {
      await this.sleep(delay);
    }

    // Check for error simulation
    if (normalized.error) {
      throw new Error(normalized.error);
    }

    // Get content
    const content =
      typeof normalized.content === "object"
        ? JSON.stringify(normalized.content)
        : normalized.content;

    // Record call
    this.calls.push({
      prompt,
      systemPrompt: options?.systemPrompt,
      response: content,
      timestamp: new Date(),
      duration: Date.now() - startTime,
      key,
    });

    return content;
  }

  /**
   * Complete a prompt and return parsed JSON
   */
  async completeJSON<T = unknown>(prompt: string, options?: CompletionOptions): Promise<T> {
    const response = await this.complete(prompt, options);
    try {
      return JSON.parse(response) as T;
    } catch {
      throw new Error(
        `MockLLM: Failed to parse response as JSON. Response: ${response.slice(0, 200)}`
      );
    }
  }

  /**
   * Get all recorded calls
   */
  getCalls(): RecordedCall[] {
    return [...this.calls];
  }

  /**
   * Clear recorded calls
   */
  clearCalls(): void {
    this.calls = [];
  }

  /**
   * Get call count
   */
  getCallCount(): number {
    return this.calls.length;
  }

  /**
   * Check if a specific key was called
   */
  wasKeyCalled(key: string): boolean {
    return this.calls.some((c) => c.key === key);
  }

  /**
   * Add a response at runtime
   */
  addResponse(key: string, response: MockResponse | string): void {
    this.config.responses[key] = response;
  }

  /**
   * Remove a response at runtime
   */
  removeResponse(key: string): void {
    delete this.config.responses[key];
  }

  /**
   * Normalize response to MockResponse format
   */
  private normalizeResponse(response: MockResponse | string): MockResponse {
    if (typeof response === "string") {
      return { content: response };
    }
    return response;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================
// Mock LLM Recorder
// ============================================

/**
 * Records real LLM calls for replay in tests
 *
 * Wrap a real LLM client with this recorder to capture
 * responses, then export to a response map for MockLLM.
 */
export class MockLLMRecorder implements LLMInterface {
  private realLLM: LLMInterface;
  private recordings: Map<string, MockResponse> = new Map();
  private keyStrategy: "hash" | "pattern" | "exact";

  constructor(realLLM: LLMInterface, keyStrategy: "hash" | "pattern" | "exact" = "pattern") {
    this.realLLM = realLLM;
    this.keyStrategy = keyStrategy;
  }

  /**
   * Complete and record the response
   */
  async complete(prompt: string, options?: CompletionOptions): Promise<string> {
    const key = extractPromptKey(prompt, this.keyStrategy);
    const startTime = Date.now();

    const response = await this.realLLM.complete(prompt, options);

    this.recordings.set(key, {
      content: response,
      delay: Date.now() - startTime,
    });

    return response;
  }

  /**
   * Complete JSON and record the response
   */
  async completeJSON<T = unknown>(prompt: string, options?: CompletionOptions): Promise<T> {
    const key = extractPromptKey(prompt, this.keyStrategy);
    const startTime = Date.now();

    const response = await this.realLLM.completeJSON<T>(prompt, options);

    this.recordings.set(key, {
      content: response as object,
      delay: Date.now() - startTime,
    });

    return response;
  }

  /**
   * Export recordings as response map
   */
  exportResponses(): ResponseMap {
    const result: ResponseMap = {};
    for (const [key, response] of this.recordings) {
      result[key] = response;
    }
    return result;
  }

  /**
   * Export recordings as JSON string
   */
  exportJSON(pretty = true): string {
    return JSON.stringify(this.exportResponses(), null, pretty ? 2 : undefined);
  }

  /**
   * Clear all recordings
   */
  clear(): void {
    this.recordings.clear();
  }

  /**
   * Get recording count
   */
  getRecordingCount(): number {
    return this.recordings.size;
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a mock LLM with custom responses
 */
export function createMockLLM(
  responses: ResponseMap,
  config?: Partial<Omit<MockLLMConfig, "responses">>
): MockLLM {
  return new MockLLM({
    responses,
    ...config,
  });
}

/**
 * Create a mock LLM with common agent responses
 */
export function createMockLLMWithDefaults(): MockLLM {
  return createMockLLM({
    // Technical Analyst responses
    "technical_analyst:AAPL": {
      content: {
        instrumentId: "AAPL",
        setupClassification: "TREND_CONTINUATION",
        indicators: {
          rsi: 55,
          macd: { histogram: 0.5, signal: "bullish" },
          sma20: 175.5,
          sma50: 170.2,
        },
        confidence: 0.85,
        rationale: "Price above key moving averages with bullish momentum",
      },
    },

    // Trader responses
    "trader:PLAN": {
      content: {
        cycleId: "mock-cycle-001",
        asOfTimestamp: new Date().toISOString(),
        environment: "BACKTEST",
        decisions: [
          {
            instrument: { instrumentId: "AAPL", instrumentType: "EQUITY" },
            action: "BUY",
            size: { quantity: 10, unit: "SHARES", targetPositionQuantity: 10 },
            orderPlan: {
              entryOrderType: "LIMIT",
              entryLimitPrice: 175.0,
              exitOrderType: "MARKET",
              timeInForce: "DAY",
            },
            riskLevels: {
              stopLossLevel: 170.0,
              takeProfitLevel: 185.0,
              denomination: "UNDERLYING_PRICE",
            },
            strategyFamily: "TREND",
            rationale: "Technical setup supports long entry",
            confidence: 0.8,
          },
        ],
      },
    },

    // Risk Manager approve
    "risk_manager:APPROVE": {
      content: {
        verdict: "APPROVE",
        violations: [],
        riskMetrics: {
          portfolioRisk: 0.02,
          positionRisk: 0.01,
          correlationRisk: 0.15,
        },
        notes: "All risk constraints satisfied",
      },
    },

    // Risk Manager reject
    "risk_manager:REJECT": {
      content: {
        verdict: "REJECT",
        violations: [
          "Position size exceeds 5% limit",
          "Correlation with existing positions too high",
        ],
        riskMetrics: {
          portfolioRisk: 0.08,
          positionRisk: 0.06,
          correlationRisk: 0.75,
        },
        notes: "Position rejected due to risk limit violations",
      },
    },

    // Critic approve
    "critic:APPROVE": {
      content: {
        verdict: "APPROVE",
        issues: [],
        suggestions: ["Consider scaling in over multiple entries"],
        score: 0.9,
      },
    },

    // Critic reject
    "critic:REJECT": {
      content: {
        verdict: "REJECT",
        issues: [
          "Entry timing conflicts with upcoming earnings",
          "Risk-reward ratio below threshold",
        ],
        suggestions: ["Wait for post-earnings clarity", "Tighten stop-loss"],
        score: 0.4,
      },
    },

    // News Analyst
    "news_analyst:AAPL": {
      content: {
        instrumentId: "AAPL",
        sentiment: "neutral",
        headlines: [
          "Apple announces new product line",
          "Tech sector steady amid market volatility",
        ],
        impactScore: 0.3,
        eventRisk: "low",
      },
    },

    // Fundamentals Analyst
    "fundamentals_analyst:AAPL": {
      content: {
        instrumentId: "AAPL",
        valuation: "fair",
        peRatio: 28.5,
        revenueGrowth: 0.08,
        earningsDate: "2026-01-28",
        analystRating: "buy",
        priceTarget: 200.0,
      },
    },
  });
}

/**
 * Create a recorder that wraps a real LLM
 */
export function createMockLLMRecorder(
  realLLM: LLMInterface,
  keyStrategy?: "hash" | "pattern" | "exact"
): MockLLMRecorder {
  return new MockLLMRecorder(realLLM, keyStrategy);
}
