// biome-ignore-all lint/suspicious/noArrayIndexKey: Pulse animations use stable array indices
"use client";

/**
 * DataFlowPulse - Animated data transfer indicator
 *
 * Animated pulse that moves along connections to show data transfer.
 *
 * @see docs/plans/43-agent-network-visualization.md
 */

import { AnimatePresence, motion } from "framer-motion";

// ============================================
// Types
// ============================================

export interface DataFlowPulseProps {
  /** Whether the pulse should be visible/animating */
  isActive: boolean;
  /** Color of the pulse (defaults to amber) */
  color?: string;
  /** Size of the pulse */
  size?: "sm" | "md" | "lg";
  /** Duration of the animation in seconds */
  duration?: number;
}

// ============================================
// Component
// ============================================

export function DataFlowPulse({
  isActive,
  color = "var(--color-active, #F5A623)",
  size = "md",
  duration = 0.8,
}: DataFlowPulseProps) {
  const sizeConfig = {
    sm: { radius: 3, blur: "2px" },
    md: { radius: 4, blur: "4px" },
    lg: { radius: 6, blur: "6px" },
  };

  const { radius, blur } = sizeConfig[size];

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{
            opacity: [0, 1, 1, 0],
            y: [-10, 0, 40, 50],
          }}
          exit={{ opacity: 0 }}
          transition={{
            duration,
            ease: "easeInOut",
            repeat: Number.POSITIVE_INFINITY,
          }}
          className="absolute left-1/2 -translate-x-1/2"
          style={{
            width: radius * 2,
            height: radius * 2,
          }}
        >
          {/* Outer glow */}
          <div
            className="absolute inset-0 rounded-full animate-pulse"
            style={{
              backgroundColor: color,
              filter: `blur(${blur})`,
              opacity: 0.6,
            }}
          />
          {/* Inner core */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              backgroundColor: color,
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============================================
// Multiple Pulses Component
// ============================================

export interface DataFlowPulsesProps {
  /** Whether pulses should be active */
  isActive: boolean;
  /** Number of pulses to show */
  count?: number;
  /** Color of the pulses */
  color?: string;
  /** Stagger delay between pulses in seconds */
  staggerDelay?: number;
}

export function DataFlowPulses({
  isActive,
  count = 3,
  color = "var(--color-active, #F5A623)",
  staggerDelay = 0.3,
}: DataFlowPulsesProps) {
  return (
    <div className="relative w-full h-full">
      <AnimatePresence>
        {isActive &&
          Array.from({ length: count }).map((_, i) => (
            <motion.div
              key={`pulse-${i}`}
              initial={{ opacity: 0, y: -10 }}
              animate={{
                opacity: [0, 1, 1, 0],
                y: [-10, 0, 40, 50],
              }}
              exit={{ opacity: 0 }}
              transition={{
                duration: 0.8,
                ease: "easeInOut",
                repeat: Number.POSITIVE_INFINITY,
                delay: i * staggerDelay,
              }}
              className="absolute left-1/2 -translate-x-1/2"
              style={{
                width: 8,
                height: 8,
              }}
            >
              <div className="w-full h-full rounded-full" style={{ backgroundColor: color }} />
            </motion.div>
          ))}
      </AnimatePresence>
    </div>
  );
}

export default DataFlowPulse;
