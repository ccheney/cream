/**
 * Popover Component
 *
 * Rich content popup triggered by click.
 *
 * @see docs/plans/ui/24-components.md tooltips section
 */

"use client";

import {
	createContext,
	forwardRef,
	type HTMLAttributes,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";

// Simple className merger utility
function cn(...classes: (string | boolean | undefined | null)[]): string {
	return classes.filter(Boolean).join(" ");
}

// ============================================
// Types
// ============================================

export type PopoverPosition = "top" | "bottom" | "left" | "right";

export interface PopoverContextValue {
	isOpen: boolean;
	toggle: () => void;
	close: () => void;
	triggerRef: React.RefObject<HTMLElement | null>;
	contentId: string;
}

export interface PopoverProps {
	/** Initial open state */
	defaultOpen?: boolean;
	/** Controlled open state */
	open?: boolean;
	/** Callback when open state changes */
	onOpenChange?: (open: boolean) => void;
	/** Children (Trigger and Content) */
	children: ReactNode;
}

export interface PopoverTriggerProps extends HTMLAttributes<HTMLButtonElement> {
	/** Trigger element */
	children: ReactNode;
}

export interface PopoverContentProps extends HTMLAttributes<HTMLDivElement> {
	/** Preferred position */
	position?: PopoverPosition;
	/** Popover content */
	children: ReactNode;
}

// ============================================
// Context
// ============================================

const PopoverContext = createContext<PopoverContextValue | null>(null);

function usePopoverContext() {
	const context = useContext(PopoverContext);
	if (!context) {
		throw new Error("Popover components must be used within a Popover provider");
	}
	return context;
}

interface PopoverPositionState {
	position: PopoverPosition;
	top: number;
	left: number;
}

function calculatePopoverPosition(
	position: PopoverPosition,
	triggerRect: DOMRect,
	contentRect: DOMRect,
	viewportWidth: number,
	viewportHeight: number,
): PopoverPositionState {
	const padding = 8;
	const candidates: { position: PopoverPosition; top: number; left: number }[] = [
		{
			position: "top",
			top: triggerRect.top - contentRect.height - padding,
			left: triggerRect.left + (triggerRect.width - contentRect.width) / 2,
		},
		{
			position: "bottom",
			top: triggerRect.bottom + padding,
			left: triggerRect.left + (triggerRect.width - contentRect.width) / 2,
		},
		{
			position: "left",
			top: triggerRect.top + (triggerRect.height - contentRect.height) / 2,
			left: triggerRect.left - contentRect.width - padding,
		},
		{
			position: "right",
			top: triggerRect.top + (triggerRect.height - contentRect.height) / 2,
			left: triggerRect.right + padding,
		},
	];

	const defaultCandidate = candidates.find((entry) => entry.position === position) ?? candidates[1];
	const fallbackCandidate = candidates[0] ?? defaultCandidate;
	let result = defaultCandidate ?? fallbackCandidate;
	let { top, left } = result;

	if (result.position === "top" && candidates[1]?.top !== undefined && candidates[1].top < 0) {
		result = candidates[1];
		top = candidates[1].top;
		left = candidates[1].left;
	}

	if (
		result.position === "bottom" &&
		result.top + contentRect.height > viewportHeight &&
		candidates[0]
	) {
		result = candidates[0];
		top = result.top;
		left = result.left;
	}

	left = Math.max(padding, Math.min(left, viewportWidth - contentRect.width - padding));
	return { position: result.position, top, left };
}

function usePopoverPosition(
	isOpen: boolean,
	position: PopoverPosition,
	triggerRef: React.RefObject<HTMLElement | null>,
	contentRef: React.RefObject<HTMLDivElement | null>,
): PopoverPositionState {
	const [coords, setCoords] = useState({ top: 0, left: 0, position });

	useEffect(() => {
		if (!isOpen || !triggerRef.current || !contentRef.current) {
			return;
		}

		const triggerRect = triggerRef.current.getBoundingClientRect();
		const contentRect = contentRef.current.getBoundingClientRect();
		setCoords(
			calculatePopoverPosition(
				position,
				triggerRect,
				contentRect,
				window.innerWidth,
				window.innerHeight,
			),
		);
	}, [isOpen, position, triggerRef, contentRef]);

	return coords;
}

function usePopoverDismissHandlers(
	isOpen: boolean,
	close: () => void,
	contentRef: React.RefObject<HTMLDivElement | null>,
	triggerRef: React.RefObject<HTMLElement | null>,
) {
	useEffect(() => {
		if (!isOpen) {
			return;
		}

		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				close();
			}
		};

		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as Node;
			if (
				contentRef.current &&
				!contentRef.current.contains(target) &&
				triggerRef.current &&
				!triggerRef.current.contains(target)
			) {
				close();
			}
		};

		document.addEventListener("keydown", handleEscape);
		const timeout = setTimeout(() => {
			document.addEventListener("mousedown", handleClickOutside);
		}, 0);

		return () => {
			clearTimeout(timeout);
			document.removeEventListener("keydown", handleEscape);
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [isOpen, close, contentRef, triggerRef]);
}

// ============================================
// Root
// ============================================

/**
 * Popover - Click-triggered rich content popup.
 */
export function Popover({ defaultOpen = false, open, onOpenChange, children }: PopoverProps) {
	const [internalOpen, setInternalOpen] = useState(defaultOpen);
	const triggerRef = useRef<HTMLElement | null>(null);
	const contentId = useId();

	const isControlled = open !== undefined;
	const isOpen = isControlled ? open : internalOpen;

	const toggle = useCallback(() => {
		const nextOpen = !isOpen;
		if (!isControlled) {
			setInternalOpen(nextOpen);
		}
		onOpenChange?.(nextOpen);
	}, [isOpen, isControlled, onOpenChange]);

	const close = useCallback(() => {
		if (!isControlled) {
			setInternalOpen(false);
		}
		onOpenChange?.(false);
	}, [isControlled, onOpenChange]);

	return (
		<PopoverContext.Provider value={{ isOpen, toggle, close, triggerRef, contentId }}>
			{children}
		</PopoverContext.Provider>
	);
}

// ============================================
// Trigger
// ============================================

/**
 * PopoverTrigger - Button that triggers the popover.
 */
export const PopoverTrigger = forwardRef<HTMLButtonElement, PopoverTriggerProps>(
	({ children, className, ...props }, ref) => {
		const { toggle, triggerRef, contentId, isOpen } = usePopoverContext();

		const handleRef = useCallback(
			(node: HTMLButtonElement | null) => {
				triggerRef.current = node;
				if (typeof ref === "function") {
					ref(node);
				} else if (ref) {
					ref.current = node;
				}
			},
			[ref, triggerRef],
		);

		return (
			<button
				ref={handleRef}
				type="button"
				onClick={toggle}
				aria-expanded={isOpen}
				aria-controls={isOpen ? contentId : undefined}
				aria-haspopup="dialog"
				className={className}
				{...props}
			>
				{children}
			</button>
		);
	},
);

PopoverTrigger.displayName = "PopoverTrigger";

// ============================================
// Content
// ============================================

function PopoverArrow({
	adjustedPosition,
	style,
}: {
	adjustedPosition: PopoverPosition;
	style: string;
}) {
	return (
		<div
			className={cn(
				"absolute w-3 h-3 bg-white dark:bg-stone-800 rotate-45",
				"border-stone-200 dark:border-stone-700",
				adjustedPosition === "top" && "bottom-[-6px] left-1/2 -translate-x-1/2 border-b border-r",
				adjustedPosition === "bottom" && "top-[-6px] left-1/2 -translate-x-1/2 border-t border-l",
				adjustedPosition === "left" && "right-[-6px] top-1/2 -translate-y-1/2 border-t border-r",
				adjustedPosition === "right" && "left-[-6px] top-1/2 -translate-y-1/2 border-b border-l",
			)}
			aria-hidden="true"
			style={style}
		/>
	);
}

/**
 * PopoverContent - The popover content panel.
 */
export const PopoverContent = forwardRef<HTMLDivElement, PopoverContentProps>(
	({ position = "bottom", children, className, style, ...props }, ref) => {
		const { isOpen, close, triggerRef, contentId } = usePopoverContext();
		const contentRef = useRef<HTMLDivElement | null>(null);
		const {
			top,
			left,
			position: adjustedPosition,
		} = usePopoverPosition(isOpen, position, triggerRef, contentRef);

		usePopoverDismissHandlers(isOpen, close, contentRef, triggerRef);

		const handleRef = useCallback(
			(node: HTMLDivElement | null) => {
				contentRef.current = node;
				if (typeof ref === "function") {
					ref(node);
				} else if (ref) {
					ref.current = node;
				}
			},
			[ref],
		);

		if (!isOpen) {
			return null;
		}

		return (
			<div
				ref={handleRef}
				id={contentId}
				role="dialog"
				aria-modal="false"
				className={cn(
					"fixed z-50 min-w-[200px] p-4",
					"bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100",
					"rounded-lg shadow-lg border border-stone-200 dark:border-stone-700",
					"animate-in fade-in-0 zoom-in-95 duration-150",
					className,
				)}
				style={{ top, left, ...style }}
				{...props}
			>
				{children}
				<PopoverArrow adjustedPosition={adjustedPosition} style={{}} />
			</div>
		);
	},
);

PopoverContent.displayName = "PopoverContent";

// ============================================
// Exports
// ============================================

export default Popover;
