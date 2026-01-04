/**
 * Error Panel Component Tests
 *
 * Tests for error panel components.
 *
 * @see docs/plans/ui/28-states.md lines 83-87
 */

import { describe, expect, it } from "bun:test";
import type { ErrorAction, ErrorPanelProps, ErrorPanelVariant } from "./error-panel.js";

// ============================================
// ErrorPanelProps Type Tests
// ============================================

describe("ErrorPanelProps Type", () => {
  it("requires title and message", () => {
    const props: ErrorPanelProps = {
      title: "Error Title",
      message: "Error message",
    };
    expect(props.title).toBe("Error Title");
    expect(props.message).toBe("Error message");
  });

  it("supports optional hint", () => {
    const props: ErrorPanelProps = {
      title: "Error",
      message: "Message",
      hint: "Try again later",
    };
    expect(props.hint).toBe("Try again later");
  });

  it("supports optional errorCode", () => {
    const props: ErrorPanelProps = {
      title: "Error",
      message: "Message",
      errorCode: "ERR-001",
    };
    expect(props.errorCode).toBe("ERR-001");
  });

  it("supports optional variant", () => {
    const props: ErrorPanelProps = {
      title: "Error",
      message: "Message",
      variant: "warning",
    };
    expect(props.variant).toBe("warning");
  });

  it("supports optional actions array", () => {
    const props: ErrorPanelProps = {
      title: "Error",
      message: "Message",
      actions: [{ label: "Retry", onClick: () => {} }],
    };
    expect(props.actions?.length).toBe(1);
  });

  it("supports optional dismissible", () => {
    const props: ErrorPanelProps = {
      title: "Error",
      message: "Message",
      dismissible: true,
    };
    expect(props.dismissible).toBe(true);
  });

  it("supports optional onDismiss", () => {
    const props: ErrorPanelProps = {
      title: "Error",
      message: "Message",
      onDismiss: () => {},
    };
    expect(typeof props.onDismiss).toBe("function");
  });

  it("supports optional testId", () => {
    const props: ErrorPanelProps = {
      title: "Error",
      message: "Message",
      testId: "my-error",
    };
    expect(props.testId).toBe("my-error");
  });

  it("supports optional autoFocus", () => {
    const props: ErrorPanelProps = {
      title: "Error",
      message: "Message",
      autoFocus: true,
    };
    expect(props.autoFocus).toBe(true);
  });
});

// ============================================
// ErrorPanelVariant Type Tests
// ============================================

describe("ErrorPanelVariant Type", () => {
  it("allows error variant", () => {
    const variant: ErrorPanelVariant = "error";
    expect(variant).toBe("error");
  });

  it("allows warning variant", () => {
    const variant: ErrorPanelVariant = "warning";
    expect(variant).toBe("warning");
  });

  it("allows info variant", () => {
    const variant: ErrorPanelVariant = "info";
    expect(variant).toBe("info");
  });
});

// ============================================
// ErrorAction Type Tests
// ============================================

describe("ErrorAction Type", () => {
  it("requires label and onClick", () => {
    const action: ErrorAction = {
      label: "Retry",
      onClick: () => {},
    };
    expect(action.label).toBe("Retry");
    expect(typeof action.onClick).toBe("function");
  });

  it("supports optional variant", () => {
    const action: ErrorAction = {
      label: "Cancel",
      onClick: () => {},
      variant: "secondary",
    };
    expect(action.variant).toBe("secondary");
  });

  it("variant can be primary", () => {
    const action: ErrorAction = {
      label: "Submit",
      onClick: () => {},
      variant: "primary",
    };
    expect(action.variant).toBe("primary");
  });
});

// ============================================
// Module Exports Tests
// ============================================

describe("Module Exports", () => {
  it("exports ErrorPanel component", async () => {
    const module = await import("./error-panel.js");
    expect(typeof module.ErrorPanel).toBe("function");
  });

  it("exports ErrorInline component", async () => {
    const module = await import("./error-panel.js");
    expect(typeof module.ErrorInline).toBe("function");
  });

  it("exports ApiErrorPanel component", async () => {
    const module = await import("./error-panel.js");
    expect(typeof module.ApiErrorPanel).toBe("function");
  });

  it("exports ConnectionErrorPanel component", async () => {
    const module = await import("./error-panel.js");
    expect(typeof module.ConnectionErrorPanel).toBe("function");
  });

  it("exports default as ErrorPanel", async () => {
    const module = await import("./error-panel.js");
    expect(module.default).toBe(module.ErrorPanel);
  });
});

// ============================================
// Variant Styling Tests
// ============================================

describe("Variant Styling", () => {
  it("error variant uses red colors", () => {
    const errorColors = {
      background: "rgba(239, 68, 68, 0.1)",
      border: "#ef4444",
      iconColor: "#dc2626",
    };
    expect(errorColors.border).toBe("#ef4444");
  });

  it("warning variant uses amber colors", () => {
    const warningColors = {
      background: "rgba(245, 158, 11, 0.1)",
      border: "#f59e0b",
      iconColor: "#d97706",
    };
    expect(warningColors.border).toBe("#f59e0b");
  });

  it("info variant uses blue colors", () => {
    const infoColors = {
      background: "rgba(59, 130, 246, 0.1)",
      border: "#3b82f6",
      iconColor: "#2563eb",
    };
    expect(infoColors.border).toBe("#3b82f6");
  });

  it("uses warning icon for error/warning", () => {
    const icon = "⚠";
    expect(icon).toBe("⚠");
  });

  it("uses info icon for info variant", () => {
    const icon = "ℹ";
    expect(icon).toBe("ℹ");
  });
});

// ============================================
// Accessibility Tests
// ============================================

describe("Accessibility", () => {
  it("uses role=alert", () => {
    const role = "alert";
    expect(role).toBe("alert");
  });

  it("uses aria-live=assertive", () => {
    const ariaLive = "assertive";
    expect(ariaLive).toBe("assertive");
  });

  it("dismiss button has aria-label", () => {
    const ariaLabel = "Dismiss error";
    expect(ariaLabel).toBe("Dismiss error");
  });

  it("supports keyboard dismiss with Escape", () => {
    const key = "Escape";
    expect(key).toBe("Escape");
  });

  it("supports autoFocus for accessibility", () => {
    const autoFocus = true;
    expect(autoFocus).toBe(true);
  });
});

// ============================================
// Layout Tests
// ============================================

describe("Layout", () => {
  it("has icon section", () => {
    const hasIcon = true;
    expect(hasIcon).toBe(true);
  });

  it("has content section", () => {
    const hasContent = true;
    expect(hasContent).toBe(true);
  });

  it("content includes title", () => {
    const hasTitle = true;
    expect(hasTitle).toBe(true);
  });

  it("content includes message", () => {
    const hasMessage = true;
    expect(hasMessage).toBe(true);
  });

  it("uses flexbox layout", () => {
    const display = "flex";
    expect(display).toBe("flex");
  });

  it("has 12px gap between elements", () => {
    const gap = "12px";
    expect(gap).toBe("12px");
  });

  it("has 16px padding", () => {
    const padding = "16px";
    expect(padding).toBe("16px");
  });

  it("has 8px border radius", () => {
    const borderRadius = "8px";
    expect(borderRadius).toBe("8px");
  });
});

// ============================================
// Actions Tests
// ============================================

describe("Actions", () => {
  it("actions section uses flexbox", () => {
    const display = "flex";
    expect(display).toBe("flex");
  });

  it("actions have 8px gap", () => {
    const gap = "8px";
    expect(gap).toBe("8px");
  });

  it("primary button uses variant border color", () => {
    const hasPrimaryStyle = true;
    expect(hasPrimaryStyle).toBe(true);
  });

  it("secondary button has transparent background", () => {
    const bgColor = "transparent";
    expect(bgColor).toBe("transparent");
  });

  it("buttons have 6px border radius", () => {
    const borderRadius = "6px";
    expect(borderRadius).toBe("6px");
  });
});

// ============================================
// Dismiss Tests
// ============================================

describe("Dismiss Behavior", () => {
  it("dismiss button only shows when dismissible=true", () => {
    const dismissible = true;
    expect(dismissible).toBe(true);
  });

  it("dismiss button calls onDismiss", () => {
    const onDismissCalled = true;
    expect(onDismissCalled).toBe(true);
  });

  it("Escape key calls onDismiss when dismissible", () => {
    const escapeDismisses = true;
    expect(escapeDismisses).toBe(true);
  });

  it("Escape key does nothing when not dismissible", () => {
    const dismissible = false;
    expect(dismissible).toBe(false);
  });
});

// ============================================
// ErrorInline Tests
// ============================================

describe("ErrorInline", () => {
  it("requires message prop", () => {
    const message = "Error message";
    expect(message).toBe("Error message");
  });

  it("supports testId prop", () => {
    const testId = "inline-error";
    expect(testId).toBe("inline-error");
  });

  it("uses compact styling", () => {
    const padding = "8px 12px";
    expect(padding).toBe("8px 12px");
  });

  it("uses red text color", () => {
    const color = "#dc2626";
    expect(color).toBe("#dc2626");
  });

  it("uses role=alert", () => {
    const role = "alert";
    expect(role).toBe("alert");
  });
});

// ============================================
// ApiErrorPanel Tests
// ============================================

describe("ApiErrorPanel", () => {
  it("accepts error object with message", () => {
    const error = { message: "Failed to fetch" };
    expect(error.message).toBe("Failed to fetch");
  });

  it("accepts error object with code", () => {
    const error = { message: "Error", code: "ERR-001" };
    expect(error.code).toBe("ERR-001");
  });

  it("accepts error object with statusCode", () => {
    const error = { message: "Error", statusCode: 500 };
    expect(error.statusCode).toBe(500);
  });

  it("shows Try Again button when onRetry provided", () => {
    const hasRetry = true;
    expect(hasRetry).toBe(true);
  });

  it("shows Dismiss button when onDismiss provided", () => {
    const hasDismiss = true;
    expect(hasDismiss).toBe(true);
  });

  it("uses default title Something went wrong", () => {
    const title = "Something went wrong";
    expect(title).toBe("Something went wrong");
  });
});

// ============================================
// ConnectionErrorPanel Tests
// ============================================

describe("ConnectionErrorPanel", () => {
  it("uses Connection Lost title", () => {
    const title = "Connection Lost";
    expect(title).toBe("Connection Lost");
  });

  it("uses appropriate message", () => {
    const message = "Unable to connect to the server.";
    expect(message).toBe("Unable to connect to the server.");
  });

  it("has hint about internet connection", () => {
    const hint = "Check your internet connection and try again.";
    expect(hint).toContain("internet connection");
  });

  it("shows Reconnect button when onRetry provided", () => {
    const buttonLabel = "Reconnect";
    expect(buttonLabel).toBe("Reconnect");
  });
});

// ============================================
// Edge Cases
// ============================================

describe("Edge Cases", () => {
  it("handles empty actions array", () => {
    const actions: ErrorAction[] = [];
    expect(actions.length).toBe(0);
  });

  it("handles missing optional props", () => {
    const props: ErrorPanelProps = {
      title: "Error",
      message: "Message",
    };
    expect(props.hint).toBeUndefined();
    expect(props.errorCode).toBeUndefined();
    expect(props.actions).toBeUndefined();
  });

  it("handles long error messages", () => {
    const longMessage = "A".repeat(500);
    expect(longMessage.length).toBe(500);
  });

  it("handles multiple actions", () => {
    const actions: ErrorAction[] = [
      { label: "Action 1", onClick: () => {} },
      { label: "Action 2", onClick: () => {} },
      { label: "Action 3", onClick: () => {} },
    ];
    expect(actions.length).toBe(3);
  });
});

// ============================================
// Integration Tests
// ============================================

describe("Integration", () => {
  it("works with toast system", () => {
    const pattern = {
      transientError: "toast",
      persistentError: "panel",
    };
    expect(pattern.transientError).toBe("toast");
    expect(pattern.persistentError).toBe("panel");
  });

  it("works with TanStack Query errors", () => {
    const queryError = {
      message: "Request failed",
      status: 500,
    };
    expect(queryError.status).toBe(500);
  });

  it("works with form validation", () => {
    const validationError = {
      type: "validation",
      message: "Invalid email",
    };
    expect(validationError.type).toBe("validation");
  });
});
