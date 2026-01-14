"use client";

/**
 * ConnectionLine - SVG path component for phase connections
 *
 * Animated SVG lines showing data flow between phases with optional labels.
 *
 * @see docs/plans/43-agent-network-visualization.md
 */

import { motion } from "framer-motion";

// ============================================
// Animation Variants
// ============================================

const pathVariants = {
  hidden: { pathLength: 0, opacity: 0 },
  visible: {
    pathLength: 1,
    opacity: 1,
    transition: { duration: 0.5, ease: "easeOut" as const },
  },
};

const flowVariants = {
  idle: { strokeDashoffset: 0 },
  active: {
    strokeDashoffset: -24,
    transition: {
      duration: 1,
      ease: "linear" as const,
      repeat: Number.POSITIVE_INFINITY,
    },
  },
};

// ============================================
// Types
// ============================================

export interface ConnectionLineProps {
  /** Start position (x, y) */
  start: { x: number; y: number };
  /** End position (x, y) */
  end: { x: number; y: number };
  /** Whether the connection is currently active (data flowing) */
  isActive?: boolean;
  /** Whether the connection has been completed */
  isComplete?: boolean;
  /** Optional color override */
  color?: string;
  /** Line style */
  variant?: "solid" | "dashed";
  /** Stroke width */
  strokeWidth?: number;
}

// ============================================
// Component
// ============================================

export function ConnectionLine({
  start,
  end,
  isActive = false,
  isComplete = false,
  color,
  variant = "dashed",
  strokeWidth = 2,
}: ConnectionLineProps) {
  // Determine color based on state
  const strokeColor = color
    ? color
    : isActive
      ? "var(--color-active, #F5A623)"
      : isComplete
        ? "var(--color-success, #10B981)"
        : "var(--color-stone-300, #D1D5DB)";

  // Calculate path for vertical line with small curve
  const midY = (start.y + end.y) / 2;
  const pathD = `M ${start.x} ${start.y} C ${start.x} ${midY}, ${end.x} ${midY}, ${end.x} ${end.y}`;

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
      style={{ zIndex: 0 }}
      aria-hidden="true"
    >
      <defs>
        <marker
          id="arrowhead-default"
          markerWidth="8"
          markerHeight="6"
          refX="8"
          refY="3"
          orient="auto"
        >
          <polygon
            points="0 0, 8 3, 0 6"
            fill="currentColor"
            className="text-stone-300 dark:text-night-600"
          />
        </marker>
        <marker
          id="arrowhead-active"
          markerWidth="8"
          markerHeight="6"
          refX="8"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 8 3, 0 6" fill="var(--color-active, #F5A623)" />
        </marker>
        <marker
          id="arrowhead-complete"
          markerWidth="8"
          markerHeight="6"
          refX="8"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 8 3, 0 6" fill="var(--color-success, #10B981)" />
        </marker>
      </defs>

      {/* Background line (for dashed variant) */}
      {variant === "dashed" && !isActive && (
        <path
          d={pathD}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray="6 3"
          strokeLinecap="round"
          markerEnd={isComplete ? "url(#arrowhead-complete)" : "url(#arrowhead-default)"}
        />
      )}

      {/* Animated line */}
      <motion.path
        d={pathD}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={isActive ? "8 4" : variant === "solid" ? "none" : "6 3"}
        variants={isActive ? flowVariants : pathVariants}
        initial={isActive ? "idle" : "hidden"}
        animate={isActive ? "active" : "visible"}
        markerEnd={
          isActive
            ? "url(#arrowhead-active)"
            : isComplete
              ? "url(#arrowhead-complete)"
              : "url(#arrowhead-default)"
        }
      />
    </svg>
  );
}

export default ConnectionLine;
