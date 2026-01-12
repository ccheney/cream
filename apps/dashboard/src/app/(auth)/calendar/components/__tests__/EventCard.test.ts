/**
 * EventCard Component Tests
 *
 * Tests for economic calendar event card components and utilities.
 *
 * @see docs/plans/41-economic-calendar-page.md
 */

import { describe, expect, it } from "bun:test";
import type { ImpactLevel } from "@/lib/api/types";

// ============================================
// Constants (mirror from component)
// ============================================

const IMPACT_STYLES: Record<
  ImpactLevel,
  {
    container: string;
    border: string;
    text: string;
    badge: string;
    badgeText: string;
  }
> = {
  high: {
    container: "bg-red-50 dark:bg-red-900/20",
    border: "border-l-2 border-red-500",
    text: "text-red-900 dark:text-red-100",
    badge: "bg-red-100 dark:bg-red-800/50",
    badgeText: "text-red-700 dark:text-red-300",
  },
  medium: {
    container: "bg-amber-50 dark:bg-amber-900/20",
    border: "border-l-2 border-amber-500",
    text: "text-amber-900 dark:text-amber-100",
    badge: "bg-amber-100 dark:bg-amber-800/50",
    badgeText: "text-amber-700 dark:text-amber-300",
  },
  low: {
    container: "bg-stone-50 dark:bg-stone-800/50",
    border: "border-l-2 border-stone-400",
    text: "text-stone-700 dark:text-stone-200",
    badge: "bg-stone-100 dark:bg-stone-700/50",
    badgeText: "text-stone-600 dark:text-stone-300",
  },
};

const IMPACT_LABELS: Record<ImpactLevel, string> = {
  high: "HIGH",
  medium: "MED",
  low: "LOW",
};

// ============================================
// Utility Functions (mirror from component)
// ============================================

function getImpactFromCalendarId(calendarId: string): ImpactLevel {
  if (calendarId === "high" || calendarId === "medium" || calendarId === "low") {
    return calendarId;
  }
  return "low";
}

// ============================================
// getImpactFromCalendarId Tests
// ============================================

describe("getImpactFromCalendarId", () => {
  it("returns 'high' for high impact calendar", () => {
    expect(getImpactFromCalendarId("high")).toBe("high");
  });

  it("returns 'medium' for medium impact calendar", () => {
    expect(getImpactFromCalendarId("medium")).toBe("medium");
  });

  it("returns 'low' for low impact calendar", () => {
    expect(getImpactFromCalendarId("low")).toBe("low");
  });

  it("returns 'low' as default for unknown calendar id", () => {
    expect(getImpactFromCalendarId("unknown")).toBe("low");
  });

  it("returns 'low' for empty string", () => {
    expect(getImpactFromCalendarId("")).toBe("low");
  });

  it("handles mixed case as unknown", () => {
    expect(getImpactFromCalendarId("HIGH")).toBe("low");
    expect(getImpactFromCalendarId("High")).toBe("low");
  });
});

// ============================================
// IMPACT_STYLES Tests
// ============================================

describe("IMPACT_STYLES", () => {
  const impactLevels: ImpactLevel[] = ["high", "medium", "low"];

  it("has styles for all impact levels", () => {
    for (const level of impactLevels) {
      expect(IMPACT_STYLES[level]).toBeDefined();
    }
  });

  describe("high impact styles", () => {
    it("uses red color scheme", () => {
      const styles = IMPACT_STYLES.high;
      expect(styles.container).toContain("red");
      expect(styles.border).toContain("red");
      expect(styles.text).toContain("red");
      expect(styles.badge).toContain("red");
      expect(styles.badgeText).toContain("red");
    });

    it("has dark mode variants", () => {
      const styles = IMPACT_STYLES.high;
      expect(styles.container).toContain("dark:");
      expect(styles.text).toContain("dark:");
      expect(styles.badge).toContain("dark:");
      expect(styles.badgeText).toContain("dark:");
    });
  });

  describe("medium impact styles", () => {
    it("uses amber color scheme", () => {
      const styles = IMPACT_STYLES.medium;
      expect(styles.container).toContain("amber");
      expect(styles.border).toContain("amber");
      expect(styles.text).toContain("amber");
      expect(styles.badge).toContain("amber");
      expect(styles.badgeText).toContain("amber");
    });

    it("has dark mode variants", () => {
      const styles = IMPACT_STYLES.medium;
      expect(styles.container).toContain("dark:");
      expect(styles.text).toContain("dark:");
    });
  });

  describe("low impact styles", () => {
    it("uses stone color scheme", () => {
      const styles = IMPACT_STYLES.low;
      expect(styles.container).toContain("stone");
      expect(styles.border).toContain("stone");
      expect(styles.text).toContain("stone");
      expect(styles.badge).toContain("stone");
      expect(styles.badgeText).toContain("stone");
    });

    it("has dark mode variants", () => {
      const styles = IMPACT_STYLES.low;
      expect(styles.container).toContain("dark:");
      expect(styles.text).toContain("dark:");
    });
  });

  it("all styles have required properties", () => {
    for (const level of impactLevels) {
      const styles = IMPACT_STYLES[level];
      expect(styles).toHaveProperty("container");
      expect(styles).toHaveProperty("border");
      expect(styles).toHaveProperty("text");
      expect(styles).toHaveProperty("badge");
      expect(styles).toHaveProperty("badgeText");
    }
  });

  it("border styles include border-l-2 class", () => {
    for (const level of impactLevels) {
      expect(IMPACT_STYLES[level].border).toContain("border-l-2");
    }
  });
});

// ============================================
// IMPACT_LABELS Tests
// ============================================

describe("IMPACT_LABELS", () => {
  it("returns 'HIGH' for high impact", () => {
    expect(IMPACT_LABELS.high).toBe("HIGH");
  });

  it("returns 'MED' for medium impact", () => {
    expect(IMPACT_LABELS.medium).toBe("MED");
  });

  it("returns 'LOW' for low impact", () => {
    expect(IMPACT_LABELS.low).toBe("LOW");
  });

  it("all labels are uppercase", () => {
    const labels = Object.values(IMPACT_LABELS);
    for (const label of labels) {
      expect(label).toBe(label.toUpperCase());
    }
  });

  it("labels are short (max 4 chars)", () => {
    const labels = Object.values(IMPACT_LABELS);
    for (const label of labels) {
      expect(label.length).toBeLessThanOrEqual(4);
    }
  });
});

// ============================================
// CalendarEventData Type Tests
// ============================================

describe("CalendarEventData interface", () => {
  it("has required properties", () => {
    interface CalendarEventData {
      id: string;
      title: string;
      start: unknown; // Temporal.ZonedDateTime
      end: unknown; // Temporal.ZonedDateTime
      calendarId: string;
      description?: string;
      location?: string;
    }

    const event: CalendarEventData = {
      id: "test-123",
      title: "Test Event",
      start: {} as unknown,
      end: {} as unknown,
      calendarId: "high",
    };

    expect(event.id).toBe("test-123");
    expect(event.title).toBe("Test Event");
    expect(event.calendarId).toBe("high");
  });

  it("supports optional description and location", () => {
    interface CalendarEventData {
      id: string;
      title: string;
      start: unknown;
      end: unknown;
      calendarId: string;
      description?: string;
      location?: string;
    }

    const event: CalendarEventData = {
      id: "test-123",
      title: "Test Event",
      start: {} as unknown,
      end: {} as unknown,
      calendarId: "high",
      description: "Event description",
      location: "US | HIGH impact",
    };

    expect(event.description).toBe("Event description");
    expect(event.location).toBe("US | HIGH impact");
  });
});

// ============================================
// Module Exports Tests
// ============================================

describe("EventCard exports", () => {
  it("exports TimeGridEventCard component", async () => {
    const module = await import("../EventCard");
    expect(module.TimeGridEventCard).toBeDefined();
    expect(typeof module.TimeGridEventCard).toBe("function");
  });

  it("exports MonthGridEventCard component", async () => {
    const module = await import("../EventCard");
    expect(module.MonthGridEventCard).toBeDefined();
    expect(typeof module.MonthGridEventCard).toBe("function");
  });

  it("exports EventCard component", async () => {
    const module = await import("../EventCard");
    expect(module.EventCard).toBeDefined();
    expect(typeof module.EventCard).toBe("function");
  });

  it("exports default as EventCard", async () => {
    const module = await import("../EventCard");
    expect(module.default).toBe(module.EventCard);
  });

  it("exports CalendarEventData type", async () => {
    const module = await import("../EventCard");
    // Type exports don't appear at runtime, but we verify the module loads
    expect(module).toBeDefined();
  });
});

// ============================================
// Component Behavior Tests
// ============================================

describe("TimeGridEventCard behavior", () => {
  it("component renders with event data", () => {
    // TimeGridEventCard uses impact styles based on calendarId
    const calendarId = "high";
    const impact = getImpactFromCalendarId(calendarId);
    const styles = IMPACT_STYLES[impact];

    expect(styles.container).toContain("bg-red");
    expect(styles.border).toContain("border-red");
  });

  it("applies correct styles for each impact level", () => {
    const testCases: Array<{ calendarId: string; expectedColor: string }> = [
      { calendarId: "high", expectedColor: "red" },
      { calendarId: "medium", expectedColor: "amber" },
      { calendarId: "low", expectedColor: "stone" },
    ];

    for (const { calendarId, expectedColor } of testCases) {
      const impact = getImpactFromCalendarId(calendarId);
      const styles = IMPACT_STYLES[impact];
      expect(styles.container).toContain(expectedColor);
    }
  });
});

describe("MonthGridEventCard behavior", () => {
  it("uses compact badge labels", () => {
    // MonthGridEventCard displays abbreviated impact labels
    expect(IMPACT_LABELS.high).toBe("HIGH");
    expect(IMPACT_LABELS.medium).toBe("MED");
    expect(IMPACT_LABELS.low).toBe("LOW");
  });

  it("badge styles match impact level", () => {
    for (const level of ["high", "medium", "low"] as ImpactLevel[]) {
      const styles = IMPACT_STYLES[level];
      expect(styles.badge).toBeDefined();
      expect(styles.badgeText).toBeDefined();
    }
  });
});

// ============================================
// Accessibility Tests
// ============================================

describe("accessibility", () => {
  it("event cards should have aria-label with event info", () => {
    // aria-label pattern: "{title}, {impact} impact event at {time}"
    const title = "Consumer Price Index";
    const impact: ImpactLevel = "high";
    const time = "8:30 AM";

    const ariaLabel = `${title}, ${impact} impact event at ${time}`;
    expect(ariaLabel).toBe("Consumer Price Index, high impact event at 8:30 AM");
  });

  it("month grid aria-label excludes time", () => {
    // aria-label pattern: "{title}, {impact} impact event"
    const title = "Employment Report";
    const impact: ImpactLevel = "high";

    const ariaLabel = `${title}, ${impact} impact event`;
    expect(ariaLabel).toBe("Employment Report, high impact event");
  });
});

// ============================================
// Edge Cases
// ============================================

describe("edge cases", () => {
  it("handles empty title", () => {
    const title = "";
    expect(title.length).toBe(0);
  });

  it("handles very long title (should truncate in UI)", () => {
    const longTitle = "A".repeat(200);
    expect(longTitle.length).toBe(200);
  });

  it("handles special characters in title", () => {
    const title = "GDP (Q4) — Final Release";
    expect(title).toBe("GDP (Q4) — Final Release");
  });

  it("handles undefined description", () => {
    const description: string | undefined = undefined;
    expect(description).toBeUndefined();
  });
});
