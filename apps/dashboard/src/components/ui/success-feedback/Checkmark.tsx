/**
 * Checkmark Component
 *
 * Animated checkmark using SVG stroke-dashoffset animation.
 */

import type React from "react";
import { CHECKMARK_ANIMATION_DURATION, checkmarkKeyframes } from "./animations.js";
import type { CheckmarkProps } from "./types.js";

/**
 * Animated checkmark component.
 *
 * Uses SVG stroke-dashoffset animation for draw effect.
 *
 * @example
 * ```tsx
 * <Checkmark size={24} animated />
 * <Checkmark size={32} color="#22c55e" duration={500} />
 * ```
 */
export function Checkmark({
  size = 24,
  color = "#22c55e",
  duration = CHECKMARK_ANIMATION_DURATION,
  animated = true,
  testId = "checkmark",
}: CheckmarkProps): React.ReactElement {
  const pathLength = 50;

  const svgStyles: React.CSSProperties = {
    width: size,
    height: size,
  };

  const pathStyles: React.CSSProperties = {
    stroke: color,
    strokeWidth: 3,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    fill: "none",
    strokeDasharray: pathLength,
    strokeDashoffset: animated ? 0 : 0,
    animation: animated
      ? `checkmark-draw ${duration}ms cubic-bezier(0.16, 1, 0.3, 1) forwards`
      : "none",
  };

  return (
    <>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: Safe - hardcoded CSS keyframes */}
      {animated && <style dangerouslySetInnerHTML={{ __html: checkmarkKeyframes }} />}
      <svg
        viewBox="0 0 24 24"
        style={svgStyles}
        className={animated ? "checkmark-animated" : ""}
        data-testid={testId}
        aria-hidden="true"
      >
        <path d="M5 12l5 5L19 7" style={pathStyles} />
      </svg>
    </>
  );
}
