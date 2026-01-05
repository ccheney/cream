/**
 * User Preferences Store Tests
 */

import { beforeEach, describe, expect, it } from "bun:test";
import {
  type DateFormat,
  type NumberFormat,
  selectAutoScroll,
  selectCompactMode,
  selectDateFormat,
  selectNotificationsEnabled,
  selectNumberFormat,
  selectShowValues,
  selectSoundEnabled,
  selectSoundVolume,
  selectTheme,
  type ThemeMode,
  usePreferencesStore,
} from "./preferences-store";

// ============================================
// Helper Functions
// ============================================

function resetStore() {
  usePreferencesStore.setState({
    sound: {
      enabled: true,
      volume: 0.5,
      criticalAlerts: true,
      tradeExecutions: true,
      orderFills: false,
    },
    notifications: {
      enabled: false,
      criticalAlerts: true,
      tradeExecutions: true,
      priceAlerts: true,
    },
    display: {
      theme: "system",
      animationsEnabled: true,
      dateFormat: "relative",
      numberFormat: "short",
      showValues: true,
      compactMode: false,
    },
    feed: {
      autoScroll: true,
      maxEvents: 1000,
      showTimestamps: true,
      groupSimilar: true,
    },
    lastUpdated: Date.now(),
  });
}

// ============================================
// Type Tests
// ============================================

describe("ThemeMode type", () => {
  it("has all expected modes", () => {
    const modes: ThemeMode[] = ["light", "dark", "system"];
    expect(modes).toHaveLength(3);
  });
});

describe("DateFormat type", () => {
  it("has all expected formats", () => {
    const formats: DateFormat[] = ["relative", "absolute", "iso"];
    expect(formats).toHaveLength(3);
  });
});

describe("NumberFormat type", () => {
  it("has all expected formats", () => {
    const formats: NumberFormat[] = ["short", "full", "compact"];
    expect(formats).toHaveLength(3);
  });
});

// ============================================
// Default Values Tests
// ============================================

describe("default values", () => {
  beforeEach(resetStore);

  it("sound is enabled by default", () => {
    expect(usePreferencesStore.getState().sound.enabled).toBe(true);
  });

  it("default volume is 0.5", () => {
    expect(usePreferencesStore.getState().sound.volume).toBe(0.5);
  });

  it("notifications are disabled by default", () => {
    expect(usePreferencesStore.getState().notifications.enabled).toBe(false);
  });

  it("theme is system by default", () => {
    expect(usePreferencesStore.getState().display.theme).toBe("system");
  });

  it("animations are enabled by default", () => {
    expect(usePreferencesStore.getState().display.animationsEnabled).toBe(true);
  });

  it("date format is relative by default", () => {
    expect(usePreferencesStore.getState().display.dateFormat).toBe("relative");
  });

  it("auto-scroll is enabled by default", () => {
    expect(usePreferencesStore.getState().feed.autoScroll).toBe(true);
  });

  it("maxEvents is 1000 by default", () => {
    expect(usePreferencesStore.getState().feed.maxEvents).toBe(1000);
  });

  it("showValues is true by default", () => {
    expect(usePreferencesStore.getState().display.showValues).toBe(true);
  });
});

// ============================================
// Update Sound Tests
// ============================================

describe("updateSound", () => {
  beforeEach(resetStore);

  it("updates enabled state", () => {
    usePreferencesStore.getState().updateSound({ enabled: false });
    expect(usePreferencesStore.getState().sound.enabled).toBe(false);
  });

  it("updates volume", () => {
    usePreferencesStore.getState().updateSound({ volume: 0.8 });
    expect(usePreferencesStore.getState().sound.volume).toBe(0.8);
  });

  it("updates criticalAlerts", () => {
    usePreferencesStore.getState().updateSound({ criticalAlerts: false });
    expect(usePreferencesStore.getState().sound.criticalAlerts).toBe(false);
  });

  it("preserves other sound settings", () => {
    usePreferencesStore.getState().updateSound({ volume: 0.9 });
    expect(usePreferencesStore.getState().sound.enabled).toBe(true);
    expect(usePreferencesStore.getState().sound.criticalAlerts).toBe(true);
  });

  it("updates lastUpdated", () => {
    const before = usePreferencesStore.getState().lastUpdated;
    usePreferencesStore.getState().updateSound({ volume: 0.7 });
    const after = usePreferencesStore.getState().lastUpdated;
    expect(after).toBeGreaterThanOrEqual(before);
  });
});

// ============================================
// Update Notifications Tests
// ============================================

describe("updateNotifications", () => {
  beforeEach(resetStore);

  it("updates enabled state", () => {
    usePreferencesStore.getState().updateNotifications({ enabled: true });
    expect(usePreferencesStore.getState().notifications.enabled).toBe(true);
  });

  it("updates criticalAlerts", () => {
    usePreferencesStore.getState().updateNotifications({ criticalAlerts: false });
    expect(usePreferencesStore.getState().notifications.criticalAlerts).toBe(false);
  });

  it("preserves other notification settings", () => {
    usePreferencesStore.getState().updateNotifications({ enabled: true });
    expect(usePreferencesStore.getState().notifications.tradeExecutions).toBe(true);
  });
});

// ============================================
// Update Display Tests
// ============================================

describe("updateDisplay", () => {
  beforeEach(resetStore);

  it("updates theme", () => {
    usePreferencesStore.getState().updateDisplay({ theme: "dark" });
    expect(usePreferencesStore.getState().display.theme).toBe("dark");
  });

  it("updates animationsEnabled", () => {
    usePreferencesStore.getState().updateDisplay({ animationsEnabled: false });
    expect(usePreferencesStore.getState().display.animationsEnabled).toBe(false);
  });

  it("updates dateFormat", () => {
    usePreferencesStore.getState().updateDisplay({ dateFormat: "absolute" });
    expect(usePreferencesStore.getState().display.dateFormat).toBe("absolute");
  });

  it("updates numberFormat", () => {
    usePreferencesStore.getState().updateDisplay({ numberFormat: "full" });
    expect(usePreferencesStore.getState().display.numberFormat).toBe("full");
  });

  it("updates showValues", () => {
    usePreferencesStore.getState().updateDisplay({ showValues: false });
    expect(usePreferencesStore.getState().display.showValues).toBe(false);
  });

  it("updates compactMode", () => {
    usePreferencesStore.getState().updateDisplay({ compactMode: true });
    expect(usePreferencesStore.getState().display.compactMode).toBe(true);
  });
});

// ============================================
// Update Feed Tests
// ============================================

describe("updateFeed", () => {
  beforeEach(resetStore);

  it("updates autoScroll", () => {
    usePreferencesStore.getState().updateFeed({ autoScroll: false });
    expect(usePreferencesStore.getState().feed.autoScroll).toBe(false);
  });

  it("updates maxEvents", () => {
    usePreferencesStore.getState().updateFeed({ maxEvents: 500 });
    expect(usePreferencesStore.getState().feed.maxEvents).toBe(500);
  });

  it("updates showTimestamps", () => {
    usePreferencesStore.getState().updateFeed({ showTimestamps: false });
    expect(usePreferencesStore.getState().feed.showTimestamps).toBe(false);
  });

  it("updates groupSimilar", () => {
    usePreferencesStore.getState().updateFeed({ groupSimilar: false });
    expect(usePreferencesStore.getState().feed.groupSimilar).toBe(false);
  });
});

// ============================================
// Reset Tests
// ============================================

describe("resetToDefaults", () => {
  beforeEach(resetStore);

  it("resets sound preferences", () => {
    usePreferencesStore.getState().updateSound({ enabled: false, volume: 0.1 });
    usePreferencesStore.getState().resetToDefaults();

    expect(usePreferencesStore.getState().sound.enabled).toBe(true);
    expect(usePreferencesStore.getState().sound.volume).toBe(0.5);
  });

  it("resets display preferences", () => {
    usePreferencesStore.getState().updateDisplay({ theme: "dark", compactMode: true });
    usePreferencesStore.getState().resetToDefaults();

    expect(usePreferencesStore.getState().display.theme).toBe("system");
    expect(usePreferencesStore.getState().display.compactMode).toBe(false);
  });

  it("resets notification preferences", () => {
    usePreferencesStore.getState().updateNotifications({ enabled: true });
    usePreferencesStore.getState().resetToDefaults();

    expect(usePreferencesStore.getState().notifications.enabled).toBe(false);
  });

  it("resets feed preferences", () => {
    usePreferencesStore.getState().updateFeed({ autoScroll: false, maxEvents: 100 });
    usePreferencesStore.getState().resetToDefaults();

    expect(usePreferencesStore.getState().feed.autoScroll).toBe(true);
    expect(usePreferencesStore.getState().feed.maxEvents).toBe(1000);
  });
});

// ============================================
// Toggle Preference Tests
// ============================================

describe("togglePreference", () => {
  beforeEach(resetStore);

  it("toggles sound.enabled", () => {
    expect(usePreferencesStore.getState().sound.enabled).toBe(true);
    usePreferencesStore.getState().togglePreference("sound", "enabled");
    expect(usePreferencesStore.getState().sound.enabled).toBe(false);
    usePreferencesStore.getState().togglePreference("sound", "enabled");
    expect(usePreferencesStore.getState().sound.enabled).toBe(true);
  });

  it("toggles display.animationsEnabled", () => {
    expect(usePreferencesStore.getState().display.animationsEnabled).toBe(true);
    usePreferencesStore.getState().togglePreference("display", "animationsEnabled");
    expect(usePreferencesStore.getState().display.animationsEnabled).toBe(false);
  });

  it("toggles feed.autoScroll", () => {
    expect(usePreferencesStore.getState().feed.autoScroll).toBe(true);
    usePreferencesStore.getState().togglePreference("feed", "autoScroll");
    expect(usePreferencesStore.getState().feed.autoScroll).toBe(false);
  });

  it("does not toggle non-boolean values", () => {
    const volumeBefore = usePreferencesStore.getState().sound.volume;
    usePreferencesStore.getState().togglePreference("sound", "volume");
    expect(usePreferencesStore.getState().sound.volume).toBe(volumeBefore);
  });
});

// ============================================
// Computed Theme Tests
// ============================================

describe("getComputedTheme", () => {
  beforeEach(resetStore);

  it("returns light when theme is light", () => {
    usePreferencesStore.getState().updateDisplay({ theme: "light" });
    expect(usePreferencesStore.getState().getComputedTheme()).toBe("light");
  });

  it("returns dark when theme is dark", () => {
    usePreferencesStore.getState().updateDisplay({ theme: "dark" });
    expect(usePreferencesStore.getState().getComputedTheme()).toBe("dark");
  });

  // System theme test is environment-dependent, skipped in unit tests
});

// ============================================
// Selector Tests
// ============================================

describe("selectors", () => {
  beforeEach(resetStore);

  it("selectSoundEnabled returns sound enabled state", () => {
    expect(selectSoundEnabled(usePreferencesStore.getState())).toBe(true);
    usePreferencesStore.getState().updateSound({ enabled: false });
    expect(selectSoundEnabled(usePreferencesStore.getState())).toBe(false);
  });

  it("selectSoundVolume returns volume", () => {
    expect(selectSoundVolume(usePreferencesStore.getState())).toBe(0.5);
    usePreferencesStore.getState().updateSound({ volume: 0.8 });
    expect(selectSoundVolume(usePreferencesStore.getState())).toBe(0.8);
  });

  it("selectNotificationsEnabled returns notifications enabled state", () => {
    expect(selectNotificationsEnabled(usePreferencesStore.getState())).toBe(false);
    usePreferencesStore.getState().updateNotifications({ enabled: true });
    expect(selectNotificationsEnabled(usePreferencesStore.getState())).toBe(true);
  });

  it("selectTheme returns theme", () => {
    expect(selectTheme(usePreferencesStore.getState())).toBe("system");
    usePreferencesStore.getState().updateDisplay({ theme: "dark" });
    expect(selectTheme(usePreferencesStore.getState())).toBe("dark");
  });

  it("selectCompactMode returns compact mode state", () => {
    expect(selectCompactMode(usePreferencesStore.getState())).toBe(false);
    usePreferencesStore.getState().updateDisplay({ compactMode: true });
    expect(selectCompactMode(usePreferencesStore.getState())).toBe(true);
  });

  it("selectShowValues returns show values state", () => {
    expect(selectShowValues(usePreferencesStore.getState())).toBe(true);
    usePreferencesStore.getState().updateDisplay({ showValues: false });
    expect(selectShowValues(usePreferencesStore.getState())).toBe(false);
  });

  it("selectAutoScroll returns auto-scroll state", () => {
    expect(selectAutoScroll(usePreferencesStore.getState())).toBe(true);
    usePreferencesStore.getState().updateFeed({ autoScroll: false });
    expect(selectAutoScroll(usePreferencesStore.getState())).toBe(false);
  });

  it("selectDateFormat returns date format", () => {
    expect(selectDateFormat(usePreferencesStore.getState())).toBe("relative");
    usePreferencesStore.getState().updateDisplay({ dateFormat: "iso" });
    expect(selectDateFormat(usePreferencesStore.getState())).toBe("iso");
  });

  it("selectNumberFormat returns number format", () => {
    expect(selectNumberFormat(usePreferencesStore.getState())).toBe("short");
    usePreferencesStore.getState().updateDisplay({ numberFormat: "compact" });
    expect(selectNumberFormat(usePreferencesStore.getState())).toBe("compact");
  });
});

// ============================================
// Module Export Tests
// ============================================

describe("module exports", () => {
  it("exports usePreferencesStore", async () => {
    const module = await import("./preferences-store");
    expect(typeof module.usePreferencesStore).toBe("function");
  });

  it("exports applyTheme", async () => {
    const module = await import("./preferences-store");
    expect(typeof module.applyTheme).toBe("function");
  });

  it("exports subscribeToThemeChanges", async () => {
    const module = await import("./preferences-store");
    expect(typeof module.subscribeToThemeChanges).toBe("function");
  });

  it("exports all selectors", async () => {
    const module = await import("./preferences-store");
    expect(typeof module.selectSoundEnabled).toBe("function");
    expect(typeof module.selectSoundVolume).toBe("function");
    expect(typeof module.selectNotificationsEnabled).toBe("function");
    expect(typeof module.selectTheme).toBe("function");
    expect(typeof module.selectCompactMode).toBe("function");
    expect(typeof module.selectShowValues).toBe("function");
    expect(typeof module.selectAutoScroll).toBe("function");
    expect(typeof module.selectDateFormat).toBe("function");
    expect(typeof module.selectNumberFormat).toBe("function");
  });
});
