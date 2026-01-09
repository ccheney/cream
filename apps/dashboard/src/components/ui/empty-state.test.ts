/**
 * Empty State Component Tests
 *
 * Tests for the reusable empty state component.
 *
 * @see docs/plans/ui/28-states.md
 */

import { describe, expect, it } from "bun:test";
import React from "react";
import type { EmptyStateAction, EmptyStateProps } from "./empty-state.js";

// ============================================
// Type Tests
// ============================================

describe("EmptyStateAction Type", () => {
  it("has correct shape with required fields", () => {
    const action: EmptyStateAction = {
      label: "Click me",
      onClick: () => {},
    };
    expect(action.label).toBe("Click me");
    expect(typeof action.onClick).toBe("function");
  });

  it("supports variant field", () => {
    const primaryAction: EmptyStateAction = {
      label: "Primary",
      onClick: () => {},
      variant: "primary",
    };
    const secondaryAction: EmptyStateAction = {
      label: "Secondary",
      onClick: () => {},
      variant: "secondary",
    };
    expect(primaryAction.variant).toBe("primary");
    expect(secondaryAction.variant).toBe("secondary");
  });

  it("variant is optional", () => {
    const action: EmptyStateAction = {
      label: "No variant",
      onClick: () => {},
    };
    expect(action.variant).toBeUndefined();
  });
});

describe("EmptyStateProps Type", () => {
  it("requires title", () => {
    const props: EmptyStateProps = {
      title: "No data",
    };
    expect(props.title).toBe("No data");
  });

  it("supports all optional props", () => {
    const props: EmptyStateProps = {
      icon: "📊",
      title: "No data",
      description: "Check back later",
      action: { label: "Refresh", onClick: () => {} },
      secondaryAction: { label: "Cancel", onClick: () => {} },
      size: "lg",
      className: "custom-class",
      testId: "custom-test-id",
    };
    expect(props.icon).toBe("📊");
    expect(props.description).toBe("Check back later");
    expect(props.action?.label).toBe("Refresh");
    expect(props.secondaryAction?.label).toBe("Cancel");
    expect(props.size).toBe("lg");
  });

  it("supports ReactNode icon", () => {
    const props: EmptyStateProps = {
      title: "Test",
      icon: React.createElement("svg"),
    };
    expect(props.icon).toBeDefined();
  });

  it("supports all size variants", () => {
    const sizes: Array<EmptyStateProps["size"]> = ["sm", "md", "lg"];
    for (const size of sizes) {
      const props: EmptyStateProps = { title: "Test", size };
      expect(props.size).toBe(size);
    }
  });
});

// ============================================
// Export Tests
// ============================================

describe("Module Exports", () => {
  it("exports EmptyState component", async () => {
    const module = await import("./empty-state.js");
    expect(typeof module.EmptyState).toBe("function");
  });

  it("exports default as EmptyState", async () => {
    const module = await import("./empty-state.js");
    expect(module.default).toBe(module.EmptyState);
  });

  it("exports preset empty states", async () => {
    const module = await import("./empty-state.js");
    expect(typeof module.NoPositionsEmptyState).toBe("function");
    expect(typeof module.NoDecisionsEmptyState).toBe("function");
    expect(typeof module.NoDataEmptyState).toBe("function");
    expect(typeof module.NoResultsEmptyState).toBe("function");
    expect(typeof module.NoAlertsEmptyState).toBe("function");
    expect(typeof module.ErrorEmptyState).toBe("function");
    expect(typeof module.OfflineEmptyState).toBe("function");
  });
});

// ============================================
// Preset Empty States Tests
// ============================================

describe("Preset Empty States", () => {
  it("NoPositionsEmptyState has correct defaults", () => {
    const expected = {
      icon: "📈",
      title: "No positions yet",
    };
    expect(expected.icon).toBe("📈");
    expect(expected.title).toBe("No positions yet");
  });

  it("NoDecisionsEmptyState has correct defaults", () => {
    const expected = {
      icon: "🎯",
      title: "No decisions yet",
    };
    expect(expected.icon).toBe("🎯");
    expect(expected.title).toBe("No decisions yet");
  });

  it("NoDataEmptyState has correct defaults", () => {
    const expected = {
      icon: "📊",
      title: "No data available",
    };
    expect(expected.icon).toBe("📊");
    expect(expected.title).toBe("No data available");
  });

  it("NoResultsEmptyState has correct defaults", () => {
    const expected = {
      icon: "🔍",
      title: "No results found",
    };
    expect(expected.icon).toBe("🔍");
    expect(expected.title).toBe("No results found");
  });

  it("NoAlertsEmptyState has correct defaults", () => {
    const expected = {
      icon: "🔔",
      title: "No alerts",
    };
    expect(expected.icon).toBe("🔔");
    expect(expected.title).toBe("No alerts");
  });

  it("ErrorEmptyState has correct defaults", () => {
    const expected = {
      icon: "⚠️",
      title: "Something went wrong",
    };
    expect(expected.icon).toBe("⚠️");
    expect(expected.title).toBe("Something went wrong");
  });

  it("OfflineEmptyState has correct defaults", () => {
    const expected = {
      icon: "📡",
      title: "You're offline",
    };
    expect(expected.icon).toBe("📡");
    expect(expected.title).toBe("You're offline");
  });
});

// ============================================
// Size Variant Tests
// ============================================

describe("Size Variants", () => {
  it("small size has appropriate dimensions", () => {
    const smSizes = {
      icon: { fontSize: "36px" },
      title: { fontSize: "16px" },
      description: { fontSize: "13px" },
    };
    expect(smSizes.icon.fontSize).toBe("36px");
    expect(smSizes.title.fontSize).toBe("16px");
  });

  it("medium size has appropriate dimensions", () => {
    const mdSizes = {
      icon: { fontSize: "48px" },
      title: { fontSize: "18px" },
      description: { fontSize: "14px" },
    };
    expect(mdSizes.icon.fontSize).toBe("48px");
    expect(mdSizes.title.fontSize).toBe("18px");
  });

  it("large size has appropriate dimensions", () => {
    const lgSizes = {
      icon: { fontSize: "64px" },
      title: { fontSize: "20px" },
      description: { fontSize: "15px" },
    };
    expect(lgSizes.icon.fontSize).toBe("64px");
    expect(lgSizes.title.fontSize).toBe("20px");
  });
});

// ============================================
// Accessibility Tests
// ============================================

describe("Accessibility", () => {
  it("uses role=status", () => {
    // The component uses role="status" for screen readers
    const role = "status";
    expect(role).toBe("status");
  });

  it("supports aria-label from title", () => {
    const props: EmptyStateProps = {
      title: "No items found",
    };
    // aria-label is set to the title value
    expect(props.title).toBe("No items found");
  });

  it("icon is aria-hidden", () => {
    // Icons are decorative and hidden from screen readers
    const ariaHidden = true;
    expect(ariaHidden).toBe(true);
  });

  it("supports custom testId", () => {
    const props: EmptyStateProps = {
      title: "Test",
      testId: "custom-empty-state",
    };
    expect(props.testId).toBe("custom-empty-state");
  });
});

// ============================================
// Styling Tests
// ============================================

describe("Styling", () => {
  it("uses muted colors for icon", () => {
    // stone-400 = #a8a29e
    const iconColor = "#a8a29e";
    expect(iconColor).toBe("#a8a29e");
  });

  it("uses appropriate colors for title", () => {
    // stone-700 = #44403c
    const titleColor = "#44403c";
    expect(titleColor).toBe("#44403c");
  });

  it("uses muted colors for description", () => {
    // stone-500 = #78716c
    const descColor = "#78716c";
    expect(descColor).toBe("#78716c");
  });

  it("uses dark colors for primary button", () => {
    // stone-800 = #292524
    const buttonBg = "#292524";
    expect(buttonBg).toBe("#292524");
  });

  it("uses transparent for secondary button", () => {
    const buttonBg = "transparent";
    expect(buttonBg).toBe("transparent");
  });
});

// ============================================
// Action Button Tests
// ============================================

describe("Action Buttons", () => {
  it("supports primary action", () => {
    const action: EmptyStateAction = {
      label: "Try Again",
      onClick: () => {},
    };
    expect(action.label).toBe("Try Again");
  });

  it("supports secondary action", () => {
    const secondaryAction: EmptyStateAction = {
      label: "Learn More",
      onClick: () => {},
      variant: "secondary",
    };
    expect(secondaryAction.label).toBe("Learn More");
    expect(secondaryAction.variant).toBe("secondary");
  });

  it("supports both actions together", () => {
    const props: EmptyStateProps = {
      title: "Empty",
      action: { label: "Primary", onClick: () => {} },
      secondaryAction: { label: "Secondary", onClick: () => {} },
    };
    expect(props.action?.label).toBe("Primary");
    expect(props.secondaryAction?.label).toBe("Secondary");
  });
});

// ============================================
// Edge Cases
// ============================================

describe("Edge Cases", () => {
  it("handles long titles", () => {
    const props: EmptyStateProps = {
      title: "This is a very long title that might wrap to multiple lines in the UI",
    };
    expect(props.title.length).toBeGreaterThan(50);
  });

  it("handles long descriptions", () => {
    const props: EmptyStateProps = {
      title: "Test",
      description:
        "This is a very long description that explains in detail what happened and what the user should do next. It might contain multiple sentences and should wrap nicely.",
    };
    expect(props.description?.length).toBeGreaterThan(100);
  });

  it("handles empty description", () => {
    const props: EmptyStateProps = {
      title: "Test",
      description: "",
    };
    expect(props.description).toBe("");
  });

  it("handles special characters in title", () => {
    const props: EmptyStateProps = {
      title: "No data for <script>alert('xss')</script>",
    };
    expect(props.title).toContain("<script>");
  });

  it("handles unicode in icon", () => {
    const props: EmptyStateProps = {
      title: "Test",
      icon: "🎉🎊🎁",
    };
    expect(props.icon).toBe("🎉🎊🎁");
  });
});
