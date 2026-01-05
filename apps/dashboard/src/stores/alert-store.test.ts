/**
 * Alert Store Tests
 *
 * Tests for alert notification store functionality.
 */

import { beforeEach, describe, expect, it } from "bun:test";
import type { Alert, AlertAction, AlertSettings, AlertSeverity } from "./alert-store";
import { useAlertStore } from "./alert-store";

// ============================================
// Test Helpers
// ============================================

function resetStore() {
  useAlertStore.setState({
    alerts: [],
    criticalBanner: null,
    settings: {
      soundCritical: true,
      soundWarning: false,
      soundInfo: false,
      pushEnabled: false,
      warningDuration: 8000,
      infoDuration: 4000,
    },
  });
}

// ============================================
// Type Tests
// ============================================

describe("Alert types", () => {
  it("AlertSeverity has correct values", () => {
    const severities: AlertSeverity[] = ["critical", "warning", "info"];
    expect(severities).toHaveLength(3);
    expect(severities).toContain("critical");
    expect(severities).toContain("warning");
    expect(severities).toContain("info");
  });

  it("Alert interface has required properties", () => {
    const alert: Alert = {
      id: "test-1",
      severity: "warning",
      title: "Test Title",
      message: "Test message",
      createdAt: Date.now(),
    };
    expect(alert.id).toBe("test-1");
    expect(alert.severity).toBe("warning");
    expect(alert.title).toBe("Test Title");
    expect(alert.message).toBe("Test message");
    expect(typeof alert.createdAt).toBe("number");
  });

  it("Alert interface supports optional properties", () => {
    const action: AlertAction = {
      label: "View",
      onClick: () => {},
    };
    const alert: Alert = {
      id: "test-2",
      severity: "info",
      title: "Test",
      message: "Test",
      createdAt: Date.now(),
      action,
      playSound: true,
      pushNotification: false,
      dismissing: false,
      acknowledged: false,
    };
    expect(alert.action?.label).toBe("View");
    expect(alert.playSound).toBe(true);
    expect(alert.pushNotification).toBe(false);
    expect(alert.dismissing).toBe(false);
    expect(alert.acknowledged).toBe(false);
  });

  it("AlertSettings has all required properties", () => {
    const settings: AlertSettings = {
      soundCritical: true,
      soundWarning: false,
      soundInfo: false,
      pushEnabled: false,
      warningDuration: 8000,
      infoDuration: 4000,
    };
    expect(settings.soundCritical).toBe(true);
    expect(settings.soundWarning).toBe(false);
    expect(settings.soundInfo).toBe(false);
    expect(settings.pushEnabled).toBe(false);
    expect(settings.warningDuration).toBe(8000);
    expect(settings.infoDuration).toBe(4000);
  });
});

// ============================================
// Store State Tests
// ============================================

describe("Alert store initial state", () => {
  beforeEach(() => {
    resetStore();
  });

  it("starts with empty alerts array", () => {
    const state = useAlertStore.getState();
    expect(state.alerts).toEqual([]);
  });

  it("starts with null criticalBanner", () => {
    const state = useAlertStore.getState();
    expect(state.criticalBanner).toBeNull();
  });

  it("has default settings", () => {
    const state = useAlertStore.getState();
    expect(state.settings.soundCritical).toBe(true);
    expect(state.settings.soundWarning).toBe(false);
    expect(state.settings.soundInfo).toBe(false);
    expect(state.settings.pushEnabled).toBe(false);
    expect(state.settings.warningDuration).toBe(8000);
    expect(state.settings.infoDuration).toBe(4000);
  });
});

// ============================================
// addAlert Tests
// ============================================

describe("addAlert", () => {
  beforeEach(() => {
    resetStore();
  });

  it("adds info alert to alerts array", () => {
    const store = useAlertStore.getState();
    const id = store.addAlert({
      severity: "info",
      title: "Info Title",
      message: "Info message",
    });

    const state = useAlertStore.getState();
    expect(state.alerts).toHaveLength(1);
    expect(state.alerts[0]?.id).toBe(id);
    expect(state.alerts[0]?.severity).toBe("info");
    expect(state.alerts[0]?.title).toBe("Info Title");
  });

  it("adds warning alert to alerts array", () => {
    const store = useAlertStore.getState();
    store.addAlert({
      severity: "warning",
      title: "Warning Title",
      message: "Warning message",
    });

    const state = useAlertStore.getState();
    expect(state.alerts).toHaveLength(1);
    expect(state.alerts[0]?.severity).toBe("warning");
  });

  it("adds critical alert to criticalBanner", () => {
    const store = useAlertStore.getState();
    const id = store.addAlert({
      severity: "critical",
      title: "Critical Title",
      message: "Critical message",
    });

    const state = useAlertStore.getState();
    expect(state.alerts).toHaveLength(0); // Not in alerts array
    expect(state.criticalBanner).not.toBeNull();
    expect(state.criticalBanner?.id).toBe(id);
    expect(state.criticalBanner?.severity).toBe("critical");
  });

  it("generates unique IDs", () => {
    const store = useAlertStore.getState();
    const id1 = store.addAlert({
      severity: "info",
      title: "Alert 1",
      message: "Message 1",
    });
    const id2 = store.addAlert({
      severity: "info",
      title: "Alert 2",
      message: "Message 2",
    });

    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^alert-\d+-[a-z0-9]+$/);
    expect(id2).toMatch(/^alert-\d+-[a-z0-9]+$/);
  });

  it("sets createdAt timestamp", () => {
    const before = Date.now();
    const store = useAlertStore.getState();
    store.addAlert({
      severity: "info",
      title: "Test",
      message: "Test",
    });
    const after = Date.now();

    const state = useAlertStore.getState();
    const createdAt = state.alerts[0]?.createdAt ?? 0;
    expect(createdAt).toBeGreaterThanOrEqual(before);
    expect(createdAt).toBeLessThanOrEqual(after);
  });

  it("limits visible alerts to 5", () => {
    const store = useAlertStore.getState();
    for (let i = 0; i < 7; i++) {
      store.addAlert({
        severity: "info",
        title: `Alert ${i}`,
        message: `Message ${i}`,
      });
    }

    const state = useAlertStore.getState();
    expect(state.alerts).toHaveLength(5);
    // Should keep the latest 5
    expect(state.alerts[0]?.title).toBe("Alert 2");
    expect(state.alerts[4]?.title).toBe("Alert 6");
  });
});

// ============================================
// Convenience Methods Tests
// ============================================

describe("convenience methods", () => {
  beforeEach(() => {
    resetStore();
  });

  it("critical() creates critical alert", () => {
    const store = useAlertStore.getState();
    store.critical("Critical!", "Something bad");

    const state = useAlertStore.getState();
    expect(state.criticalBanner?.severity).toBe("critical");
    expect(state.criticalBanner?.title).toBe("Critical!");
    expect(state.criticalBanner?.playSound).toBe(true);
    expect(state.criticalBanner?.pushNotification).toBe(true);
  });

  it("warning() creates warning alert", () => {
    const store = useAlertStore.getState();
    store.warning("Warning!", "Be careful");

    const state = useAlertStore.getState();
    expect(state.alerts[0]?.severity).toBe("warning");
    expect(state.alerts[0]?.title).toBe("Warning!");
  });

  it("info() creates info alert", () => {
    const store = useAlertStore.getState();
    store.info("Info", "FYI");

    const state = useAlertStore.getState();
    expect(state.alerts[0]?.severity).toBe("info");
    expect(state.alerts[0]?.title).toBe("Info");
  });

  it("convenience methods support actions", () => {
    const store = useAlertStore.getState();
    const action: AlertAction = {
      label: "View",
      onClick: () => {},
    };
    store.warning("Warning", "Message", action);

    const state = useAlertStore.getState();
    expect(state.alerts[0]?.action?.label).toBe("View");
  });
});

// ============================================
// acknowledgeCritical Tests
// ============================================

describe("acknowledgeCritical", () => {
  beforeEach(() => {
    resetStore();
  });

  it("marks critical banner as acknowledged", () => {
    const store = useAlertStore.getState();
    store.critical("Critical", "Message");

    let state = useAlertStore.getState();
    expect(state.criticalBanner?.acknowledged).toBeFalsy();

    store.acknowledgeCritical();

    state = useAlertStore.getState();
    expect(state.criticalBanner?.acknowledged).toBe(true);
  });

  it("does nothing if no critical banner", () => {
    const store = useAlertStore.getState();
    store.acknowledgeCritical(); // Should not throw

    const state = useAlertStore.getState();
    expect(state.criticalBanner).toBeNull();
  });
});

// ============================================
// dismissAlert Tests
// ============================================

describe("dismissAlert", () => {
  beforeEach(() => {
    resetStore();
  });

  it("removes alert by id", () => {
    const store = useAlertStore.getState();
    const id = store.info("Test", "Message");

    let state = useAlertStore.getState();
    expect(state.alerts).toHaveLength(1);

    store.dismissAlert(id);

    state = useAlertStore.getState();
    expect(state.alerts).toHaveLength(0);
  });

  it("does nothing for non-existent id", () => {
    const store = useAlertStore.getState();
    store.info("Test", "Message");
    store.dismissAlert("non-existent");

    const state = useAlertStore.getState();
    expect(state.alerts).toHaveLength(1);
  });

  it("removes correct alert when multiple exist", () => {
    const store = useAlertStore.getState();
    const id1 = store.info("Alert 1", "Message 1");
    const id2 = store.info("Alert 2", "Message 2");
    const id3 = store.info("Alert 3", "Message 3");

    store.dismissAlert(id2);

    const state = useAlertStore.getState();
    expect(state.alerts).toHaveLength(2);
    expect(state.alerts.find((a) => a.id === id1)).toBeDefined();
    expect(state.alerts.find((a) => a.id === id2)).toBeUndefined();
    expect(state.alerts.find((a) => a.id === id3)).toBeDefined();
  });
});

// ============================================
// clearAlerts Tests
// ============================================

describe("clearAlerts", () => {
  beforeEach(() => {
    resetStore();
  });

  it("clears all non-critical alerts", () => {
    const store = useAlertStore.getState();
    store.info("Info 1", "Message");
    store.warning("Warning 1", "Message");
    store.info("Info 2", "Message");

    let state = useAlertStore.getState();
    expect(state.alerts).toHaveLength(3);

    store.clearAlerts();

    state = useAlertStore.getState();
    expect(state.alerts).toHaveLength(0);
  });

  it("does not clear critical banner", () => {
    const store = useAlertStore.getState();
    store.critical("Critical", "Message");
    store.info("Info", "Message");

    store.clearAlerts();

    const state = useAlertStore.getState();
    expect(state.alerts).toHaveLength(0);
    expect(state.criticalBanner).not.toBeNull();
  });
});

// ============================================
// updateSettings Tests
// ============================================

describe("updateSettings", () => {
  beforeEach(() => {
    resetStore();
  });

  it("updates single setting", () => {
    const store = useAlertStore.getState();
    store.updateSettings({ soundWarning: true });

    const state = useAlertStore.getState();
    expect(state.settings.soundWarning).toBe(true);
    // Other settings unchanged
    expect(state.settings.soundCritical).toBe(true);
    expect(state.settings.soundInfo).toBe(false);
  });

  it("updates multiple settings", () => {
    const store = useAlertStore.getState();
    store.updateSettings({
      soundWarning: true,
      pushEnabled: true,
      warningDuration: 10000,
    });

    const state = useAlertStore.getState();
    expect(state.settings.soundWarning).toBe(true);
    expect(state.settings.pushEnabled).toBe(true);
    expect(state.settings.warningDuration).toBe(10000);
  });
});

// ============================================
// Selector Tests
// ============================================

describe("selectors", () => {
  beforeEach(() => {
    resetStore();
  });

  it("selectAlerts returns alerts array", async () => {
    const { selectAlerts } = await import("./alert-store");
    const store = useAlertStore.getState();
    store.info("Test", "Message");

    const alerts = selectAlerts(useAlertStore.getState());
    expect(alerts).toHaveLength(1);
  });

  it("selectCriticalBanner returns critical banner", async () => {
    const { selectCriticalBanner } = await import("./alert-store");
    const store = useAlertStore.getState();
    store.critical("Critical", "Message");

    const banner = selectCriticalBanner(useAlertStore.getState());
    expect(banner?.severity).toBe("critical");
  });

  it("selectHasCritical returns true when banner exists", async () => {
    const { selectHasCritical } = await import("./alert-store");
    const store = useAlertStore.getState();

    expect(selectHasCritical(useAlertStore.getState())).toBe(false);

    store.critical("Critical", "Message");

    expect(selectHasCritical(useAlertStore.getState())).toBe(true);
  });

  it("selectAlertSettings returns settings", async () => {
    const { selectAlertSettings } = await import("./alert-store");
    const settings = selectAlertSettings(useAlertStore.getState());

    expect(settings.soundCritical).toBe(true);
    expect(settings.warningDuration).toBe(8000);
  });
});

// ============================================
// useAlert Hook Tests
// ============================================

describe("useAlert hook interface", () => {
  beforeEach(() => {
    resetStore();
  });

  it("exposes expected methods", async () => {
    const { useAlert } = await import("./alert-store");
    // We can't call hooks outside React, but we can verify the export exists
    expect(typeof useAlert).toBe("function");
  });
});

// ============================================
// Utility Function Tests
// ============================================

describe("requestNotificationPermission", () => {
  it("exports requestNotificationPermission function", async () => {
    const { requestNotificationPermission } = await import("./alert-store");
    expect(typeof requestNotificationPermission).toBe("function");
  });
});
