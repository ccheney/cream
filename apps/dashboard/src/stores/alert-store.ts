/**
 * Alert Notification Store
 *
 * Zustand store for managing alerts with critical banners, warning/info toasts,
 * audio chimes, and browser push notifications.
 *
 * @see docs/plans/ui/31-realtime-patterns.md lines 89-118
 */

import { create } from "zustand";

// ============================================
// Types
// ============================================

export type AlertSeverity = "critical" | "warning" | "info";

export interface AlertAction {
  /** Button label */
  label: string;
  /** Click handler */
  onClick: () => void;
}

export interface Alert {
  /** Unique alert ID */
  id: string;
  /** Alert severity */
  severity: AlertSeverity;
  /** Alert title */
  title: string;
  /** Alert message */
  message: string;
  /** Optional action button */
  action?: AlertAction;
  /** Play audio chime */
  playSound?: boolean;
  /** Send browser push notification */
  pushNotification?: boolean;
  /** Created timestamp */
  createdAt: number;
  /** Is alert being dismissed */
  dismissing?: boolean;
  /** Has been acknowledged (for critical alerts) */
  acknowledged?: boolean;
}

export interface AlertSettings {
  /** Enable audio for critical alerts */
  soundCritical: boolean;
  /** Enable audio for warning alerts */
  soundWarning: boolean;
  /** Enable audio for info alerts */
  soundInfo: boolean;
  /** Enable push notifications */
  pushEnabled: boolean;
  /** Auto-dismiss duration for warnings (ms) */
  warningDuration: number;
  /** Auto-dismiss duration for info (ms) */
  infoDuration: number;
}

export interface AlertStore {
  /** Active alerts */
  alerts: Alert[];
  /** Critical banner (only one at a time) */
  criticalBanner: Alert | null;
  /** Alert settings */
  settings: AlertSettings;

  // Actions
  /** Add an alert */
  addAlert: (alert: Omit<Alert, "id" | "createdAt">) => string;
  /** Acknowledge a critical alert */
  acknowledgeCritical: () => void;
  /** Dismiss an alert */
  dismissAlert: (id: string) => void;
  /** Clear all non-critical alerts */
  clearAlerts: () => void;
  /** Update settings */
  updateSettings: (settings: Partial<AlertSettings>) => void;

  // Convenience methods
  critical: (title: string, message: string, action?: AlertAction) => string;
  warning: (title: string, message: string, action?: AlertAction) => string;
  info: (title: string, message: string, action?: AlertAction) => string;
}

// ============================================
// Constants
// ============================================

const DEFAULT_SETTINGS: AlertSettings = {
  soundCritical: true,
  soundWarning: false,
  soundInfo: false,
  pushEnabled: false,
  warningDuration: 8000,
  infoDuration: 4000,
};

const MAX_VISIBLE_ALERTS = 5;
const EXIT_ANIMATION_DURATION = 200;

// ============================================
// Audio Utilities
// ============================================

const audioContext =
  typeof window !== "undefined"
    ? new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      )()
    : null;

/**
 * Play a simple beep sound using Web Audio API.
 */
function playBeep(frequency: number, duration: number, volume: number): void {
  if (!audioContext) {
    return;
  }

  try {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = "sine";

    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(volume, audioContext.currentTime + 0.01);
    gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + duration);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration);
  } catch {
    // Ignore audio errors (browser restrictions)
  }
}

/**
 * Play audio chime based on severity.
 */
function playAlertSound(severity: AlertSeverity): void {
  switch (severity) {
    case "critical":
      // Attention-grabbing double beep
      playBeep(800, 0.15, 0.3);
      setTimeout(() => playBeep(800, 0.15, 0.3), 200);
      break;
    case "warning":
      // Gentle single beep
      playBeep(600, 0.1, 0.2);
      break;
    case "info":
      // Soft ding
      playBeep(1000, 0.08, 0.15);
      break;
  }
}

// ============================================
// Push Notification Utilities
// ============================================

/**
 * Request push notification permission.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) {
    return false;
  }

  if (Notification.permission === "granted") {
    return true;
  }

  const permission = await Notification.requestPermission();
  return permission === "granted";
}

/**
 * Send browser push notification.
 */
function sendPushNotification(alert: Alert): void {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  try {
    new Notification(alert.title, {
      body: alert.message,
      icon: "/icons/alert-icon.png",
      tag: alert.id,
      requireInteraction: alert.severity === "critical",
    });
  } catch {
    // Ignore notification errors
  }
}

// ============================================
// Utility Functions
// ============================================

function generateId(): string {
  return `alert-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ============================================
// Store
// ============================================

export const useAlertStore = create<AlertStore>((set, get) => ({
  alerts: [],
  criticalBanner: null,
  settings: DEFAULT_SETTINGS,

  addAlert: (alertData) => {
    const id = generateId();
    const alert: Alert = {
      ...alertData,
      id,
      createdAt: Date.now(),
    };

    const { settings } = get();

    // Handle critical alerts separately (banner)
    if (alert.severity === "critical") {
      set({ criticalBanner: alert });

      // Play sound if enabled
      if (alert.playSound !== false && settings.soundCritical) {
        playAlertSound("critical");
      }

      // Send push notification if enabled
      if (alert.pushNotification !== false && settings.pushEnabled) {
        sendPushNotification(alert);
      }

      return id;
    }

    // Handle warning/info as toasts
    set((state) => {
      const newAlerts = [...state.alerts, alert].slice(-MAX_VISIBLE_ALERTS);
      return { alerts: newAlerts };
    });

    // Play sound if enabled
    const soundEnabled = alert.severity === "warning" ? settings.soundWarning : settings.soundInfo;
    if (alert.playSound !== false && soundEnabled) {
      playAlertSound(alert.severity);
    }

    // Send push notification if enabled
    if (alert.pushNotification !== false && settings.pushEnabled) {
      sendPushNotification(alert);
    }

    // Schedule auto-dismiss
    const duration =
      alert.severity === "warning" ? settings.warningDuration : settings.infoDuration;

    setTimeout(() => {
      set((state) => ({
        alerts: state.alerts.map((a) => (a.id === id ? { ...a, dismissing: true } : a)),
      }));
    }, duration);

    setTimeout(() => {
      get().dismissAlert(id);
    }, duration + EXIT_ANIMATION_DURATION);

    return id;
  },

  acknowledgeCritical: () => {
    const { criticalBanner } = get();
    if (criticalBanner) {
      set({
        criticalBanner: { ...criticalBanner, acknowledged: true },
      });

      // Dismiss after animation
      setTimeout(() => {
        set({ criticalBanner: null });
      }, EXIT_ANIMATION_DURATION);
    }
  },

  dismissAlert: (id) => {
    set((state) => ({
      alerts: state.alerts.filter((a) => a.id !== id),
    }));
  },

  clearAlerts: () => {
    set({ alerts: [] });
  },

  updateSettings: (newSettings) => {
    set((state) => ({
      settings: { ...state.settings, ...newSettings },
    }));
  },

  // Convenience methods
  critical: (title, message, action) =>
    get().addAlert({
      severity: "critical",
      title,
      message,
      action,
      playSound: true,
      pushNotification: true,
    }),

  warning: (title, message, action) =>
    get().addAlert({
      severity: "warning",
      title,
      message,
      action,
    }),

  info: (title, message, _action) =>
    get().addAlert({
      severity: "info",
      title,
      message,
    }),
}));

// ============================================
// Hook
// ============================================

/**
 * useAlert hook for creating alerts.
 *
 * @example
 * ```tsx
 * const alert = useAlert();
 *
 * // Critical banner (requires acknowledgment)
 * alert.critical("Position Limit Exceeded", "NVDA exposure exceeded 10% limit");
 *
 * // Warning toast (auto-dismiss after 8s)
 * alert.warning("Approaching Limit", "AAPL at 85% of position limit", {
 *   label: "View Risk Dashboard",
 *   onClick: () => router.push("/risk"),
 * });
 *
 * // Info toast (auto-dismiss after 4s)
 * alert.info("Order Filled", "Bought 100 AAPL @ $187.50");
 * ```
 */
export function useAlert() {
  const store = useAlertStore();

  return {
    critical: store.critical,
    warning: store.warning,
    info: store.info,
    acknowledge: store.acknowledgeCritical,
    dismiss: store.dismissAlert,
    clearAll: store.clearAlerts,
    settings: store.settings,
    updateSettings: store.updateSettings,
  };
}

// ============================================
// Selectors
// ============================================

export function selectAlerts(state: AlertStore): Alert[] {
  return state.alerts;
}

export function selectCriticalBanner(state: AlertStore): Alert | null {
  return state.criticalBanner;
}

export function selectHasCritical(state: AlertStore): boolean {
  return state.criticalBanner !== null;
}

export function selectAlertSettings(state: AlertStore): AlertSettings {
  return state.settings;
}
