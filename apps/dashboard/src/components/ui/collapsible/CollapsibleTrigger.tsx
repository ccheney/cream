"use client";

import { forwardRef } from "react";

import { ChevronIcon } from "./ChevronIcon.js";
import { useCollapsibleContext } from "./context.js";
import { type CollapsibleTriggerProps, cn } from "./types.js";

/**
 * CollapsibleTrigger - Button to toggle content visibility.
 */
export const CollapsibleTrigger = forwardRef<HTMLButtonElement, CollapsibleTriggerProps>(
  function CollapsibleTrigger({ children, className, ...props }, ref) {
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
