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

// ============================================
// Popover Root
// ============================================

/**
 * Popover - Click-triggered rich content popup.
 *
 * @example
 * ```tsx
 * <Popover>
 *   <PopoverTrigger>
 *     <button>Open</button>
 *   </PopoverTrigger>
 *   <PopoverContent>
 *     <p>Rich content here</p>
 *     <button>Action</button>
 *   </PopoverContent>
 * </Popover>
 * ```
 */
export function Popover({ defaultOpen = false, open, onOpenChange, children }: PopoverProps) {
	const [internalOpen, setInternalOpen] = useState(defaultOpen);
	const triggerRef = useRef<HTMLElement | null>(null);
	const contentId = useId();

	const isControlled = open !== undefined;
	const isOpen = isControlled ? open : internalOpen;

	const toggle = useCallback(() => {
		const newOpen = !isOpen;
		if (!isControlled) {
			setInternalOpen(newOpen);
		}
		onOpenChange?.(newOpen);
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
// PopoverTrigger
// ============================================

/**
 * PopoverTrigger - Button that triggers the popover.
 */
export const PopoverTrigger = forwardRef<HTMLButtonElement, PopoverTriggerProps>(
	({ children, className, ...props }, ref) => {
		const { toggle, triggerRef, contentId, isOpen } = usePopoverContext();

		// Combine refs
		const handleRef = useCallback(
			(node: HTMLButtonElement | null) => {
				triggerRef.current = node;
				if (typeof ref === "function") {
					ref(node);
				} else if (ref) {
					ref.current = node;
				}
			},
			[ref, triggerRef]
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
	}
);

PopoverTrigger.displayName = "PopoverTrigger";

// ============================================
// PopoverContent
// ============================================

/**
 * PopoverContent - The popover content panel.
 */
export const PopoverContent = forwardRef<HTMLDivElement, PopoverContentProps>(
	({ position = "bottom", children, className, style, ...props }, ref) => {
		const { isOpen, close, triggerRef, contentId } = usePopoverContext();
		const contentRef = useRef<HTMLDivElement | null>(null);
		const [coords, setCoords] = useState({ top: 0, left: 0 });
		const [adjustedPosition, setAdjustedPosition] = useState(position);

		// Calculate position
		useEffect(() => {
			if (!isOpen || !triggerRef.current || !contentRef.current) {
				return;
			}

			const triggerRect = triggerRef.current.getBoundingClientRect();
			const contentRect = contentRef.current.getBoundingClientRect();
			const padding = 8;

			let newPosition = position;
			let top = 0;
			let left = 0;

			// Calculate initial position
			const calculatePosition = (pos: PopoverPosition) => {
				switch (pos) {
					case "top":
						return {
							top: triggerRect.top - contentRect.height - padding,
							left: triggerRect.left + (triggerRect.width - contentRect.width) / 2,
						};
					case "bottom":
						return {
							top: triggerRect.bottom + padding,
							left: triggerRect.left + (triggerRect.width - contentRect.width) / 2,
						};
					case "left":
						return {
							top: triggerRect.top + (triggerRect.height - contentRect.height) / 2,
							left: triggerRect.left - contentRect.width - padding,
						};
					case "right":
						return {
							top: triggerRect.top + (triggerRect.height - contentRect.height) / 2,
							left: triggerRect.right + padding,
						};
				}
			};

			const pos = calculatePosition(position);
			top = pos.top;
			left = pos.left;

			// Auto-adjust if out of viewport
			if (top < 0 && position === "top") {
				newPosition = "bottom";
				const newPos = calculatePosition("bottom");
				top = newPos.top;
				left = newPos.left;
			} else if (top + contentRect.height > window.innerHeight && position === "bottom") {
				newPosition = "top";
				const newPos = calculatePosition("top");
				top = newPos.top;
				left = newPos.left;
			}

			// Keep within horizontal bounds
			left = Math.max(padding, Math.min(left, window.innerWidth - contentRect.width - padding));

			setCoords({ top, left });
			setAdjustedPosition(newPosition);
		}, [isOpen, position, triggerRef]);

		// Close on escape
		useEffect(() => {
			if (!isOpen) {
				return;
			}

			const handleEscape = (e: KeyboardEvent) => {
				if (e.key === "Escape") {
					close();
				}
			};

			document.addEventListener("keydown", handleEscape);
			return () => document.removeEventListener("keydown", handleEscape);
		}, [isOpen, close]);

		// Close on outside click
		useEffect(() => {
			if (!isOpen) {
				return;
			}

			const handleClickOutside = (e: MouseEvent) => {
				const target = e.target as Node;
				if (
					contentRef.current &&
					!contentRef.current.contains(target) &&
					triggerRef.current &&
					!triggerRef.current.contains(target)
				) {
					close();
				}
			};

			// Delay to prevent immediate close on trigger click
			const timeout = setTimeout(() => {
				document.addEventListener("mousedown", handleClickOutside);
			}, 0);

			return () => {
				clearTimeout(timeout);
				document.removeEventListener("mousedown", handleClickOutside);
			};
		}, [isOpen, close, triggerRef]);

		// Combine refs
		const handleRef = useCallback(
			(node: HTMLDivElement | null) => {
				contentRef.current = node;
				if (typeof ref === "function") {
					ref(node);
				} else if (ref) {
					ref.current = node;
				}
			},
			[ref]
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
					className
				)}
				style={{
					top: coords.top,
					left: coords.left,
					...style,
				}}
				{...props}
			>
				{children}
				{/* Arrow */}
				<div
					className={cn(
						"absolute w-3 h-3 bg-white dark:bg-stone-800 rotate-45",
						"border-stone-200 dark:border-stone-700",
						adjustedPosition === "top" &&
							"bottom-[-6px] left-1/2 -translate-x-1/2 border-b border-r",
						adjustedPosition === "bottom" &&
							"top-[-6px] left-1/2 -translate-x-1/2 border-t border-l",
						adjustedPosition === "left" &&
							"right-[-6px] top-1/2 -translate-y-1/2 border-t border-r",
						adjustedPosition === "right" && "left-[-6px] top-1/2 -translate-y-1/2 border-b border-l"
					)}
					aria-hidden="true"
				/>
			</div>
		);
	}
);

PopoverContent.displayName = "PopoverContent";

// ============================================
// Exports
// ============================================

export default Popover;
