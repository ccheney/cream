/**
 * Toast Notification Store
 *
 * Zustand store for managing toast notifications with queue and auto-dismiss.
 *
 * @see docs/plans/ui/28-states.md lines 102-108
 */

import { create } from "zustand";

// ============================================
// Types
// ============================================

/**
 * Toast variant types.
 */
export type ToastVariant = "success" | "error" | "warning" | "info";

/**
 * Toast position.
 */
export type ToastPosition = "top-right" | "top-left" | "bottom-right" | "bottom-left";

/**
 * Individual toast data.
 */
export interface Toast {
	/** Unique toast ID */
	id: string;
	/** Toast variant */
	variant: ToastVariant;
	/** Toast message */
	message: string;
	/** Optional title */
	title?: string;
	/** Auto-dismiss duration in ms (0 = manual dismiss only) */
	duration: number;
	/** Created timestamp */
	createdAt: number;
	/** Is toast being dismissed (for exit animation) */
	dismissing?: boolean;
}

/**
 * Toast options for creating a new toast.
 */
export interface ToastOptions {
	/** Optional title */
	title?: string;
	/** Override default duration */
	duration?: number;
}

/**
 * Toast store state.
 */
export interface ToastStore {
	/** Active toasts (FIFO queue) */
	toasts: Toast[];
	/** Toast position */
	position: ToastPosition;
	/** Max visible toasts */
	maxVisible: number;

	// Actions
	/** Add a toast */
	addToast: (variant: ToastVariant, message: string, options?: ToastOptions) => string;
	/** Remove a toast by ID */
	removeToast: (id: string) => void;
	/** Mark toast as dismissing (for exit animation) */
	startDismiss: (id: string) => void;
	/** Remove all toasts */
	clearAll: () => void;
	/** Set toast position */
	setPosition: (position: ToastPosition) => void;

	// Convenience methods
	success: (message: string, options?: ToastOptions) => string;
	error: (message: string, options?: ToastOptions) => string;
	warning: (message: string, options?: ToastOptions) => string;
	info: (message: string, options?: ToastOptions) => string;
}

// ============================================
// Constants
// ============================================

/**
 * Default durations by variant (in ms).
 */
export const DEFAULT_DURATIONS: Record<ToastVariant, number> = {
	success: 4000,
	info: 4000,
	warning: 6000,
	error: 8000,
};

/**
 * Maximum visible toasts.
 */
export const MAX_VISIBLE_TOASTS = 3;

/**
 * Exit animation duration (ms).
 */
export const EXIT_ANIMATION_DURATION = 200;

// ============================================
// Utility Functions
// ============================================

/**
 * Generate unique toast ID.
 */
function generateId(): string {
	return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ============================================
// Store
// ============================================

/**
 * Toast notification store.
 */
export const useToastStore = create<ToastStore>((set, get) => ({
	toasts: [],
	position: "bottom-right",
	maxVisible: MAX_VISIBLE_TOASTS,

	addToast: (variant, message, options = {}) => {
		const id = generateId();
		const duration = options.duration ?? DEFAULT_DURATIONS[variant];

		const toast: Toast = {
			id,
			variant,
			message,
			title: options.title,
			duration,
			createdAt: Date.now(),
		};

		set((state) => {
			// Add new toast to the end
			const newToasts = [...state.toasts, toast];

			// Remove oldest toasts if exceeding max
			const visibleToasts = newToasts.slice(-state.maxVisible);

			return { toasts: visibleToasts };
		});

		// Schedule auto-dismiss if duration > 0
		if (duration > 0) {
			setTimeout(() => {
				get().startDismiss(id);
			}, duration);

			// Remove after exit animation
			setTimeout(() => {
				get().removeToast(id);
			}, duration + EXIT_ANIMATION_DURATION);
		}

		return id;
	},

	removeToast: (id) => {
		set((state) => ({
			toasts: state.toasts.filter((t) => t.id !== id),
		}));
	},

	startDismiss: (id) => {
		set((state) => ({
			toasts: state.toasts.map((t) => (t.id === id ? { ...t, dismissing: true } : t)),
		}));
	},

	clearAll: () => {
		set({ toasts: [] });
	},

	setPosition: (position) => {
		set({ position });
	},

	// Convenience methods
	success: (message, options) => get().addToast("success", message, options),
	error: (message, options) => get().addToast("error", message, options),
	warning: (message, options) => get().addToast("warning", message, options),
	info: (message, options) => get().addToast("info", message, options),
}));

// ============================================
// Hook
// ============================================

/**
 * useToast hook for creating toasts.
 *
 * @example
 * ```tsx
 * const toast = useToast();
 * toast.success("Position opened successfully");
 * toast.error("Failed to submit order");
 * toast.warning("Limit utilization at 80%");
 * toast.info("Market data updated");
 * ```
 */
export function useToast() {
	const store = useToastStore();

	return {
		success: store.success,
		error: store.error,
		warning: store.warning,
		info: store.info,
		dismiss: store.removeToast,
		clearAll: store.clearAll,
	};
}

// ============================================
// Selectors
// ============================================

/**
 * Select visible toasts.
 */
export function selectToasts(state: ToastStore): Toast[] {
	return state.toasts;
}

/**
 * Select toast position.
 */
export function selectPosition(state: ToastStore): ToastPosition {
	return state.position;
}

/**
 * Check if any toasts are visible.
 */
export function selectHasToasts(state: ToastStore): boolean {
	return state.toasts.length > 0;
}
