"use client";

import { forwardRef, useCallback, useState } from "react";

import { Collapsible } from "./Collapsible.js";
import { CollapsibleContent } from "./CollapsibleContent.js";
import { CollapsibleTrigger } from "./CollapsibleTrigger.js";
import { AccordionContext, useAccordionContext } from "./context.js";
import {
  type AccordionContentProps,
  type AccordionItemProps,
  type AccordionProps,
  type AccordionTriggerProps,
  cn,
} from "./types.js";

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
        newValue = value === itemValue ? "" : itemValue;
      } else {
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

/**
 * AccordionTrigger - Trigger for accordion item.
 */
export const AccordionTrigger = forwardRef<HTMLButtonElement, AccordionTriggerProps>(
  function AccordionTrigger({ children, className, ...props }, ref) {
    return (
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
    );
  }
);

/**
 * AccordionContent - Content for accordion item.
 */
export const AccordionContent = forwardRef<HTMLDivElement, AccordionContentProps>(
  function AccordionContent({ children, className, ...props }, ref) {
    return (
      <CollapsibleContent
        ref={ref}
        className={cn("text-stone-600 dark:text-stone-400", className)}
        {...props}
      >
        <div className="pb-4 pt-1">{children}</div>
      </CollapsibleContent>
    );
  }
);
