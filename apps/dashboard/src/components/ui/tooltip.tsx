/**
 * Tooltip Component
 *
 * Single-line hints on hover with auto-positioning.
 * Implements Cream design system elevation and warmth.
 *
 * @see docs/plans/ui/24-components.md tooltips section
 * @see docs/plans/ui/20-design-philosophy.md
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
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

// ============================================
// Types
// ============================================

export type TooltipPosition = "top" | "bottom" | "left" | "right";

export interface TooltipContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  contentId: string;
}

export interface TooltipProps {
  /** Delay before showing tooltip in ms (default: 200) */
  delayMs?: number;
  /** Children (Trigger and Content) */
  children: ReactNode;
}

export interface TooltipTriggerProps extends HTMLAttributes<HTMLSpanElement> {
  /** Trigger element */
  children: ReactNode;
  /** Render as child element instead of wrapping span */
  asChild?: boolean;
}

export interface TooltipContentProps extends HTMLAttributes<HTMLDivElement> {
  /** Preferred position (auto-adjusts if needed) */
  position?: TooltipPosition;
  /** Tooltip text content */
  children: ReactNode;
}

// ============================================
// Context
// ============================================

const TooltipContext = createContext<TooltipContextValue | null>(null);

function useTooltipContext() {
  const context = useContext(TooltipContext);
  if (!context) {
    throw new Error("Tooltip components must be used within a Tooltip provider");
  }
  return context;
}

// ============================================
// Tooltip Root
// ============================================

/**
 * Tooltip - Hover hint container.
 *
 * @example
 * ```tsx
 * <Tooltip>
 *   <TooltipTrigger>
 *     <button>Hover me</button>
 *   </TooltipTrigger>
 *   <TooltipContent>Helpful hint text</TooltipContent>
 * </Tooltip>
 * ```
 */
export function Tooltip({ delayMs = 200, children }: TooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const contentId = useId();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open = useCallback(() => {
    timeoutRef.current = setTimeout(() => {
      setIsOpen(true);
    }, delayMs);
  }, [delayMs]);

  const close = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsOpen(false);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <TooltipContext.Provider value={{ isOpen, open, close, triggerRef, contentId }}>
      {children}
    </TooltipContext.Provider>
  );
}

// ============================================
// TooltipTrigger
// ============================================

/**
 * TooltipTrigger - Element that triggers the tooltip.
 */
export const TooltipTrigger = forwardRef<HTMLSpanElement, TooltipTriggerProps>(
  ({ children, asChild, className, ...props }, ref) => {
    const { open, close, triggerRef, contentId, isOpen } = useTooltipContext();

    // Combine refs
    const handleRef = useCallback(
      (node: HTMLSpanElement | null) => {
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
      <span
        ref={handleRef}
        role="none"
        onMouseEnter={open}
        onMouseLeave={close}
        onFocus={open}
        onBlur={close}
        aria-describedby={isOpen ? contentId : undefined}
        className={cn("inline-block", className)}
        {...props}
      >
        {children}
      </span>
    );
  }
);

TooltipTrigger.displayName = "TooltipTrigger";

// ============================================
// TooltipContent
// ============================================

/**
 * TooltipContent - The tooltip content.
 *
 * Styled with Cream design system tokens for warm, layered appearance.
 */
export const TooltipContent = forwardRef<HTMLDivElement, TooltipContentProps>(
  ({ position = "top", children, className, style, ...props }, ref) => {
    const { isOpen, triggerRef, contentId } = useTooltipContext();
    const contentRef = useRef<HTMLDivElement | null>(null);
    const [adjustedPosition, setAdjustedPosition] = useState(position);

    useLayoutEffect(() => {
      const content = contentRef.current;
      const trigger = triggerRef.current;

      if (!isOpen || !trigger || !content) {
        return;
      }

      const triggerRect = trigger.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      const gap = 6;

      let newPosition = position;

      const calculatePosition = (pos: TooltipPosition) => {
        switch (pos) {
          case "top":
            return {
              top: triggerRect.top - contentRect.height - gap,
              left: triggerRect.left + (triggerRect.width - contentRect.width) / 2,
            };
          case "bottom":
            return {
              top: triggerRect.bottom + gap,
              left: triggerRect.left + (triggerRect.width - contentRect.width) / 2,
            };
          case "left":
            return {
              top: triggerRect.top + (triggerRect.height - contentRect.height) / 2,
              left: triggerRect.left - contentRect.width - gap,
            };
          case "right":
            return {
              top: triggerRect.top + (triggerRect.height - contentRect.height) / 2,
              left: triggerRect.right + gap,
            };
        }
      };

      let { top, left } = calculatePosition(position);

      if (top < 8 && position === "top") {
        newPosition = "bottom";
        const newPos = calculatePosition("bottom");
        top = newPos.top;
        left = newPos.left;
      } else if (top + contentRect.height > window.innerHeight - 8 && position === "bottom") {
        newPosition = "top";
        const newPos = calculatePosition("top");
        top = newPos.top;
        left = newPos.left;
      }

      left = Math.max(8, Math.min(left, window.innerWidth - contentRect.width - 8));

      content.style.top = `${top}px`;
      content.style.left = `${left}px`;
      content.style.opacity = "1";
      content.style.transform = "translateY(0)";

      setAdjustedPosition(newPosition);
    }, [isOpen, position, triggerRef]);

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

    if (!isOpen || typeof document === "undefined") {
      return null;
    }

    const tooltipContent = (
      <div
        ref={handleRef}
        id={contentId}
        role="tooltip"
        className={cn(
          // Layout
          "fixed px-3 py-1.5 max-w-xs",
          // Typography - using system font for clarity
          "text-[13px] leading-snug font-medium tracking-tight",
          // Colors using CSS variables (warm, not stark)
          "bg-stone-700 dark:bg-cream-100",
          "text-cream-50 dark:text-stone-700",
          // Border for subtle definition
          "border border-stone-600/50 dark:border-cream-300",
          // Layered surface with soft shadow
          "rounded-lg",
          // Z-index from design system
          "z-tooltip",
          // Transition for smooth appearance
          "transition-[opacity,transform] duration-150 ease-out",
          className
        )}
        style={{
          top: 0,
          left: 0,
          opacity: 0,
          transform: "translateY(4px)",
          boxShadow: "var(--shadow-tooltip), 0 0 0 1px rgba(0,0,0,0.04)",
          ...style,
        }}
        {...props}
      >
        {children}
        {/* Arrow - subtle pointer */}
        <span
          className={cn(
            "absolute w-2 h-2 rotate-45",
            "bg-stone-700 dark:bg-cream-100",
            "border-stone-600/50 dark:border-cream-300",
            adjustedPosition === "top" &&
              "bottom-[-5px] left-1/2 -translate-x-1/2 border-b border-r",
            adjustedPosition === "bottom" &&
              "top-[-5px] left-1/2 -translate-x-1/2 border-t border-l",
            adjustedPosition === "left" &&
              "right-[-5px] top-1/2 -translate-y-1/2 border-t border-r",
            adjustedPosition === "right" && "left-[-5px] top-1/2 -translate-y-1/2 border-b border-l"
          )}
          aria-hidden="true"
        />
      </div>
    );

    return createPortal(tooltipContent, document.body);
  }
);

TooltipContent.displayName = "TooltipContent";

// ============================================
// Exports
// ============================================

export default Tooltip;
