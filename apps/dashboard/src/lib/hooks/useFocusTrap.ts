/**
 * useFocusTrap Hook
 *
 * Traps focus within a container element for accessibility in modals and dialogs.
 *
 * @see docs/plans/ui/29-accessibility.md Focus Management section (lines 40-48)
 */

"use client";

import { useCallback, useEffect, useRef } from "react";

// ============================================
// Types
// ============================================

export interface UseFocusTrapOptions {
	/** Whether the focus trap is active */
	active?: boolean;
	/** Initial element to focus (selector or ref) */
	initialFocus?: string | React.RefObject<HTMLElement>;
	/** Element to return focus to on deactivation */
	returnFocusTo?: React.RefObject<HTMLElement>;
	/** Callback when escape is pressed */
	onEscape?: () => void;
	/** Whether to auto-focus on mount (default: true) */
	autoFocus?: boolean;
}

export interface UseFocusTrapReturn {
	/** Ref to attach to the container element */
	containerRef: React.RefObject<HTMLDivElement | null>;
	/** Manually focus the first focusable element */
	focusFirst: () => void;
	/** Manually focus the last focusable element */
	focusLast: () => void;
}

// ============================================
// Constants
// ============================================

const FOCUSABLE_SELECTOR = [
	"a[href]",
	"area[href]",
	"input:not([disabled]):not([type='hidden'])",
	"select:not([disabled])",
	"textarea:not([disabled])",
	"button:not([disabled])",
	"[tabindex]:not([tabindex='-1'])",
	"[contenteditable='true']",
].join(",");

// ============================================
// Hook
// ============================================

/**
 * Hook to trap focus within a container element.
 *
 * Features:
 * - Tab cycles through focusable elements
 * - Shift+Tab cycles backwards
 * - Focus is trapped within container
 * - Escape key triggers callback
 * - Focus returns to trigger element on unmount
 *
 * @example
 * ```tsx
 * function Modal({ open, onClose }) {
 *   const { containerRef } = useFocusTrap({
 *     active: open,
 *     onEscape: onClose,
 *   });
 *
 *   if (!open) return null;
 *
 *   return (
 *     <div ref={containerRef} role="dialog">
 *       <button>First</button>
 *       <button>Second</button>
 *       <button onClick={onClose}>Close</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useFocusTrap(options: UseFocusTrapOptions = {}): UseFocusTrapReturn {
	const { active = true, initialFocus, returnFocusTo, onEscape, autoFocus = true } = options;

	const containerRef = useRef<HTMLDivElement | null>(null);
	const previousActiveElement = useRef<Element | null>(null);

	// Get all focusable elements in container
	const getFocusableElements = useCallback((): HTMLElement[] => {
		if (!containerRef.current) {
			return [];
		}
		return Array.from(containerRef.current.querySelectorAll(FOCUSABLE_SELECTOR));
	}, []);

	// Focus the first focusable element
	const focusFirst = useCallback(() => {
		const elements = getFocusableElements();
		const first = elements[0];
		if (first) {
			first.focus();
		}
	}, [getFocusableElements]);

	// Focus the last focusable element
	const focusLast = useCallback(() => {
		const elements = getFocusableElements();
		const last = elements[elements.length - 1];
		if (last) {
			last.focus();
		}
	}, [getFocusableElements]);

	// Handle initial focus
	useEffect(() => {
		if (!active || !autoFocus) {
			return;
		}

		// Store the currently focused element
		previousActiveElement.current = document.activeElement;

		// Focus initial element
		const setInitialFocus = () => {
			if (initialFocus) {
				if (typeof initialFocus === "string") {
					const element = containerRef.current?.querySelector<HTMLElement>(initialFocus);
					if (element) {
						element.focus();
						return;
					}
				} else if (initialFocus.current) {
					initialFocus.current.focus();
					return;
				}
			}
			// Default: focus first focusable element
			focusFirst();
		};

		// Slight delay to ensure DOM is ready
		requestAnimationFrame(setInitialFocus);
	}, [active, autoFocus, initialFocus, focusFirst]);

	// Return focus on deactivation
	useEffect(() => {
		if (active) {
			return;
		}

		// Return focus to designated element or previous active element
		const returnElement = returnFocusTo?.current ?? previousActiveElement.current;
		if (returnElement && returnElement instanceof HTMLElement) {
			returnElement.focus();
		}
	}, [active, returnFocusTo]);

	// Handle keyboard navigation
	useEffect(() => {
		if (!active) {
			return;
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			// Escape key
			if (event.key === "Escape" && onEscape) {
				event.preventDefault();
				onEscape();
				return;
			}

			// Tab key - trap focus
			if (event.key === "Tab") {
				const elements = getFocusableElements();
				if (elements.length === 0) {
					event.preventDefault();
					return;
				}

				const firstElement = elements[0];
				const lastElement = elements[elements.length - 1];

				if (!firstElement || !lastElement) {
					event.preventDefault();
					return;
				}

				if (event.shiftKey) {
					// Shift+Tab: if on first element, go to last
					if (document.activeElement === firstElement) {
						event.preventDefault();
						lastElement.focus();
					}
				} else {
					// Tab: if on last element, go to first
					if (document.activeElement === lastElement) {
						event.preventDefault();
						firstElement.focus();
					}
				}
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [active, getFocusableElements, onEscape]);

	// Prevent focus leaving the container
	useEffect(() => {
		if (!active) {
			return;
		}

		const handleFocusIn = (event: FocusEvent) => {
			if (!containerRef.current) {
				return;
			}

			const target = event.target as Node;
			if (!containerRef.current.contains(target)) {
				// Focus escaped - bring it back
				event.preventDefault();
				focusFirst();
			}
		};

		document.addEventListener("focusin", handleFocusIn);
		return () => document.removeEventListener("focusin", handleFocusIn);
	}, [active, focusFirst]);

	return {
		containerRef,
		focusFirst,
		focusLast,
	};
}

// ============================================
// Exports
// ============================================

export default useFocusTrap;
