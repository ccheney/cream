/**
 * UI Store Tests
 */

import { describe, expect, test, beforeEach } from "bun:test";
import { useUIStore } from "./ui-store.js";

describe("useUIStore", () => {
  beforeEach(() => {
    // Reset store before each test
    useUIStore.getState().reset();
  });

  describe("sidebar", () => {
    test("starts with sidebar expanded", () => {
      expect(useUIStore.getState().sidebarCollapsed).toBe(false);
    });

    test("toggleSidebar toggles collapsed state", () => {
      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().sidebarCollapsed).toBe(true);

      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().sidebarCollapsed).toBe(false);
    });

    test("setSidebarCollapsed sets specific state", () => {
      useUIStore.getState().setSidebarCollapsed(true);
      expect(useUIStore.getState().sidebarCollapsed).toBe(true);

      useUIStore.getState().setSidebarCollapsed(false);
      expect(useUIStore.getState().sidebarCollapsed).toBe(false);
    });
  });

  describe("real-time feed", () => {
    test("starts with feed visible", () => {
      expect(useUIStore.getState().realTimeFeedVisible).toBe(true);
    });

    test("toggleRealTimeFeed toggles visibility", () => {
      useUIStore.getState().toggleRealTimeFeed();
      expect(useUIStore.getState().realTimeFeedVisible).toBe(false);

      useUIStore.getState().toggleRealTimeFeed();
      expect(useUIStore.getState().realTimeFeedVisible).toBe(true);
    });

    test("feed filters start with 'all'", () => {
      expect(useUIStore.getState().realTimeFeedFilters).toEqual(["all"]);
    });

    test("setFeedFilters sets specific filters", () => {
      useUIStore.getState().setFeedFilters(["quotes", "orders"]);
      expect(useUIStore.getState().realTimeFeedFilters).toEqual([
        "quotes",
        "orders",
      ]);
    });

    test("toggleFeedFilter adds filter and removes 'all'", () => {
      useUIStore.getState().toggleFeedFilter("quotes");
      expect(useUIStore.getState().realTimeFeedFilters).toEqual(["quotes"]);
    });

    test("toggleFeedFilter removes existing filter", () => {
      useUIStore.getState().setFeedFilters(["quotes", "orders"]);
      useUIStore.getState().toggleFeedFilter("quotes");
      expect(useUIStore.getState().realTimeFeedFilters).toEqual(["orders"]);
    });

    test("toggleFeedFilter reverts to 'all' when last filter removed", () => {
      useUIStore.getState().setFeedFilters(["quotes"]);
      useUIStore.getState().toggleFeedFilter("quotes");
      expect(useUIStore.getState().realTimeFeedFilters).toEqual(["all"]);
    });

    test("toggleFeedFilter 'all' resets to 'all' only", () => {
      useUIStore.getState().setFeedFilters(["quotes", "orders"]);
      useUIStore.getState().toggleFeedFilter("all");
      expect(useUIStore.getState().realTimeFeedFilters).toEqual(["all"]);
    });
  });

  describe("theme", () => {
    test("starts with system theme", () => {
      expect(useUIStore.getState().theme).toBe("system");
    });

    test("setTheme changes theme", () => {
      useUIStore.getState().setTheme("dark");
      expect(useUIStore.getState().theme).toBe("dark");

      useUIStore.getState().setTheme("light");
      expect(useUIStore.getState().theme).toBe("light");
    });
  });

  describe("chart preferences", () => {
    test("starts with 1h timeframe", () => {
      expect(useUIStore.getState().chartTimeframe).toBe("1h");
    });

    test("setChartTimeframe changes timeframe", () => {
      useUIStore.getState().setChartTimeframe("1d");
      expect(useUIStore.getState().chartTimeframe).toBe("1d");
    });

    test("starts with volume visible", () => {
      expect(useUIStore.getState().chartShowVolume).toBe(true);
    });

    test("setChartShowVolume toggles volume", () => {
      useUIStore.getState().setChartShowVolume(false);
      expect(useUIStore.getState().chartShowVolume).toBe(false);
    });

    test("starts with SMA indicators", () => {
      expect(useUIStore.getState().chartShowIndicators).toEqual([
        "SMA_20",
        "SMA_50",
      ]);
    });

    test("toggleChartIndicator adds indicator", () => {
      useUIStore.getState().toggleChartIndicator("RSI");
      expect(useUIStore.getState().chartShowIndicators).toContain("RSI");
    });

    test("toggleChartIndicator removes existing indicator", () => {
      useUIStore.getState().toggleChartIndicator("SMA_20");
      expect(useUIStore.getState().chartShowIndicators).not.toContain("SMA_20");
    });
  });

  describe("table preferences", () => {
    test("starts with 25 page size", () => {
      expect(useUIStore.getState().tablePageSize).toBe(25);
    });

    test("setTablePageSize changes page size", () => {
      useUIStore.getState().setTablePageSize(50);
      expect(useUIStore.getState().tablePageSize).toBe(50);
    });

    test("starts with normal density", () => {
      expect(useUIStore.getState().tableDensity).toBe("normal");
    });

    test("setTableDensity changes density", () => {
      useUIStore.getState().setTableDensity("compact");
      expect(useUIStore.getState().tableDensity).toBe("compact");
    });
  });

  describe("reset", () => {
    test("reset restores initial state", () => {
      // Change multiple values
      useUIStore.getState().setSidebarCollapsed(true);
      useUIStore.getState().setTheme("dark");
      useUIStore.getState().setChartTimeframe("1d");
      useUIStore.getState().setTablePageSize(100);

      // Reset
      useUIStore.getState().reset();

      // Verify all back to initial
      expect(useUIStore.getState().sidebarCollapsed).toBe(false);
      expect(useUIStore.getState().theme).toBe("system");
      expect(useUIStore.getState().chartTimeframe).toBe("1h");
      expect(useUIStore.getState().tablePageSize).toBe(25);
    });
  });
});
