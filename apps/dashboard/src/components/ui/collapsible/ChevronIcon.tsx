"use client";

import { cn } from "./types.js";

interface ChevronIconProps {
  open: boolean;
  className?: string;
}

export function ChevronIcon({ open, className }: ChevronIconProps) {
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
