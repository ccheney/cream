/**
 * Collapsible Component
 *
 * Expandable content area with smooth height animation.
 *
 * @see docs/plans/ui/24-components.md Expandable Cards section
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

export interface CollapsibleContextValue {
  isOpen: boolean;
  toggle: () => void;
  contentId: string;
  triggerId: string;
}

export interface CollapsibleProps {
  /** Controlled open state */
  open?: boolean;
  /** Default open state (uncontrolled) */
  defaultOpen?: boolean;
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void;
  /** Disable the collapsible */
  disabled?: boolean;
  /** Children (CollapsibleTrigger, CollapsibleContent) */
  children: ReactNode;
}

export interface CollapsibleTriggerProps extends HTMLAttributes<HTMLButtonElement> {
  /** Custom element to render (default: button) */
  asChild?: boolean;
  children: ReactNode;
}

export interface CollapsibleContentProps extends HTMLAttributes<HTMLElement> {
  /** Animation duration in ms (default: 200) */
  animationDuration?: number;
  /** Force mount (always render content, useful for SEO) */
  forceMount?: boolean;
  children: ReactNode;
}

// ============================================
// Context
// ============================================

const CollapsibleContext = createContext<CollapsibleContextValue | null>(null);

function useCollapsibleContext() {
  const context = useContext(CollapsibleContext);
  if (!context) {
    throw new Error("Collapsible components must be used within a Collapsible provider");
  }
  return context;
}

// ============================================
// Chevron Icon
// ============================================

function ChevronIcon({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg
      className={cn("h-4 w-4 transition-transform duration-200", open && "rotate-180", className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// ============================================
// Collapsible Root
// ============================================

/**
 * Collapsible - Container for expandable content.
 *
 * @example
 * ```tsx
 * <Collapsible defaultOpen>
 *   <CollapsibleTrigger>
 *     Show Details
 *   </CollapsibleTrigger>
 *   <CollapsibleContent>
 *     Hidden content revealed on expand
 *   </CollapsibleContent>
 * </Collapsible>
 * ```
 */
export function Collapsible({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  disabled = false,
  children,
}: CollapsibleProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const contentId = useId();
  const triggerId = useId();

  // Use controlled or internal state
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;

  const toggle = useCallback(() => {
    if (disabled) {
      return;
    }

    const newOpen = !isOpen;
    if (!isControlled) {
      setInternalOpen(newOpen);
    }
    onOpenChange?.(newOpen);
  }, [isOpen, isControlled, onOpenChange, disabled]);

  return (
    <CollapsibleContext.Provider value={{ isOpen, toggle, contentId, triggerId }}>
      <div data-state={isOpen ? "open" : "closed"} data-disabled={disabled || undefined}>
        {children}
      </div>
    </CollapsibleContext.Provider>
  );
}

// ============================================
// CollapsibleTrigger
// ============================================

/**
 * CollapsibleTrigger - Button to toggle content visibility.
 */
export const CollapsibleTrigger = forwardRef<HTMLButtonElement, CollapsibleTriggerProps>(
  ({ children, className, ...props }, ref) => {
    const { isOpen, toggle, contentId, triggerId } = useCollapsibleContext();

    return (
      <button
        ref={ref}
        type="button"
        id={triggerId}
        aria-expanded={isOpen}
        aria-controls={contentId}
        onClick={toggle}
        className={cn(
          "flex items-center justify-between w-full",
          "text-left cursor-pointer",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
          className
        )}
        {...props}
      >
        {children}
        <ChevronIcon open={isOpen} />
      </button>
    );
  }
);

CollapsibleTrigger.displayName = "CollapsibleTrigger";

// ============================================
// CollapsibleContent
// ============================================

/**
 * CollapsibleContent - Animated content that expands/collapses.
 */
export const CollapsibleContent = forwardRef<HTMLElement, CollapsibleContentProps>(
  ({ children, animationDuration = 200, forceMount, className, style, ...props }, ref) => {
    const { isOpen, contentId, triggerId } = useCollapsibleContext();
    const contentRef = useRef<HTMLElement>(null);
    const [height, setHeight] = useState<number | "auto">(isOpen ? "auto" : 0);
    const [isAnimating, setIsAnimating] = useState(false);

    // Measure and animate height
    useEffect(() => {
      if (!contentRef.current) {
        return;
      }

      const content = contentRef.current;

      if (isOpen) {
        // Opening: measure content, animate from 0 to measured height
        const scrollHeight = content.scrollHeight;
        setHeight(0);
        setIsAnimating(true);

        // Force reflow
        void content.offsetHeight;

        // Set target height
        requestAnimationFrame(() => {
          setHeight(scrollHeight);
        });

        // After animation, set to auto for responsive content
        const timeout = setTimeout(() => {
          setHeight("auto");
          setIsAnimating(false);
        }, animationDuration);

        return () => clearTimeout(timeout);
      }
      // Closing: animate from current height to 0
      const scrollHeight = content.scrollHeight;
      setHeight(scrollHeight);
      setIsAnimating(true);

      // Force reflow
      void content.offsetHeight;

      // Set to 0
      requestAnimationFrame(() => {
        setHeight(0);
      });

      const timeout = setTimeout(() => {
        setIsAnimating(false);
      }, animationDuration);

      return () => clearTimeout(timeout);
    }, [isOpen, animationDuration]);

    // Combine refs
    const handleRef = useCallback(
      (node: HTMLElement | null) => {
        (contentRef as React.MutableRefObject<HTMLElement | null>).current = node;
        if (typeof ref === "function") {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }
      },
      [ref]
    );

    // Don't render if closed and not force-mounted
    if (!forceMount && !isOpen && height === 0 && !isAnimating) {
      return null;
    }

    return (
      <section
        ref={handleRef}
        id={contentId}
        aria-labelledby={triggerId}
        aria-hidden={!isOpen}
        className={cn("overflow-hidden", className)}
        style={{
          height: typeof height === "number" ? `${height}px` : height,
          transition: isAnimating ? `height ${animationDuration}ms ease-out` : undefined,
          ...style,
        }}
        {...props}
      >
        {children}
      </section>
    );
  }
);

CollapsibleContent.displayName = "CollapsibleContent";

// ============================================
// Accordion (Multiple Collapsibles)
// ============================================

export type AccordionType = "single" | "multiple";

export interface AccordionContextValue {
  type: AccordionType;
  value: string | string[];
  toggle: (itemValue: string) => void;
}

const AccordionContext = createContext<AccordionContextValue | null>(null);

function useAccordionContext() {
  return useContext(AccordionContext);
}

export interface AccordionProps {
  /** Whether only one or multiple items can be open */
  type?: AccordionType;
  /** Controlled value (item key or array of keys) */
  value?: string | string[];
  /** Default value (uncontrolled) */
  defaultValue?: string | string[];
  /** Callback when value changes */
  onValueChange?: (value: string | string[]) => void;
  /** Class name for the container */
  className?: string;
  /** Children (AccordionItem components) */
  children: ReactNode;
}

/**
 * Accordion - Multiple collapsible sections.
 *
 * @example
 * ```tsx
 * <Accordion type="single" defaultValue="item-1">
 *   <AccordionItem value="item-1">
 *     <AccordionTrigger>Section 1</AccordionTrigger>
 *     <AccordionContent>Content 1</AccordionContent>
 *   </AccordionItem>
 *   <AccordionItem value="item-2">
 *     <AccordionTrigger>Section 2</AccordionTrigger>
 *     <AccordionContent>Content 2</AccordionContent>
 *   </AccordionItem>
 * </Accordion>
 * ```
 */
export function Accordion({
  type = "single",
  value: controlledValue,
  defaultValue = type === "single" ? "" : [],
  onValueChange,
  className,
  children,
}: AccordionProps) {
  const [internalValue, setInternalValue] = useState<string | string[]>(defaultValue);

  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : internalValue;

  const toggle = useCallback(
    (itemValue: string) => {
      let newValue: string | string[];

      if (type === "single") {
        // Single mode: toggle off if same, otherwise set new value
        newValue = value === itemValue ? "" : itemValue;
      } else {
        // Multiple mode: add/remove from array
        const valueArray = Array.isArray(value) ? value : [value].filter(Boolean);
        if (valueArray.includes(itemValue)) {
          newValue = valueArray.filter((v) => v !== itemValue);
        } else {
          newValue = [...valueArray, itemValue];
        }
      }

      if (!isControlled) {
        setInternalValue(newValue);
      }
      onValueChange?.(newValue);
    },
    [type, value, isControlled, onValueChange]
  );

  return (
    <AccordionContext.Provider value={{ type, value, toggle }}>
      <div className={cn("divide-y divide-stone-200 dark:divide-stone-700", className)}>
        {children}
      </div>
    </AccordionContext.Provider>
  );
}

// ============================================
// AccordionItem
// ============================================

export interface AccordionItemProps {
  /** Unique value for this item */
  value: string;
  /** Disable the item */
  disabled?: boolean;
  /** Class name */
  className?: string;
  /** Children (AccordionTrigger, AccordionContent) */
  children: ReactNode;
}

/**
 * AccordionItem - Single accordion section.
 */
export function AccordionItem({
  value,
  disabled = false,
  className,
  children,
}: AccordionItemProps) {
  const accordion = useAccordionContext();

  if (!accordion) {
    throw new Error("AccordionItem must be used within an Accordion");
  }

  const isOpen = Array.isArray(accordion.value)
    ? accordion.value.includes(value)
    : accordion.value === value;

  const handleToggle = useCallback(() => {
    if (!disabled) {
      accordion.toggle(value);
    }
  }, [accordion, value, disabled]);

  return (
    <Collapsible open={isOpen} onOpenChange={handleToggle} disabled={disabled}>
      <div className={cn("py-2", className)} data-disabled={disabled || undefined}>
        {children}
      </div>
    </Collapsible>
  );
}

// ============================================
// AccordionTrigger
// ============================================

export interface AccordionTriggerProps extends HTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

/**
 * AccordionTrigger - Trigger for accordion item.
 */
export const AccordionTrigger = forwardRef<HTMLButtonElement, AccordionTriggerProps>(
  ({ children, className, ...props }, ref) => (
    <CollapsibleTrigger
      ref={ref}
      className={cn(
        "py-2 px-0 font-medium text-stone-900 dark:text-stone-100",
        "hover:text-stone-600 dark:hover:text-stone-300",
        className
      )}
      {...props}
    >
      {children}
    </CollapsibleTrigger>
  )
);

AccordionTrigger.displayName = "AccordionTrigger";

// ============================================
// AccordionContent
// ============================================

export interface AccordionContentProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/**
 * AccordionContent - Content for accordion item.
 */
export const AccordionContent = forwardRef<HTMLDivElement, AccordionContentProps>(
  ({ children, className, ...props }, ref) => (
    <CollapsibleContent
      ref={ref}
      className={cn("text-stone-600 dark:text-stone-400", className)}
      {...props}
    >
      <div className="pb-4 pt-1">{children}</div>
    </CollapsibleContent>
  )
);

AccordionContent.displayName = "AccordionContent";

// ============================================
// Exports
// ============================================

export default Collapsible;
