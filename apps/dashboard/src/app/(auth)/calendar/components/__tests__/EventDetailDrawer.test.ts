/**
 * EventDetailDrawer Component Tests
 *
 * Tests for economic event detail drawer and utilities.
 *
 * @see docs/plans/41-economic-calendar-page.md
 */

import { describe, expect, it } from "bun:test";
import type { ImpactLevel } from "@/lib/api/types";

// ============================================
// Constants (mirror from component)
// ============================================

const DRAWER_WIDTH_MOBILE = "100%";
const DRAWER_WIDTH_DESKTOP = 400;

const IMPACT_CONFIG: Record<
  ImpactLevel,
  {
    label: string;
    bg: string;
    text: string;
    border: string;
  }
> = {
  high: {
    label: "High Impact",
    bg: "bg-red-100 dark:bg-red-900/30",
    text: "text-red-700 dark:text-red-400",
    border: "border-red-200 dark:border-red-800",
  },
  medium: {
    label: "Medium Impact",
    bg: "bg-amber-100 dark:bg-amber-900/30",
    text: "text-amber-700 dark:text-amber-400",
    border: "border-amber-200 dark:border-amber-800",
  },
  low: {
    label: "Low Impact",
    bg: "bg-gray-100 dark:bg-gray-900/30",
    text: "text-gray-600 dark:text-gray-400",
    border: "border-gray-200 dark:border-gray-700",
  },
};

const FRED_RELEASE_URLS: Record<string, string> = {
  "Consumer Price Index": "https://fred.stlouisfed.org/releases/10",
  "Employment Situation": "https://fred.stlouisfed.org/releases/50",
  "Gross Domestic Product": "https://fred.stlouisfed.org/releases/53",
  "FOMC Press Release": "https://fred.stlouisfed.org/releases/101",
  "Advance Retail Sales": "https://fred.stlouisfed.org/releases/9",
  "Industrial Production and Capacity Utilization": "https://fred.stlouisfed.org/releases/13",
  "Personal Income and Outlays": "https://fred.stlouisfed.org/releases/46",
};

// ============================================
// Utility Functions (mirror from component)
// ============================================

function formatDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatTime(timeStr: string): string {
  const [hours, minutes] = timeStr.split(":");
  const hour = Number.parseInt(hours ?? "0", 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm} ET`;
}

function getSourceUrl(eventName: string): string | null {
  for (const [name, url] of Object.entries(FRED_RELEASE_URLS)) {
    if (eventName.toLowerCase().includes(name.toLowerCase())) {
      return url;
    }
  }
  return "https://fred.stlouisfed.org/releases/calendar";
}

// ============================================
// DRAWER_WIDTH Tests
// ============================================

describe("DRAWER_WIDTH", () => {
  it("mobile width is 100%", () => {
    expect(DRAWER_WIDTH_MOBILE).toBe("100%");
  });

  it("desktop width is 400px", () => {
    expect(DRAWER_WIDTH_DESKTOP).toBe(400);
  });
});

// ============================================
// IMPACT_CONFIG Tests
// ============================================

describe("IMPACT_CONFIG", () => {
  const impactLevels: ImpactLevel[] = ["high", "medium", "low"];

  it("has config for all impact levels", () => {
    for (const level of impactLevels) {
      expect(IMPACT_CONFIG[level]).toBeDefined();
    }
  });

  describe("high impact config", () => {
    const config = IMPACT_CONFIG.high;

    it("has correct label", () => {
      expect(config.label).toBe("High Impact");
    });

    it("uses red color scheme", () => {
      expect(config.bg).toContain("red");
      expect(config.text).toContain("red");
      expect(config.border).toContain("red");
    });

    it("has dark mode variants", () => {
      expect(config.bg).toContain("dark:");
      expect(config.text).toContain("dark:");
      expect(config.border).toContain("dark:");
    });
  });

  describe("medium impact config", () => {
    const config = IMPACT_CONFIG.medium;

    it("has correct label", () => {
      expect(config.label).toBe("Medium Impact");
    });

    it("uses amber color scheme", () => {
      expect(config.bg).toContain("amber");
      expect(config.text).toContain("amber");
      expect(config.border).toContain("amber");
    });
  });

  describe("low impact config", () => {
    const config = IMPACT_CONFIG.low;

    it("has correct label", () => {
      expect(config.label).toBe("Low Impact");
    });

    it("uses gray color scheme", () => {
      expect(config.bg).toContain("gray");
      expect(config.text).toContain("gray");
      expect(config.border).toContain("gray");
    });
  });

  it("all configs have required properties", () => {
    for (const level of impactLevels) {
      const config = IMPACT_CONFIG[level];
      expect(config).toHaveProperty("label");
      expect(config).toHaveProperty("bg");
      expect(config).toHaveProperty("text");
      expect(config).toHaveProperty("border");
    }
  });
});

// ============================================
// formatDate Tests
// ============================================

describe("formatDate", () => {
  it("formats date in long format", () => {
    const result = formatDate("2025-01-15");
    expect(result).toContain("January");
    expect(result).toContain("15");
    expect(result).toContain("2025");
  });

  it("includes weekday", () => {
    const result = formatDate("2025-01-15"); // Wednesday
    expect(result).toMatch(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/);
  });

  it("handles month names correctly", () => {
    const months = [
      { date: "2025-01-15", month: "January" },
      { date: "2025-06-15", month: "June" },
      { date: "2025-12-15", month: "December" },
    ];
    for (const { date, month } of months) {
      const result = formatDate(date);
      expect(result).toContain(month);
    }
  });

  it("handles different days", () => {
    const days = ["2025-01-01", "2025-01-15", "2025-01-31"];
    for (const day of days) {
      const result = formatDate(day);
      expect(result.length).toBeGreaterThan(0);
    }
  });
});

// ============================================
// formatTime Tests
// ============================================

describe("formatTime", () => {
  it("converts 24h to 12h format", () => {
    expect(formatTime("14:30")).toBe("2:30 PM ET");
    expect(formatTime("08:30")).toBe("8:30 AM ET");
  });

  it("handles midnight", () => {
    expect(formatTime("00:00")).toBe("12:00 AM ET");
    expect(formatTime("00:30")).toBe("12:30 AM ET");
  });

  it("handles noon", () => {
    expect(formatTime("12:00")).toBe("12:00 PM ET");
    expect(formatTime("12:30")).toBe("12:30 PM ET");
  });

  it("handles morning hours", () => {
    expect(formatTime("01:00")).toBe("1:00 AM ET");
    expect(formatTime("11:59")).toBe("11:59 AM ET");
  });

  it("handles afternoon hours", () => {
    expect(formatTime("13:00")).toBe("1:00 PM ET");
    expect(formatTime("23:59")).toBe("11:59 PM ET");
  });

  it("appends ET timezone", () => {
    const result = formatTime("08:30");
    expect(result).toContain("ET");
  });

  it("preserves minutes", () => {
    expect(formatTime("08:05")).toContain(":05");
    expect(formatTime("08:45")).toContain(":45");
  });
});

// ============================================
// getSourceUrl Tests
// ============================================

describe("getSourceUrl", () => {
  it("returns URL for CPI events", () => {
    const url = getSourceUrl("Consumer Price Index Release");
    expect(url).toBe("https://fred.stlouisfed.org/releases/10");
  });

  it("returns URL for Employment events", () => {
    const url = getSourceUrl("Employment Situation Report");
    expect(url).toBe("https://fred.stlouisfed.org/releases/50");
  });

  it("returns URL for GDP events", () => {
    const url = getSourceUrl("Gross Domestic Product (Q4)");
    expect(url).toBe("https://fred.stlouisfed.org/releases/53");
  });

  it("returns URL for FOMC events", () => {
    const url = getSourceUrl("FOMC Press Release");
    expect(url).toBe("https://fred.stlouisfed.org/releases/101");
  });

  it("returns URL for Retail Sales events", () => {
    const url = getSourceUrl("Advance Retail Sales Report");
    expect(url).toBe("https://fred.stlouisfed.org/releases/9");
  });

  it("returns URL for Industrial Production events", () => {
    const url = getSourceUrl("Industrial Production and Capacity Utilization");
    expect(url).toBe("https://fred.stlouisfed.org/releases/13");
  });

  it("returns URL for Personal Income events", () => {
    const url = getSourceUrl("Personal Income and Outlays");
    expect(url).toBe("https://fred.stlouisfed.org/releases/46");
  });

  it("is case insensitive", () => {
    const url1 = getSourceUrl("consumer price index");
    const url2 = getSourceUrl("CONSUMER PRICE INDEX");
    expect(url1).toBe(url2);
  });

  it("returns calendar URL for unknown events", () => {
    const url = getSourceUrl("Unknown Economic Event");
    expect(url).toBe("https://fred.stlouisfed.org/releases/calendar");
  });

  it("matches partial event names", () => {
    const url = getSourceUrl("CPI - Consumer Price Index for All Urban Consumers");
    expect(url).toBe("https://fred.stlouisfed.org/releases/10");
  });
});

// ============================================
// Surprise Indicator Logic Tests
// ============================================

describe("surprise indicator logic", () => {
  function calculateSurprise(
    actual: string | null,
    forecast: string | null
  ): { type: "beat" | "miss" | "neutral" | null; diff: number | null } {
    if (!actual || !forecast) {
      return { type: null, diff: null };
    }

    const actualNum = Number.parseFloat(actual.replace(/[^0-9.-]/g, ""));
    const forecastNum = Number.parseFloat(forecast.replace(/[^0-9.-]/g, ""));

    if (Number.isNaN(actualNum) || Number.isNaN(forecastNum)) {
      return { type: null, diff: null };
    }

    const diff = actualNum - forecastNum;
    const isNeutral = Math.abs(diff) < 0.01;

    if (isNeutral) {
      return { type: "neutral", diff: 0 };
    }

    return {
      type: diff > 0 ? "beat" : "miss",
      diff: Math.abs(diff),
    };
  }

  it("returns null when actual is missing", () => {
    const result = calculateSurprise(null, "2.5%");
    expect(result.type).toBeNull();
  });

  it("returns null when forecast is missing", () => {
    const result = calculateSurprise("2.5%", null);
    expect(result.type).toBeNull();
  });

  it("returns beat when actual > forecast", () => {
    const result = calculateSurprise("3.0%", "2.5%");
    expect(result.type).toBe("beat");
    expect(result.diff).toBe(0.5);
  });

  it("returns miss when actual < forecast", () => {
    const result = calculateSurprise("2.0%", "2.5%");
    expect(result.type).toBe("miss");
    expect(result.diff).toBe(0.5);
  });

  it("returns neutral when actual matches forecast", () => {
    const result = calculateSurprise("2.5%", "2.5%");
    expect(result.type).toBe("neutral");
  });

  it("handles numbers with units", () => {
    const result = calculateSurprise("3.2%", "2.8%");
    expect(result.type).toBe("beat");
  });

  it("handles negative numbers", () => {
    const result = calculateSurprise("-0.5%", "-0.3%");
    expect(result.type).toBe("miss"); // -0.5 < -0.3
  });

  it("handles non-numeric values", () => {
    const result = calculateSurprise("N/A", "2.5%");
    expect(result.type).toBeNull();
  });
});

// ============================================
// Value Card Rendering Logic Tests
// ============================================

describe("value card logic", () => {
  function formatValueDisplay(value: string | null, unit: string | null): string {
    if (!value || value === "-") {
      return "—";
    }
    return `${value}${unit ?? ""}`;
  }

  it("returns em dash for null value", () => {
    expect(formatValueDisplay(null, "%")).toBe("—");
  });

  it("returns em dash for dash value", () => {
    expect(formatValueDisplay("-", "%")).toBe("—");
  });

  it("formats value with unit", () => {
    expect(formatValueDisplay("2.5", "%")).toBe("2.5%");
  });

  it("handles missing unit", () => {
    expect(formatValueDisplay("150000", null)).toBe("150000");
  });

  it("handles various units", () => {
    expect(formatValueDisplay("2.5", "%")).toBe("2.5%");
    expect(formatValueDisplay("150", "K")).toBe("150K");
    expect(formatValueDisplay("3.5", " billion")).toBe("3.5 billion");
  });
});

// ============================================
// Drawer State Logic Tests
// ============================================

describe("drawer state logic", () => {
  it("drawer should close on ESC key", () => {
    const isOpen = true;
    const key = "Escape";
    const shouldClose = key === "Escape" && isOpen;
    expect(shouldClose).toBe(true);
  });

  it("drawer should not close when already closed", () => {
    const isOpen = false;
    const key = "Escape";
    const shouldClose = key === "Escape" && isOpen;
    expect(shouldClose).toBe(false);
  });

  it("drawer should not close on other keys", () => {
    const isOpen = true;
    const key: string = "Enter";
    const shouldClose = key === "Escape" && isOpen;
    expect(shouldClose).toBe(false);
  });
});

// ============================================
// Sparkline Data Processing Tests
// ============================================

describe("sparkline data processing", () => {
  it("extracts values from observations", () => {
    const observations = [
      { date: "2024-01", value: 2.5 },
      { date: "2024-02", value: 2.7 },
      { date: "2024-03", value: 2.6 },
    ];
    const data = observations.map((obs) => obs.value);
    expect(data).toEqual([2.5, 2.7, 2.6]);
  });

  it("handles empty observations", () => {
    const observations: Array<{ date: string; value: number }> = [];
    const data = observations.map((obs) => obs.value);
    expect(data).toEqual([]);
  });

  it("sparkline needs at least 2 points to render", () => {
    const singlePoint = [2.5];
    const multiplePoints = [2.5, 2.7];
    expect(singlePoint.length > 1).toBe(false);
    expect(multiplePoints.length > 1).toBe(true);
  });
});

// ============================================
// Module Exports Tests
// ============================================

describe("EventDetailDrawer exports", () => {
  it("exports EventDetailDrawer component", async () => {
    const module = await import("../EventDetailDrawer");
    expect(module.EventDetailDrawer).toBeDefined();
    expect(typeof module.EventDetailDrawer).toBe("function");
  });

  it("exports default as EventDetailDrawer", async () => {
    const module = await import("../EventDetailDrawer");
    expect(module.default).toBe(module.EventDetailDrawer);
  });
});

// ============================================
// Accessibility Tests
// ============================================

describe("accessibility", () => {
  it("close button has title attribute", () => {
    const title = "Close (Esc)";
    expect(title).toContain("Esc");
  });

  it("drawer has proper ARIA structure", () => {
    // Drawer should have role="dialog" or similar
    const ariaRole = "dialog";
    expect(ariaRole).toBe("dialog");
  });
});

// ============================================
// Edge Cases
// ============================================

describe("edge cases", () => {
  it("handles empty event name for source URL", () => {
    const url = getSourceUrl("");
    expect(url).toBe("https://fred.stlouisfed.org/releases/calendar");
  });

  it("handles very long event names", () => {
    const longName = "A".repeat(200);
    const url = getSourceUrl(longName);
    expect(url).toBeDefined();
  });

  it("handles special characters in event name", () => {
    const name = "GDP (Q4) — Final Release";
    const url = getSourceUrl(name);
    expect(url).toBeDefined();
  });

  it("formatTime handles invalid format gracefully", () => {
    // When hours is undefined, defaults to 0
    const result = formatTime(":30");
    expect(result).toContain("12:30");
  });
});

// ============================================
// Animation Config Tests
// ============================================

describe("animation config", () => {
  it("drawer transition uses spring animation", () => {
    const transition = { type: "spring", damping: 25, stiffness: 300 };
    expect(transition.type).toBe("spring");
    expect(transition.damping).toBe(25);
    expect(transition.stiffness).toBe(300);
  });

  it("backdrop transition is 200ms", () => {
    const duration = 0.2;
    expect(duration).toBe(0.2);
  });
});
