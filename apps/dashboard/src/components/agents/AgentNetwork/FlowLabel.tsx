"use client";

/**
 * FlowLabel - Connection label showing data type being transferred
 *
 * Small label positioned on connections showing what data flows between phases.
 *
 * @see docs/plans/43-agent-network-visualization.md
 */

import { motion } from "framer-motion";

// ============================================
// Animation Variants
// ============================================

const labelVariants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.2, ease: "easeOut" as const },
  },
  active: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.3,
      ease: "easeOut" as const,
    },
  },
};

// ============================================
// Types
// ============================================

export interface FlowLabelProps {
  /** Label text */
  label: string;
  /** Whether the data flow is currently active */
  isActive?: boolean;
  /** Position override (centered by default) */
  position?: "center" | "top" | "bottom";
  /** Compact mode for small spaces */
  compact?: boolean;
}

// ============================================
// Component
// ============================================

export function FlowLabel({
  label,
  isActive = false,
  position = "center",
  compact = false,
}: FlowLabelProps) {
  const positionClasses = {
    center: "",
    top: "-mt-4",
    bottom: "mt-4",
  };

  return (
    <motion.span
      variants={labelVariants}
      initial="hidden"
      animate={isActive ? "active" : "visible"}
      className={`
        inline-flex items-center justify-center
        px-2 py-0.5 rounded
        font-mono whitespace-nowrap
        ${compact ? "text-[9px]" : "text-[10px]"}
        ${
          isActive
            ? "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 ring-1 ring-amber-200 dark:ring-amber-800"
            : "text-stone-500 dark:text-stone-400 bg-stone-100 dark:bg-night-700"
        }
        ${positionClasses[position]}
        transition-colors duration-200
      `}
      aria-label={`Data flow: ${label}`}
    >
      {isActive && (
        <span className="relative flex h-1.5 w-1.5 mr-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500" />
        </span>
      )}
      {label}
    </motion.span>
  );
}

export default FlowLabel;
