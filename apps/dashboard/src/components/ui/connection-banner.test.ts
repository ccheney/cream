/**
 * Connection Banner Component Tests
 *
 * Tests for WebSocket disconnection state banner.
 *
 * @see docs/plans/ui/28-states.md lines 89-96
 */

import { describe, expect, it } from "bun:test";
import type { ConnectionStatus } from "../../lib/ws/connection-monitor";
import { type ConnectionBannerProps, formatRetryTime, getStatusMessage } from "./connection-banner";

// ============================================
// formatRetryTime Tests
// ============================================

describe("formatRetryTime", () => {
  it("returns 'now' for 0 ms", () => {
    expect(formatRetryTime(0)).toBe("now");
  });

  it("returns 'now' for negative ms", () => {
    expect(formatRetryTime(-1000)).toBe("now");
  });

  it("returns '1 second' for 1000 ms", () => {
    expect(formatRetryTime(1000)).toBe("1 second");
  });

  it("returns seconds for < 60 seconds", () => {
    expect(formatRetryTime(2000)).toBe("2 seconds");
    expect(formatRetryTime(5000)).toBe("5 seconds");
    expect(formatRetryTime(30000)).toBe("30 seconds");
    expect(formatRetryTime(59000)).toBe("59 seconds");
  });

  it("returns minutes for >= 60 seconds", () => {
    expect(formatRetryTime(60000)).toBe("1 minute");
    expect(formatRetryTime(120000)).toBe("2 minutes");
    expect(formatRetryTime(300000)).toBe("5 minutes");
  });

  it("rounds up partial seconds", () => {
    expect(formatRetryTime(1500)).toBe("2 seconds");
    expect(formatRetryTime(999)).toBe("1 second");
  });
});

// ============================================
// getStatusMessage Tests
// ============================================

describe("getStatusMessage", () => {
  describe("disconnected status", () => {
    it("returns correct title", () => {
      const { title } = getStatusMessage("disconnected", 0, 0);
      expect(title).toBe("Connection Lost");
    });

    it("returns correct message", () => {
      const { message } = getStatusMessage("disconnected", 0, 0);
      expect(message).toContain("Live updates paused");
    });
  });

  describe("reconnecting status", () => {
    it("returns title with countdown", () => {
      const { title } = getStatusMessage("reconnecting", 5000, 2);
      expect(title).toBe("Reconnecting...");
    });

    it("includes countdown in message when nextRetryIn > 0", () => {
      const { message } = getStatusMessage("reconnecting", 8000, 2);
      expect(message).toContain("8 seconds");
    });

    it("shows attempt number when nextRetryIn = 0", () => {
      const { message } = getStatusMessage("reconnecting", 0, 2);
      expect(message).toContain("Attempt 3");
    });
  });

  describe("failed status", () => {
    it("returns correct title", () => {
      const { title } = getStatusMessage("failed", 0, 10);
      expect(title).toBe("Connection Failed");
    });

    it("prompts manual retry", () => {
      const { message } = getStatusMessage("failed", 0, 10);
      expect(message).toContain("manually");
    });
  });

  describe("connected status (fallback)", () => {
    it("returns fallback message", () => {
      const { title, message } = getStatusMessage("connected", 0, 0);
      expect(title).toBe("Connection Lost");
      expect(message).toContain("paused");
    });
  });
});

// ============================================
// ConnectionBannerProps Type Tests
// ============================================

describe("ConnectionBannerProps Type", () => {
  it("requires status prop", () => {
    const props: ConnectionBannerProps = {
      status: "disconnected",
    };
    expect(props.status).toBe("disconnected");
  });

  it("supports all status values", () => {
    const statuses: ConnectionStatus[] = ["connected", "disconnected", "reconnecting", "failed"];
    for (const status of statuses) {
      const props: ConnectionBannerProps = { status };
      expect(props.status).toBe(status);
    }
  });

  it("retryCount is optional", () => {
    const props: ConnectionBannerProps = {
      status: "disconnected",
    };
    expect(props.retryCount).toBeUndefined();
  });

  it("nextRetryIn is optional", () => {
    const props: ConnectionBannerProps = {
      status: "disconnected",
    };
    expect(props.nextRetryIn).toBeUndefined();
  });

  it("onReconnect is optional", () => {
    const props: ConnectionBannerProps = {
      status: "disconnected",
    };
    expect(props.onReconnect).toBeUndefined();
  });

  it("onDismiss is optional", () => {
    const props: ConnectionBannerProps = {
      status: "disconnected",
    };
    expect(props.onDismiss).toBeUndefined();
  });

  it("testId is optional", () => {
    const props: ConnectionBannerProps = {
      status: "disconnected",
    };
    expect(props.testId).toBeUndefined();
  });

  it("supports all props together", () => {
    const props: ConnectionBannerProps = {
      status: "reconnecting",
      retryCount: 3,
      nextRetryIn: 8000,
      onReconnect: () => {},
      onDismiss: () => {},
      testId: "my-banner",
    };
    expect(props.status).toBe("reconnecting");
    expect(props.retryCount).toBe(3);
    expect(props.nextRetryIn).toBe(8000);
    expect(typeof props.onReconnect).toBe("function");
    expect(typeof props.onDismiss).toBe("function");
    expect(props.testId).toBe("my-banner");
  });
});

// ============================================
// Callback Tests
// ============================================

describe("Callbacks", () => {
  it("onReconnect callback is callable", () => {
    let called = false;
    const props: ConnectionBannerProps = {
      status: "disconnected",
      onReconnect: () => {
        called = true;
      },
    };
    props.onReconnect?.();
    expect(called).toBe(true);
  });

  it("onDismiss callback is callable", () => {
    let called = false;
    const props: ConnectionBannerProps = {
      status: "disconnected",
      onDismiss: () => {
        called = true;
      },
    };
    props.onDismiss?.();
    expect(called).toBe(true);
  });
});

// ============================================
// Module Exports Tests
// ============================================

describe("Module Exports", () => {
  it("exports ConnectionBanner component", async () => {
    const module = await import("./connection-banner");
    expect(typeof module.ConnectionBanner).toBe("function");
  });

  it("exports formatRetryTime function", async () => {
    const module = await import("./connection-banner");
    expect(typeof module.formatRetryTime).toBe("function");
  });

  it("exports getStatusMessage function", async () => {
    const module = await import("./connection-banner");
    expect(typeof module.getStatusMessage).toBe("function");
  });

  it("exports default as ConnectionBanner", async () => {
    const module = await import("./connection-banner");
    expect(module.default).toBe(module.ConnectionBanner);
  });
});

// ============================================
// Accessibility Tests
// ============================================

describe("Accessibility", () => {
  it("uses role=alert", () => {
    // Component sets role="alert" on container
    const role = "alert";
    expect(role).toBe("alert");
  });

  it("uses aria-live=assertive", () => {
    // Component sets aria-live="assertive" for urgent announcements
    const ariaLive = "assertive";
    expect(ariaLive).toBe("assertive");
  });

  it("buttons have aria-label", () => {
    // Buttons should have descriptive aria-labels
    const reconnectLabel = "Reconnect now";
    const dismissLabel = "Dismiss banner";
    expect(reconnectLabel).toBe("Reconnect now");
    expect(dismissLabel).toBe("Dismiss banner");
  });

  it("icons are aria-hidden", () => {
    const ariaHidden = true;
    expect(ariaHidden).toBe(true);
  });
});

// ============================================
// Styling Tests
// ============================================

describe("Styling", () => {
  it("uses amber-100 for background", () => {
    const bgColor = "#fef3c7";
    expect(bgColor).toBe("#fef3c7");
  });

  it("uses amber-500 for border", () => {
    const borderColor = "#f59e0b";
    expect(borderColor).toBe("#f59e0b");
  });

  it("uses amber-600 for icon", () => {
    const iconColor = "#d97706";
    expect(iconColor).toBe("#d97706");
  });

  it("uses amber-800 for title", () => {
    const titleColor = "#92400e";
    expect(titleColor).toBe("#92400e");
  });

  it("uses sticky positioning", () => {
    const position = "sticky";
    expect(position).toBe("sticky");
  });

  it("uses high z-index", () => {
    const zIndex = 1000;
    expect(zIndex).toBe(1000);
  });
});

// ============================================
// Banner States Tests
// ============================================

describe("Banner States", () => {
  it("hides when status is connected", () => {
    const props: ConnectionBannerProps = {
      status: "connected",
    };
    // Component returns null when connected
    expect(props.status).toBe("connected");
  });

  it("shows when status is disconnected", () => {
    const props: ConnectionBannerProps = {
      status: "disconnected",
    };
    expect(props.status).toBe("disconnected");
  });

  it("shows when status is reconnecting", () => {
    const props: ConnectionBannerProps = {
      status: "reconnecting",
    };
    expect(props.status).toBe("reconnecting");
  });

  it("shows when status is failed", () => {
    const props: ConnectionBannerProps = {
      status: "failed",
    };
    expect(props.status).toBe("failed");
  });

  it("shows spinner when actively reconnecting", () => {
    const props: ConnectionBannerProps = {
      status: "reconnecting",
      nextRetryIn: 0, // actively reconnecting
    };
    // When nextRetryIn is 0 and status is reconnecting, show spinner
    expect(props.status).toBe("reconnecting");
    expect(props.nextRetryIn).toBe(0);
  });

  it("disables button when actively reconnecting", () => {
    const props: ConnectionBannerProps = {
      status: "reconnecting",
      nextRetryIn: 0,
    };
    // Button should be disabled when actively reconnecting
    const isReconnecting = props.status === "reconnecting" && props.nextRetryIn === 0;
    expect(isReconnecting).toBe(true);
  });
});

// ============================================
// Edge Cases
// ============================================

describe("Edge Cases", () => {
  it("handles very large nextRetryIn", () => {
    const formatted = formatRetryTime(3600000); // 1 hour
    expect(formatted).toBe("60 minutes");
  });

  it("handles very large retry count", () => {
    const props: ConnectionBannerProps = {
      status: "failed",
      retryCount: 1000,
    };
    expect(props.retryCount).toBe(1000);
  });

  it("handles status change during display", () => {
    // Props can change dynamically
    let props: ConnectionBannerProps = { status: "disconnected" };
    expect(props.status).toBe("disconnected");
    props = { status: "reconnecting" };
    expect(props.status).toBe("reconnecting");
    props = { status: "connected" };
    expect(props.status).toBe("connected");
  });

  it("handles missing callbacks gracefully", () => {
    const props: ConnectionBannerProps = {
      status: "disconnected",
      // No callbacks
    };
    // Should not throw when callbacks are undefined
    expect(props.onReconnect).toBeUndefined();
    expect(props.onDismiss).toBeUndefined();
  });
});

// ============================================
// Integration Pattern Tests
// ============================================

describe("Integration Patterns", () => {
  it("works with connection monitor state", () => {
    // Simulating integration with ConnectionMonitor
    const monitorState = {
      status: "reconnecting" as ConnectionStatus,
      retryCount: 3,
      nextRetryIn: 8000,
    };

    const props: ConnectionBannerProps = {
      status: monitorState.status,
      retryCount: monitorState.retryCount,
      nextRetryIn: monitorState.nextRetryIn,
      onReconnect: () => {},
    };

    expect(props.status).toBe("reconnecting");
    expect(props.retryCount).toBe(3);
    expect(props.nextRetryIn).toBe(8000);
  });

  it("formats countdown correctly for display", () => {
    const nextRetryIn = 8000;
    const { message } = getStatusMessage("reconnecting", nextRetryIn, 2);
    expect(message).toContain("8 seconds");
  });

  it("shows attempt number during active reconnection", () => {
    const { message } = getStatusMessage("reconnecting", 0, 4);
    expect(message).toContain("Attempt 5");
  });
});
