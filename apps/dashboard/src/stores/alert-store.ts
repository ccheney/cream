/**
 * @see docs/plans/ui/31-realtime-patterns.md lines 89-118
 */

import { create } from "zustand";

export type AlertSeverity = "critical" | "warning" | "info";

export interface AlertAction {
	label: string;
	onClick: () => void;
}

export interface Alert {
	id: string;
	severity: AlertSeverity;
	title: string;
	message: string;
	action?: AlertAction;
	playSound?: boolean;
	pushNotification?: boolean;
	createdAt: number;
	/** Used for exit animation */
	dismissing?: boolean;
	/** Critical alerts require explicit acknowledgment before dismissal */
	acknowledged?: boolean;
}

export interface AlertSettings {
	soundCritical: boolean;
	soundWarning: boolean;
	soundInfo: boolean;
	pushEnabled: boolean;
	warningDuration: number;
	infoDuration: number;
}

export interface AlertStore {
	alerts: Alert[];
	/** Only one critical banner displayed at a time */
	criticalBanner: Alert | null;
	settings: AlertSettings;

	addAlert: (alert: Omit<Alert, "id" | "createdAt">) => string;
	acknowledgeCritical: () => void;
	dismissAlert: (id: string) => void;
	clearAlerts: () => void;
	updateSettings: (settings: Partial<AlertSettings>) => void;

	critical: (title: string, message: string, action?: AlertAction) => string;
	warning: (title: string, message: string, action?: AlertAction) => string;
	info: (title: string, message: string, action?: AlertAction) => string;
}

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

const audioContext =
	typeof window !== "undefined"
		? new (
				window.AudioContext ||
				(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
			)()
		: null;

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
		// Browser may block audio without user interaction
	}
}

function playAlertSound(severity: AlertSeverity): void {
	switch (severity) {
		case "critical":
			playBeep(800, 0.15, 0.3);
			setTimeout(() => playBeep(800, 0.15, 0.3), 200);
			break;
		case "warning":
			playBeep(600, 0.1, 0.2);
			break;
		case "info":
			playBeep(1000, 0.08, 0.15);
			break;
	}
}

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
		// Service workers may not be available in all contexts
	}
}

function generateId(): string {
	return `alert-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

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

		if (alert.severity === "critical") {
			set({ criticalBanner: alert });

			if (alert.playSound !== false && settings.soundCritical) {
				playAlertSound("critical");
			}

			if (alert.pushNotification !== false && settings.pushEnabled) {
				sendPushNotification(alert);
			}

			return id;
		}

		set((state) => {
			const newAlerts = [...state.alerts, alert].slice(-MAX_VISIBLE_ALERTS);
			return { alerts: newAlerts };
		});

		const soundEnabled = alert.severity === "warning" ? settings.soundWarning : settings.soundInfo;
		if (alert.playSound !== false && soundEnabled) {
			playAlertSound(alert.severity);
		}

		if (alert.pushNotification !== false && settings.pushEnabled) {
			sendPushNotification(alert);
		}

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

/**
 * @example
 * const alert = useAlert();
 * alert.critical("Position Limit Exceeded", "NVDA exposure exceeded 10% limit");
 * alert.warning("Approaching Limit", "AAPL at 85% of position limit", {
 *   label: "View Risk Dashboard",
 *   onClick: () => router.push("/risk"),
 * });
 * alert.info("Order Filled", "Bought 100 AAPL @ $187.50");
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
