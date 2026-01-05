/**
 * User Preferences Store
 *
 * Manages user preferences with localStorage persistence.
 * Automatically respects system settings (prefers-reduced-motion, prefers-color-scheme).
 *
 * @see docs/plans/ui/31-realtime-patterns.md
 */

import { create } from "zustand";
import { devtools, persist, subscribeWithSelector } from "zustand/middleware";

// ============================================
// Types
// ============================================

export type ThemeMode = "light" | "dark" | "system";
export type DateFormat = "relative" | "absolute" | "iso";
export type NumberFormat = "short" | "full" | "compact";

export interface SoundPreferences {
  /** Master sound toggle */
  enabled: boolean;
  /** Volume level (0-1) */
  volume: number;
  /** Sound for critical alerts */
  criticalAlerts: boolean;
  /** Sound for trade executions */
  tradeExecutions: boolean;
  /** Sound for order fills */
  orderFills: boolean;
}

export interface NotificationPreferences {
  /** Browser notifications enabled */
  enabled: boolean;
  /** Show for critical alerts */
  criticalAlerts: boolean;
  /** Show for trade executions */
  tradeExecutions: boolean;
  /** Show for price alerts */
  priceAlerts: boolean;
}

export interface DisplayPreferences {
  /** Theme mode */
  theme: ThemeMode;
  /** Animations enabled (respects prefers-reduced-motion) */
  animationsEnabled: boolean;
  /** Date format preference */
  dateFormat: DateFormat;
  /** Number format preference */
  numberFormat: NumberFormat;
  /** Show values in portfolio (privacy mode) */
  showValues: boolean;
  /** Compact mode for dense information */
  compactMode: boolean;
}

export interface FeedPreferences {
  /** Auto-scroll to new events */
  autoScroll: boolean;
  /** Max events in feed */
  maxEvents: number;
  /** Show timestamps in feed */
  showTimestamps: boolean;
  /** Group similar events */
  groupSimilar: boolean;
}

export interface PreferencesState {
  /** Sound preferences */
  sound: SoundPreferences;
  /** Notification preferences */
  notifications: NotificationPreferences;
  /** Display preferences */
  display: DisplayPreferences;
  /** Feed preferences */
  feed: FeedPreferences;
  /** Last updated timestamp */
  lastUpdated: number;
}

export interface PreferencesActions {
  /** Update sound preferences */
  updateSound: (prefs: Partial<SoundPreferences>) => void;
  /** Update notification preferences */
  updateNotifications: (prefs: Partial<NotificationPreferences>) => void;
  /** Update display preferences */
  updateDisplay: (prefs: Partial<DisplayPreferences>) => void;
  /** Update feed preferences */
  updateFeed: (prefs: Partial<FeedPreferences>) => void;
  /** Reset all preferences to defaults */
  resetToDefaults: () => void;
  /** Toggle a specific boolean preference */
  togglePreference: (
    category: "sound" | "notifications" | "display" | "feed",
    key: string
  ) => void;
  /** Get computed theme (resolves 'system') */
  getComputedTheme: () => "light" | "dark";
  /** Check if animations should be enabled */
  shouldAnimate: () => boolean;
}

export type PreferencesStore = PreferencesState & PreferencesActions;

// ============================================
// Defaults
// ============================================

const defaultSoundPreferences: SoundPreferences = {
  enabled: true,
  volume: 0.5,
  criticalAlerts: true,
  tradeExecutions: true,
  orderFills: false,
};

const defaultNotificationPreferences: NotificationPreferences = {
  enabled: false,
  criticalAlerts: true,
  tradeExecutions: true,
  priceAlerts: true,
};

const defaultDisplayPreferences: DisplayPreferences = {
  theme: "system",
  animationsEnabled: true,
  dateFormat: "relative",
  numberFormat: "short",
  showValues: true,
  compactMode: false,
};

const defaultFeedPreferences: FeedPreferences = {
  autoScroll: true,
  maxEvents: 1000,
  showTimestamps: true,
  groupSimilar: true,
};

const initialState: PreferencesState = {
  sound: defaultSoundPreferences,
  notifications: defaultNotificationPreferences,
  display: defaultDisplayPreferences,
  feed: defaultFeedPreferences,
  lastUpdated: Date.now(),
};

// ============================================
// Store
// ============================================

/**
 * Check if system prefers reduced motion.
 */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Check system color scheme preference.
 */
function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export const usePreferencesStore = create<PreferencesStore>()(
  devtools(
    subscribeWithSelector(
      persist(
        (set, get) => ({
          ...initialState,

          updateSound: (prefs) => {
            set((state) => ({
              sound: { ...state.sound, ...prefs },
              lastUpdated: Date.now(),
            }));
          },

          updateNotifications: (prefs) => {
            set((state) => ({
              notifications: { ...state.notifications, ...prefs },
              lastUpdated: Date.now(),
            }));
          },

          updateDisplay: (prefs) => {
            set((state) => ({
              display: { ...state.display, ...prefs },
              lastUpdated: Date.now(),
            }));
          },

          updateFeed: (prefs) => {
            set((state) => ({
              feed: { ...state.feed, ...prefs },
              lastUpdated: Date.now(),
            }));
          },

          resetToDefaults: () => {
            set({
              ...initialState,
              lastUpdated: Date.now(),
            });
          },

          togglePreference: (category, key) => {
            set((state) => {
              const categoryState = state[category] as unknown as Record<string, unknown>;
              if (typeof categoryState[key] !== "boolean") return state;

              return {
                [category]: {
                  ...categoryState,
                  [key]: !categoryState[key],
                },
                lastUpdated: Date.now(),
              };
            });
          },

          getComputedTheme: () => {
            const { theme } = get().display;
            if (theme === "system") {
              return getSystemTheme();
            }
            return theme;
          },

          shouldAnimate: () => {
            const state = get();
            // User disabled animations
            if (!state.display.animationsEnabled) return false;
            // System prefers reduced motion
            if (prefersReducedMotion()) return false;
            return true;
          },
        }),
        {
          name: "cream-preferences",
          version: 1,
          migrate: (persisted, version) => {
            // Handle migrations from older versions
            if (version === 0) {
              // v0 -> v1 migration
              return {
                ...initialState,
                ...(persisted as Partial<PreferencesState>),
              };
            }
            return persisted as PreferencesState;
          },
        }
      )
    ),
    { name: "preferences-store" }
  )
);

// ============================================
// Selectors
// ============================================

/**
 * Select sound enabled state.
 */
export const selectSoundEnabled = (state: PreferencesStore) =>
  state.sound.enabled;

/**
 * Select sound volume.
 */
export const selectSoundVolume = (state: PreferencesStore) =>
  state.sound.volume;

/**
 * Select notifications enabled state.
 */
export const selectNotificationsEnabled = (state: PreferencesStore) =>
  state.notifications.enabled;

/**
 * Select theme mode.
 */
export const selectTheme = (state: PreferencesStore) => state.display.theme;

/**
 * Select compact mode.
 */
export const selectCompactMode = (state: PreferencesStore) =>
  state.display.compactMode;

/**
 * Select privacy mode (show values).
 */
export const selectShowValues = (state: PreferencesStore) =>
  state.display.showValues;

/**
 * Select auto-scroll enabled.
 */
export const selectAutoScroll = (state: PreferencesStore) =>
  state.feed.autoScroll;

/**
 * Select date format.
 */
export const selectDateFormat = (state: PreferencesStore) =>
  state.display.dateFormat;

/**
 * Select number format.
 */
export const selectNumberFormat = (state: PreferencesStore) =>
  state.display.numberFormat;

// ============================================
// Hooks for Theme Management
// ============================================

/**
 * Apply theme to document.
 * Call this in a useEffect in your app root.
 */
export function applyTheme(theme: "light" | "dark"): void {
  if (typeof document === "undefined") return;

  document.documentElement.setAttribute("data-theme", theme);

  // Also update meta theme-color for mobile
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute(
      "content",
      theme === "dark" ? "#0c0a09" : "#f5f5f4"
    );
  }
}

/**
 * Subscribe to theme changes and apply them.
 * Returns unsubscribe function.
 */
export function subscribeToThemeChanges(): () => void {
  // Apply initial theme
  const store = usePreferencesStore.getState();
  applyTheme(store.getComputedTheme());

  // Subscribe to changes
  const unsubscribe = usePreferencesStore.subscribe(
    (state) => state.display.theme,
    () => {
      const store = usePreferencesStore.getState();
      applyTheme(store.getComputedTheme());
    }
  );

  // Also listen for system theme changes when using 'system' mode
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const handleChange = () => {
    const store = usePreferencesStore.getState();
    if (store.display.theme === "system") {
      applyTheme(store.getComputedTheme());
    }
  };

  mediaQuery.addEventListener("change", handleChange);

  return () => {
    unsubscribe();
    mediaQuery.removeEventListener("change", handleChange);
  };
}

// ============================================
// Export
// ============================================

export default usePreferencesStore;
