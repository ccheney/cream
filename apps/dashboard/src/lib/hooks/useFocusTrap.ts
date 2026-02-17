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

function collectFocusableElements(container: HTMLDivElement | null): HTMLElement[] {
	if (!container) {
		return [];
	}
	return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR));
}

function focusElement(element: HTMLElement | null | undefined): void {
	if (element) {
		element.focus();
	}
}

function resolveInitialFocusTarget(
	container: HTMLDivElement | null,
	initialFocus: UseFocusTrapOptions["initialFocus"],
): HTMLElement | null {
	if (!initialFocus) {
		return null;
	}
	if (typeof initialFocus === "string") {
		return container?.querySelector<HTMLElement>(initialFocus) ?? null;
	}
	return initialFocus.current ?? null;
}

function trapTabNavigation(event: KeyboardEvent, focusableElements: HTMLElement[]): void {
	if (focusableElements.length === 0) {
		event.preventDefault();
		return;
	}

	const firstElement = focusableElements[0];
	const lastElement = focusableElements.at(-1);
	if (!firstElement || !lastElement) {
		event.preventDefault();
		return;
	}

	const shouldWrapBackward = event.shiftKey && document.activeElement === firstElement;
	const shouldWrapForward = !event.shiftKey && document.activeElement === lastElement;
	if (shouldWrapBackward) {
		event.preventDefault();
		lastElement.focus();
		return;
	}
	if (shouldWrapForward) {
		event.preventDefault();
		firstElement.focus();
	}
}

interface InitialFocusEffectOptions {
	active: boolean;
	autoFocus: boolean;
	initialFocus: UseFocusTrapOptions["initialFocus"];
	containerRef: React.RefObject<HTMLDivElement | null>;
	previousActiveElement: React.RefObject<Element | null>;
	focusFirst: () => void;
}

function useInitialFocusEffect({
	active,
	autoFocus,
	initialFocus,
	containerRef,
	previousActiveElement,
	focusFirst,
}: InitialFocusEffectOptions): void {
	useEffect(() => {
		if (!active || !autoFocus) {
			return;
		}

		previousActiveElement.current = document.activeElement;
		requestAnimationFrame(() => {
			const target = resolveInitialFocusTarget(containerRef.current, initialFocus);
			if (target) {
				target.focus();
				return;
			}
			focusFirst();
		});
	}, [active, autoFocus, initialFocus, containerRef, previousActiveElement, focusFirst]);
}

function useReturnFocusEffect(
	active: boolean,
	returnFocusTo: React.RefObject<HTMLElement> | undefined,
	previousActiveElement: React.RefObject<Element | null>,
): void {
	useEffect(() => {
		if (active) {
			return;
		}

		const returnElement = returnFocusTo?.current ?? previousActiveElement.current;
		if (returnElement instanceof HTMLElement) {
			returnElement.focus();
		}
	}, [active, returnFocusTo, previousActiveElement]);
}

interface FocusTrapKeydownEffectOptions {
	active: boolean;
	onEscape?: () => void;
	getFocusableElements: () => HTMLElement[];
}

function useFocusTrapKeydownEffect({
	active,
	onEscape,
	getFocusableElements,
}: FocusTrapKeydownEffectOptions): void {
	useEffect(() => {
		if (!active) {
			return;
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape" && onEscape) {
				event.preventDefault();
				onEscape();
				return;
			}
			if (event.key !== "Tab") {
				return;
			}

			trapTabNavigation(event, getFocusableElements());
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [active, onEscape, getFocusableElements]);
}

function useFocusContainmentEffect(
	active: boolean,
	containerRef: React.RefObject<HTMLDivElement | null>,
	focusFirst: () => void,
): void {
	useEffect(() => {
		if (!active) {
			return;
		}

		const handleFocusIn = (event: FocusEvent) => {
			const container = containerRef.current;
			if (!container) {
				return;
			}
			const target = event.target as Node;
			if (container.contains(target)) {
				return;
			}

			event.preventDefault();
			focusFirst();
		};

		document.addEventListener("focusin", handleFocusIn);
		return () => document.removeEventListener("focusin", handleFocusIn);
	}, [active, containerRef, focusFirst]);
}

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

	const getFocusableElements = useCallback((): HTMLElement[] => {
		return collectFocusableElements(containerRef.current);
	}, []);

	const focusFirst = useCallback(() => {
		const elements = getFocusableElements();
		focusElement(elements[0]);
	}, [getFocusableElements]);

	const focusLast = useCallback(() => {
		const elements = getFocusableElements();
		focusElement(elements.at(-1));
	}, [getFocusableElements]);

	useInitialFocusEffect({
		active,
		autoFocus,
		initialFocus,
		containerRef,
		previousActiveElement,
		focusFirst,
	});
	useReturnFocusEffect(active, returnFocusTo, previousActiveElement);
	useFocusTrapKeydownEffect({ active, onEscape, getFocusableElements });
	useFocusContainmentEffect(active, containerRef, focusFirst);

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
