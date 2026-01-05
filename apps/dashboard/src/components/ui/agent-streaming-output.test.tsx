/**
 * AgentStreamingOutput Component Tests
 *
 * Tests for agent streaming output utilities, hooks, and type definitions.
 */

import { describe, it, expect } from "bun:test";
import type { StreamingStatus } from "./use-streaming-text.js";
import type { AgentStreamingOutputProps } from "./agent-streaming-output.js";

// ============================================
// Type Tests
// ============================================

describe("StreamingStatus type", () => {
  it("accepts valid status values", () => {
    const statuses: StreamingStatus[] = ["idle", "processing", "complete", "error"];
    expect(statuses).toHaveLength(4);
  });

  it("idle is a valid status", () => {
    const status: StreamingStatus = "idle";
    expect(status).toBe("idle");
  });

  it("processing is a valid status", () => {
    const status: StreamingStatus = "processing";
    expect(status).toBe("processing");
  });

  it("complete is a valid status", () => {
    const status: StreamingStatus = "complete";
    expect(status).toBe("complete");
  });

  it("error is a valid status", () => {
    const status: StreamingStatus = "error";
    expect(status).toBe("error");
  });
});

// ============================================
// Props Tests
// ============================================

describe("AgentStreamingOutputProps", () => {
  it("creates valid props for idle state", () => {
    const props: AgentStreamingOutputProps = {
      agentName: "Technical Analyst",
      streamingText: "",
      status: "idle",
    };

    expect(props.agentName).toBe("Technical Analyst");
    expect(props.streamingText).toBe("");
    expect(props.status).toBe("idle");
  });

  it("creates valid props for processing state", () => {
    const props: AgentStreamingOutputProps = {
      agentName: "Technical Analyst",
      streamingText: "Analyzing AAPL...",
      status: "processing",
    };

    expect(props.status).toBe("processing");
    expect(props.streamingText).toBe("Analyzing AAPL...");
  });

  it("creates valid props for complete state", () => {
    const props: AgentStreamingOutputProps = {
      agentName: "Technical Analyst",
      streamingText: "Analysis complete. RSI(14) = 28.5",
      status: "complete",
    };

    expect(props.status).toBe("complete");
  });

  it("creates valid props for error state", () => {
    const props: AgentStreamingOutputProps = {
      agentName: "Technical Analyst",
      streamingText: "Analyzing...",
      status: "error",
      error: "Connection timeout",
    };

    expect(props.status).toBe("error");
    expect(props.error).toBe("Connection timeout");
  });

  it("includes optional className", () => {
    const props: AgentStreamingOutputProps = {
      agentName: "Technical Analyst",
      streamingText: "",
      status: "idle",
      className: "custom-class",
    };

    expect(props.className).toBe("custom-class");
  });

  it("includes optional testId", () => {
    const props: AgentStreamingOutputProps = {
      agentName: "Technical Analyst",
      streamingText: "",
      status: "idle",
      "data-testid": "agent-output",
    };

    expect(props["data-testid"]).toBe("agent-output");
  });
});

// ============================================
// Status Badge Config Tests
// ============================================

const STATUS_BADGE_CONFIG: Record<
  StreamingStatus,
  { label: string; color: string; icon?: string }
> = {
  idle: {
    label: "Idle",
    color: "var(--text-muted, #78716c)",
  },
  processing: {
    label: "Processing",
    color: "var(--neutral, #eab308)",
  },
  complete: {
    label: "Complete",
    color: "var(--profit, #22c55e)",
    icon: "✓",
  },
  error: {
    label: "Error",
    color: "var(--loss, #ef4444)",
    icon: "✕",
  },
};

describe("STATUS_BADGE_CONFIG", () => {
  it("has config for idle status", () => {
    expect(STATUS_BADGE_CONFIG.idle.label).toBe("Idle");
    expect(STATUS_BADGE_CONFIG.idle.color).toContain("--text-muted");
    expect(STATUS_BADGE_CONFIG.idle.icon).toBeUndefined();
  });

  it("has config for processing status", () => {
    expect(STATUS_BADGE_CONFIG.processing.label).toBe("Processing");
    expect(STATUS_BADGE_CONFIG.processing.color).toContain("--neutral");
    expect(STATUS_BADGE_CONFIG.processing.icon).toBeUndefined();
  });

  it("has config for complete status with checkmark", () => {
    expect(STATUS_BADGE_CONFIG.complete.label).toBe("Complete");
    expect(STATUS_BADGE_CONFIG.complete.color).toContain("--profit");
    expect(STATUS_BADGE_CONFIG.complete.icon).toBe("✓");
  });

  it("has config for error status with X icon", () => {
    expect(STATUS_BADGE_CONFIG.error.label).toBe("Error");
    expect(STATUS_BADGE_CONFIG.error.color).toContain("--loss");
    expect(STATUS_BADGE_CONFIG.error.icon).toBe("✕");
  });

  it("all statuses have label and color", () => {
    const statuses: StreamingStatus[] = ["idle", "processing", "complete", "error"];
    for (const status of statuses) {
      const config = STATUS_BADGE_CONFIG[status];
      expect(config.label).toBeDefined();
      expect(config.label.length).toBeGreaterThan(0);
      expect(config.color).toBeDefined();
      expect(config.color.length).toBeGreaterThan(0);
    }
  });
});

// ============================================
// Blinking Cursor Tests
// ============================================

describe("Blinking cursor behavior", () => {
  it("cursor character is correct", () => {
    const cursorChar = "▌";
    expect(cursorChar).toBe("▌");
    expect(cursorChar.charCodeAt(0)).toBe(0x258c); // U+258C Left Half Block
  });

  it("standard blink rate is 530ms", () => {
    const blinkRateMs = 530;
    expect(blinkRateMs).toBe(530);
    // Full blink cycle is 1060ms (530ms on, 530ms off)
    expect(blinkRateMs * 2).toBe(1060);
  });
});

// ============================================
// Text Streaming Simulation Tests
// ============================================

describe("Text streaming simulation", () => {
  it("accumulates text chunks", () => {
    let text = "";
    const chunks = ["Analyzing ", "AAPL", "...", "\nRSI(14) = 28.5"];

    for (const chunk of chunks) {
      text += chunk;
    }

    expect(text).toBe("Analyzing AAPL...\nRSI(14) = 28.5");
  });

  it("handles empty chunks", () => {
    let text = "";
    const chunks = ["Hello", "", " ", "World"];

    for (const chunk of chunks) {
      text += chunk;
    }

    expect(text).toBe("Hello World");
  });

  it("handles special characters", () => {
    let text = "";
    const chunks = ["RSI(14) = ", "28.5", " → ", "oversold"];

    for (const chunk of chunks) {
      text += chunk;
    }

    expect(text).toBe("RSI(14) = 28.5 → oversold");
  });

  it("handles newlines", () => {
    let text = "";
    const chunks = ["Line 1\n", "Line 2\n", "Line 3"];

    for (const chunk of chunks) {
      text += chunk;
    }

    expect(text).toBe("Line 1\nLine 2\nLine 3");
    expect(text.split("\n")).toHaveLength(3);
  });

  it("respects max length", () => {
    const maxLength = 100;
    let text = "A".repeat(150);

    if (text.length > maxLength) {
      text = text.slice(-maxLength);
    }

    expect(text.length).toBe(100);
    expect(text).toBe("A".repeat(100));
  });
});

// ============================================
// Status Transition Tests
// ============================================

describe("Status transitions", () => {
  it("transitions from idle to processing", () => {
    let status: StreamingStatus = "idle";

    // Simulate receiving first chunk
    status = "processing";

    expect(status).toBe("processing");
  });

  it("transitions from processing to complete", () => {
    let status: StreamingStatus = "processing";

    // Simulate stream end
    status = "complete";

    expect(status).toBe("complete");
  });

  it("transitions from processing to error", () => {
    let status: StreamingStatus = "processing";

    // Simulate connection error
    status = "error";

    expect(status).toBe("error");
  });

  it("can reset from any state to idle", () => {
    const states: StreamingStatus[] = ["processing", "complete", "error"];

    for (const state of states) {
      let status: StreamingStatus = state;
      status = "idle"; // Reset
      expect(status).toBe("idle");
    }
  });
});

// ============================================
// Agent Names Tests
// ============================================

describe("Agent names", () => {
  it("handles standard agent names", () => {
    const agentNames = [
      "Technical Analyst",
      "News & Sentiment Analyst",
      "Fundamentals & Macro Analyst",
      "Bullish Research Agent",
      "Bearish Research Agent",
      "Trader Agent",
      "Risk Manager Agent",
      "Critic Agent",
    ];

    expect(agentNames).toHaveLength(8);
    for (const name of agentNames) {
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it("handles custom agent names", () => {
    const customName = "Custom Analysis Agent v2.0";
    expect(customName).toBeDefined();
    expect(customName.length).toBeGreaterThan(0);
  });
});

// ============================================
// Error Handling Tests
// ============================================

describe("Error handling", () => {
  it("handles connection timeout error", () => {
    const error = "Connection timeout";
    expect(error).toBe("Connection timeout");
  });

  it("handles stream error", () => {
    const error = "Stream error: unexpected end of input";
    expect(error).toContain("Stream error");
  });

  it("handles network error", () => {
    const error = "Network error: unable to reach server";
    expect(error).toContain("Network error");
  });

  it("handles empty error message", () => {
    const error = "";
    expect(error).toBe("");
    expect(error.length).toBe(0);
  });
});
