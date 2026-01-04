/**
 * Tests for Mock LLM Infrastructure
 */

import { beforeEach, describe, expect, test } from "bun:test";
import {
  createMockLLM,
  createMockLLMRecorder,
  createMockLLMWithDefaults,
  extractKeyHash,
  extractKeyPattern,
  extractPromptKey,
  type LLMInterface,
  type MockLLM,
  type MockResponse,
} from "./llm";

// ============================================
// Key Extraction Tests
// ============================================

describe("extractKeyHash", () => {
  test("returns consistent hash for same input", () => {
    const prompt = "Analyze AAPL";
    const hash1 = extractKeyHash(prompt);
    const hash2 = extractKeyHash(prompt);
    expect(hash1).toBe(hash2);
  });

  test("returns different hash for different input", () => {
    const hash1 = extractKeyHash("Analyze AAPL");
    const hash2 = extractKeyHash("Analyze MSFT");
    expect(hash1).not.toBe(hash2);
  });

  test("returns 16 character hex string", () => {
    const hash = extractKeyHash("test prompt");
    expect(hash).toMatch(/^[a-f0-9]{16}$/);
  });
});

describe("extractKeyPattern", () => {
  test("extracts agent:symbol from [AGENT] ... [SYMBOL] format", () => {
    const prompt = "[TECHNICAL_ANALYST] Please analyze [AAPL] stock";
    expect(extractKeyPattern(prompt)).toBe("technical_analyst:AAPL");
  });

  test("extracts agent:symbol from 'As a <agent>' format", () => {
    const prompt = "As a technical analyst, analyze AAPL";
    expect(extractKeyPattern(prompt)).toBe("technical_analyst:AAPL");
  });

  test("extracts agent:symbol from '<Agent> analysis for <symbol>' format", () => {
    const prompt = "Technical Analyst analysis for MSFT";
    expect(extractKeyPattern(prompt)).toBe("technical_analyst:MSFT");
  });

  test("extracts agent:symbol from 'You are the <agent>' format", () => {
    const prompt = "You are the risk manager. Symbol: GOOG. Evaluate the trade.";
    expect(extractKeyPattern(prompt)).toBe("risk_manager:GOOG");
  });

  test("extracts agent:symbol from simple 'agent:action' format", () => {
    const prompt = "trader:plan";
    expect(extractKeyPattern(prompt)).toBe("trader:PLAN");
  });

  test("extracts agent:symbol from Role format", () => {
    const prompt = "Role: Critic\nSymbol: NVDA\nReview the decision plan.";
    expect(extractKeyPattern(prompt)).toBe("critic:NVDA");
  });

  test("falls back to hash for unstructured prompt", () => {
    const prompt = "What is the weather like today?";
    const key = extractKeyPattern(prompt);
    // Should be a hash (16 hex chars)
    expect(key).toMatch(/^[a-f0-9]{16}$/);
  });

  test("finds ticker and agent words in unstructured prompt", () => {
    const prompt = "Please have the analyst look at TSLA for opportunities";
    expect(extractKeyPattern(prompt)).toBe("analyst:TSLA");
  });
});

describe("extractPromptKey", () => {
  test("uses pattern strategy by default", () => {
    const prompt = "As a trader, plan for AAPL";
    const key = extractPromptKey(prompt);
    expect(key).toBe("trader:AAPL");
  });

  test("uses hash strategy when specified", () => {
    const prompt = "As a trader, plan for AAPL";
    const key = extractPromptKey(prompt, "hash");
    expect(key).toMatch(/^[a-f0-9]{16}$/);
  });

  test("uses exact strategy when specified", () => {
    const prompt = "  As a trader, plan for AAPL  ";
    const key = extractPromptKey(prompt, "exact");
    expect(key).toBe("As a trader, plan for AAPL");
  });
});

// ============================================
// MockLLM Tests
// ============================================

describe("MockLLM", () => {
  let mockLLM: MockLLM;

  beforeEach(() => {
    mockLLM = createMockLLM({
      "technical_analyst:AAPL": "AAPL analysis result",
      "trader:PLAN": JSON.stringify({ action: "BUY", symbol: "AAPL" }),
      exact_match_key: { content: "Exact match response" },
      error_test: { content: "", error: "Simulated error" },
      delayed_test: { content: "Delayed response", delay: 50 },
    });
  });

  describe("complete", () => {
    test("returns response for matching pattern key", async () => {
      const response = await mockLLM.complete("As a technical analyst, analyze AAPL");
      expect(response).toBe("AAPL analysis result");
    });

    test("returns response for exact key match", async () => {
      const response = await mockLLM.complete("exact_match_key");
      // Pattern extraction will create a hash, but we also try exact match as fallback
      expect(response).toBe("Exact match response");
    });

    test("returns JSON string for object content", async () => {
      const response = await mockLLM.complete("trader:plan");
      expect(response).toBe(JSON.stringify({ action: "BUY", symbol: "AAPL" }));
    });

    test("throws error in strict mode for unmatched key", async () => {
      expect(mockLLM.complete("Unknown prompt with no match")).rejects.toThrow(
        /No response found for key/
      );
    });

    test("returns default response in non-strict mode", async () => {
      const nonStrictLLM = createMockLLM(
        { key: "value" },
        { strictMode: false, defaultResponse: "Default" }
      );
      const response = await nonStrictLLM.complete("unknown prompt");
      expect(response).toBe("Default");
    });

    test("throws simulated error", async () => {
      expect(mockLLM.complete("error_test")).rejects.toThrow("Simulated error");
    });

    test("applies delay", async () => {
      const start = Date.now();
      await mockLLM.complete("delayed_test");
      const duration = Date.now() - start;
      expect(duration).toBeGreaterThanOrEqual(45); // Allow some variance
    });
  });

  describe("completeJSON", () => {
    test("parses JSON response", async () => {
      const response = await mockLLM.completeJSON<{ action: string; symbol: string }>(
        "trader:plan"
      );
      expect(response).toEqual({ action: "BUY", symbol: "AAPL" });
    });

    test("throws on non-JSON response", async () => {
      expect(mockLLM.completeJSON("As a technical analyst, analyze AAPL")).rejects.toThrow(
        /Failed to parse response as JSON/
      );
    });
  });

  describe("call tracking", () => {
    test("tracks calls", async () => {
      await mockLLM.complete("As a technical analyst, analyze AAPL");
      await mockLLM.complete("trader:plan");

      expect(mockLLM.getCallCount()).toBe(2);
    });

    test("returns recorded calls", async () => {
      await mockLLM.complete("As a technical analyst, analyze AAPL");

      const calls = mockLLM.getCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0].key).toBe("technical_analyst:AAPL");
      expect(calls[0].response).toBe("AAPL analysis result");
    });

    test("checks if key was called", async () => {
      expect(mockLLM.wasKeyCalled("technical_analyst:AAPL")).toBe(false);

      await mockLLM.complete("As a technical analyst, analyze AAPL");

      expect(mockLLM.wasKeyCalled("technical_analyst:AAPL")).toBe(true);
    });

    test("clears calls", async () => {
      await mockLLM.complete("As a technical analyst, analyze AAPL");
      expect(mockLLM.getCallCount()).toBe(1);

      mockLLM.clearCalls();
      expect(mockLLM.getCallCount()).toBe(0);
    });
  });

  describe("dynamic responses", () => {
    test("adds response at runtime", async () => {
      mockLLM.addResponse("new_key", "New response");

      const response = await mockLLM.complete("new_key");
      expect(response).toBe("New response");
    });

    test("removes response at runtime", async () => {
      mockLLM.removeResponse("technical_analyst:AAPL");

      expect(mockLLM.complete("As a technical analyst, analyze AAPL")).rejects.toThrow();
    });
  });
});

// ============================================
// MockLLMRecorder Tests
// ============================================

describe("MockLLMRecorder", () => {
  // Create a simple fake LLM for testing the recorder
  class FakeLLM implements LLMInterface {
    async complete(prompt: string): Promise<string> {
      return `Response for: ${prompt.slice(0, 30)}`;
    }

    async completeJSON<T>(prompt: string): Promise<T> {
      return { result: prompt.slice(0, 20) } as T;
    }
  }

  test("records complete calls", async () => {
    const fakeLLM = new FakeLLM();
    const recorder = createMockLLMRecorder(fakeLLM);

    await recorder.complete("As a trader, plan for AAPL");
    await recorder.complete("As a critic, review for MSFT");

    expect(recorder.getRecordingCount()).toBe(2);
  });

  test("exports recorded responses", async () => {
    const fakeLLM = new FakeLLM();
    const recorder = createMockLLMRecorder(fakeLLM);

    await recorder.complete("As a trader, plan for AAPL");

    const responses = recorder.exportResponses();
    expect(responses["trader:AAPL"]).toBeDefined();
    expect((responses["trader:AAPL"] as MockResponse).content).toContain("Response for:");
  });

  test("exports as JSON", async () => {
    const fakeLLM = new FakeLLM();
    const recorder = createMockLLMRecorder(fakeLLM);

    await recorder.complete("As a trader, plan for AAPL");

    const json = recorder.exportJSON();
    expect(() => JSON.parse(json)).not.toThrow();
  });

  test("records completeJSON calls", async () => {
    const fakeLLM = new FakeLLM();
    const recorder = createMockLLMRecorder(fakeLLM);

    await recorder.completeJSON("As a trader, plan for GOOG");

    const responses = recorder.exportResponses();
    expect(responses["trader:GOOG"]).toBeDefined();
    const response = responses["trader:GOOG"] as MockResponse;
    expect(response.content).toEqual({ result: "As a trader, plan fo" });
  });

  test("clears recordings", async () => {
    const fakeLLM = new FakeLLM();
    const recorder = createMockLLMRecorder(fakeLLM);

    await recorder.complete("As a trader, plan for AAPL");
    expect(recorder.getRecordingCount()).toBe(1);

    recorder.clear();
    expect(recorder.getRecordingCount()).toBe(0);
  });

  test("uses specified key strategy", async () => {
    const fakeLLM = new FakeLLM();
    const recorder = createMockLLMRecorder(fakeLLM, "hash");

    await recorder.complete("test prompt");

    const responses = recorder.exportResponses();
    const keys = Object.keys(responses);
    expect(keys[0]).toMatch(/^[a-f0-9]{16}$/);
  });
});

// ============================================
// Factory Function Tests
// ============================================

describe("createMockLLM", () => {
  test("creates MockLLM with responses", async () => {
    const llm = createMockLLM({
      test_key: "test response",
    });

    const response = await llm.complete("test_key");
    expect(response).toBe("test response");
  });

  test("accepts additional config", async () => {
    const llm = createMockLLM({ key: "value" }, { strictMode: false, defaultResponse: "fallback" });

    const response = await llm.complete("unknown");
    expect(response).toBe("fallback");
  });
});

describe("createMockLLMWithDefaults", () => {
  test("creates MockLLM with common agent responses", async () => {
    const llm = createMockLLMWithDefaults();

    // Test technical analyst response
    const techResponse = await llm.completeJSON<{ instrumentId: string }>(
      "As a technical analyst, analyze AAPL"
    );
    expect(techResponse.instrumentId).toBe("AAPL");
  });

  test("has trader plan response", async () => {
    const llm = createMockLLMWithDefaults();

    const traderResponse = await llm.completeJSON<{ decisions: unknown[] }>("trader:PLAN");
    expect(traderResponse.decisions).toBeDefined();
    expect(traderResponse.decisions.length).toBeGreaterThan(0);
  });

  test("has risk manager approve response", async () => {
    const llm = createMockLLMWithDefaults();

    const response = await llm.completeJSON<{ verdict: string }>("risk_manager:APPROVE");
    expect(response.verdict).toBe("APPROVE");
  });

  test("has risk manager reject response", async () => {
    const llm = createMockLLMWithDefaults();

    const response = await llm.completeJSON<{ verdict: string; violations: string[] }>(
      "risk_manager:REJECT"
    );
    expect(response.verdict).toBe("REJECT");
    expect(response.violations.length).toBeGreaterThan(0);
  });

  test("has critic responses", async () => {
    const llm = createMockLLMWithDefaults();

    const approveResponse = await llm.completeJSON<{ verdict: string }>("critic:APPROVE");
    expect(approveResponse.verdict).toBe("APPROVE");

    const rejectResponse = await llm.completeJSON<{ verdict: string }>("critic:REJECT");
    expect(rejectResponse.verdict).toBe("REJECT");
  });
});

// ============================================
// Integration Tests
// ============================================

describe("Integration", () => {
  test("recorder output can be used as MockLLM input", async () => {
    // Simulate real LLM
    class RealLLM implements LLMInterface {
      async complete(prompt: string): Promise<string> {
        if (prompt.includes("AAPL")) {
          return JSON.stringify({ symbol: "AAPL", recommendation: "BUY" });
        }
        return JSON.stringify({ error: "unknown" });
      }

      async completeJSON<T>(prompt: string): Promise<T> {
        return JSON.parse(await this.complete(prompt));
      }
    }

    // Record responses
    const realLLM = new RealLLM();
    const recorder = createMockLLMRecorder(realLLM);

    await recorder.complete("As a trader, plan for AAPL");
    const responses = recorder.exportResponses();

    // Create mock from recordings
    const mockLLM = createMockLLM(responses);

    // Verify same response
    const response = await mockLLM.completeJSON<{ symbol: string }>("As a trader, plan for AAPL");
    expect(response.symbol).toBe("AAPL");
  });

  test("mock can simulate agent pipeline", async () => {
    const llm = createMockLLMWithDefaults();

    // Simulate agent pipeline: analyze → plan → validate → approve
    const analysis = await llm.completeJSON<{ confidence: number }>(
      "[TECHNICAL_ANALYST] analyze [AAPL]"
    );
    expect(analysis.confidence).toBeGreaterThan(0);

    const plan = await llm.completeJSON<{ decisions: unknown[] }>("trader:PLAN");
    expect(plan.decisions.length).toBeGreaterThan(0);

    const riskCheck = await llm.completeJSON<{ verdict: string }>("risk_manager:APPROVE");
    expect(riskCheck.verdict).toBe("APPROVE");

    const criticCheck = await llm.completeJSON<{ verdict: string }>("critic:APPROVE");
    expect(criticCheck.verdict).toBe("APPROVE");

    // Verify call tracking
    expect(llm.getCallCount()).toBe(4);
  });
});
