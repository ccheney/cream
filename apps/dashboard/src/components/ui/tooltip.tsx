/**
 * Tooltip Component
 *
 * Single-line hints on hover with auto-positioning.
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

export type TooltipPosition = "top" | "bottom" | "left" | "right";

export interface TooltipContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  contentId: string;
}

export interface TooltipProps {
  /** Delay before showing tooltip in ms (default: 300) */
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
export function Tooltip({ delayMs = 300, children }: TooltipProps) {
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

  // Cleanup on unmount
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
 */
export const TooltipContent = forwardRef<HTMLDivElement, TooltipContentProps>(
  ({ position = "top", children, className, style, ...props }, ref) => {
    const { isOpen, triggerRef, contentId } = useTooltipContext();
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
      const calculatePosition = (pos: TooltipPosition) => {
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
        role="tooltip"
        className={cn(
          "fixed z-50 px-2.5 py-1.5 text-xs font-medium",
          "bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900",
          "rounded-md shadow-lg",
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
            "absolute w-2 h-2 bg-stone-900 dark:bg-stone-100 rotate-45",
            adjustedPosition === "top" && "bottom-[-4px] left-1/2 -translate-x-1/2",
            adjustedPosition === "bottom" && "top-[-4px] left-1/2 -translate-x-1/2",
            adjustedPosition === "left" && "right-[-4px] top-1/2 -translate-y-1/2",
            adjustedPosition === "right" && "left-[-4px] top-1/2 -translate-y-1/2"
          )}
          aria-hidden="true"
        />
      </div>
    );
  }
);

TooltipContent.displayName = "TooltipContent";

// ============================================
// Exports
// ============================================

export default Tooltip;
