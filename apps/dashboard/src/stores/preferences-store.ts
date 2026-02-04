import { create } from "zustand";
import { devtools, persist, subscribeWithSelector } from "zustand/middleware";

// ============================================
// Types
// ============================================

export type ThemeMode = "light" | "dark" | "system";
export type DateFormat = "relative" | "absolute" | "iso";
export type NumberFormat = "short" | "full" | "compact";

export interface SoundPreferences {
	enabled: boolean;
	/** 0-1 */
	volume: number;
	criticalAlerts: boolean;
	tradeExecutions: boolean;
	orderFills: boolean;
	marketBell: boolean;
}

export interface NotificationPreferences {
	enabled: boolean;
	criticalAlerts: boolean;
	tradeExecutions: boolean;
	priceAlerts: boolean;
}

export interface DisplayPreferences {
	theme: ThemeMode;
	/** Combined with prefers-reduced-motion in shouldAnimate() */
	animationsEnabled: boolean;
	dateFormat: DateFormat;
	numberFormat: NumberFormat;
	/** Privacy mode - hides portfolio values when false */
	showValues: boolean;
	compactMode: boolean;
	/** Auto-switch to light before market open, dark after market close */
	autoThemeByMarketHours: boolean;
}

export type FeedEventType =
	| "quote"
	| "trade"
	| "options_quote"
	| "options_trade"
	| "decision"
	| "order"
	| "fill"
	| "reject"
	| "alert"
	| "agent"
	| "cycle"
	| "system";

export interface FeedPreferences {
	autoScroll: boolean;
	maxEvents: number;
	showTimestamps: boolean;
	groupSimilar: boolean;
	/** Which event types are visible in the feed */
	enabledEventTypes: Record<FeedEventType, boolean>;
	/** Symbol filter text */
	symbolFilter: string;
}

export interface PreferencesState {
	sound: SoundPreferences;
	notifications: NotificationPreferences;
	display: DisplayPreferences;
	feed: FeedPreferences;
	lastUpdated: number;
}

export interface PreferencesActions {
	updateSound: (prefs: Partial<SoundPreferences>) => void;
	updateNotifications: (prefs: Partial<NotificationPreferences>) => void;
	updateDisplay: (prefs: Partial<DisplayPreferences>) => void;
	updateFeed: (prefs: Partial<FeedPreferences>) => void;
	resetToDefaults: () => void;
	togglePreference: (category: "sound" | "notifications" | "display" | "feed", key: string) => void;
	getComputedTheme: () => "light" | "dark";
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
	marketBell: true,
};

const defaultNotificationPreferences: NotificationPreferences = {
	enabled: false,
	criticalAlerts: true,
	tradeExecutions: true,
	priceAlerts: true,
};

const defaultDisplayPreferences: DisplayPreferences = {
	theme: "light",
	animationsEnabled: true,
	dateFormat: "relative",
	numberFormat: "short",
	showValues: true,
	compactMode: false,
	autoThemeByMarketHours: false,
};

const defaultFeedPreferences: FeedPreferences = {
	autoScroll: true,
	maxEvents: 1000,
	showTimestamps: true,
	groupSimilar: true,
	enabledEventTypes: {
		quote: true,
		trade: true,
		options_quote: true,
		options_trade: true,
		decision: true,
		order: true,
		fill: true,
		reject: true,
		alert: true,
		agent: true,
		cycle: true,
		system: false, // Hidden by default
	},
	symbolFilter: "",
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

function prefersReducedMotion(): boolean {
	if (typeof window === "undefined") {
		return false;
	}
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getSystemTheme(): "light" | "dark" {
	if (typeof window === "undefined") {
		return "light";
	}
	return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
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
							if (typeof categoryState[key] !== "boolean") {
								return state;
							}

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
						if (!state.display.animationsEnabled) {
							return false;
						}
						if (prefersReducedMotion()) {
							return false;
						}
						return true;
					},
				}),
				{
					name: "cream-preferences",
					version: 4,
					migrate: (persisted, version) => {
						const state = persisted as Partial<PreferencesState>;
						if (version < 2) {
							return {
								...initialState,
								...state,
								feed: {
									...defaultFeedPreferences,
									...state.feed,
								},
							};
						}
						if (version < 3) {
							return {
								...initialState,
								...state,
								sound: {
									...defaultSoundPreferences,
									...state.sound,
								},
							};
						}
						if (version < 4) {
							return {
								...initialState,
								...state,
								display: {
									...defaultDisplayPreferences,
									...state.display,
								},
							};
						}
						return persisted as PreferencesState;
					},
				},
			),
		),
		{ name: "preferences-store" },
	),
);

// ============================================
// Selectors
// ============================================

export const selectSoundEnabled = (state: PreferencesStore) => state.sound.enabled;
export const selectSoundVolume = (state: PreferencesStore) => state.sound.volume;
export const selectNotificationsEnabled = (state: PreferencesStore) => state.notifications.enabled;
export const selectTheme = (state: PreferencesStore) => state.display.theme;
export const selectCompactMode = (state: PreferencesStore) => state.display.compactMode;
export const selectShowValues = (state: PreferencesStore) => state.display.showValues;
export const selectAutoScroll = (state: PreferencesStore) => state.feed.autoScroll;
export const selectDateFormat = (state: PreferencesStore) => state.display.dateFormat;
export const selectNumberFormat = (state: PreferencesStore) => state.display.numberFormat;
export const selectFeedEnabledEventTypes = (state: PreferencesStore) =>
	state.feed.enabledEventTypes;
export const selectFeedSymbolFilter = (state: PreferencesStore) => state.feed.symbolFilter;

// ============================================
// Theme Management
// ============================================

let themeTransitionTimer: ReturnType<typeof setTimeout> | null = null;

export function applyTheme(theme: "light" | "dark"): void {
	if (typeof document === "undefined") {
		return;
	}

	const html = document.documentElement;
	const isInitial = !html.hasAttribute("data-theme");

	html.setAttribute("data-theme", theme);

	// Toggle .dark class for Tailwind dark: variants
	if (theme === "dark") {
		html.classList.add("dark");
	} else {
		html.classList.remove("dark");
	}

	// 15s crossfade between themes (skip on initial load)
	if (!isInitial) {
		if (themeTransitionTimer) {
			clearTimeout(themeTransitionTimer);
		}
		html.classList.add("transitioning");
		themeTransitionTimer = setTimeout(() => {
			html.classList.remove("transitioning");
			themeTransitionTimer = null;
		}, 15_000);
	}

	const metaThemeColor = document.querySelector('meta[name="theme-color"]');
	if (metaThemeColor) {
		metaThemeColor.setAttribute("content", theme === "dark" ? "#0c0a09" : "#f5f5f4");
	}
}

/** Call in app root useEffect. Returns unsubscribe function. */
export function subscribeToThemeChanges(): () => void {
	const store = usePreferencesStore.getState();
	applyTheme(store.getComputedTheme());

	const unsubscribe = usePreferencesStore.subscribe(
		(state) => state.display.theme,
		() => {
			const store = usePreferencesStore.getState();
			applyTheme(store.getComputedTheme());
		},
	);

	// Re-apply when OS theme changes while in 'system' mode
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

export default usePreferencesStore;
