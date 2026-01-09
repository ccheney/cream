/**
 * Countdown Timer Component
 *
 * Displays countdown to next OODA cycle with smooth updates and warning states.
 *
 * @see docs/plans/ui/03-views.md Control Panel
 */

"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";

export type CountdownFormat = "mm:ss" | "hh:mm:ss" | "auto";

export interface CountdownProps {
  /** Target time to count down to */
  targetTime: Date;
  /** Callback when countdown reaches zero */
  onComplete?: () => void;
  /** Display format (default: auto) */
  format?: CountdownFormat;
  /** Warning threshold in seconds (default: 300 = 5 min) */
  warningThreshold?: number;
  /** Critical threshold in seconds (default: 60 = 1 min) */
  criticalThreshold?: number;
  /** Show "(in Xm)" suffix format (default: false) */
  showSuffix?: boolean;
  /** CSS class name for styling */
  className?: string;
  /** ARIA label for accessibility */
  "aria-label"?: string;
  "data-testid"?: string;
}

export interface CountdownState {
  totalSeconds: number;
  hours: number;
  minutes: number;
  seconds: number;
  isComplete: boolean;
  isWarning: boolean;
  isCritical: boolean;
}

const DEFAULT_WARNING_THRESHOLD = 300;
const DEFAULT_CRITICAL_THRESHOLD = 60;
const UPDATE_INTERVAL = 1000;

function calculateCountdownState(
  targetTime: Date,
  warningThreshold: number,
  criticalThreshold: number
): CountdownState {
  const now = Date.now();
  const target = targetTime.getTime();
  const diff = Math.max(0, target - now);
  const totalSeconds = Math.floor(diff / 1000);

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    totalSeconds,
    hours,
    minutes,
    seconds,
    isComplete: totalSeconds === 0,
    isWarning: totalSeconds <= warningThreshold && totalSeconds > criticalThreshold,
    isCritical: totalSeconds <= criticalThreshold && totalSeconds > 0,
  };
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function formatCountdown(state: CountdownState, format: CountdownFormat): string {
  const { hours, minutes, seconds } = state;

  if (format === "auto") {
    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  }

  if (format === "hh:mm:ss") {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }

  const totalMinutes = Math.min(99, hours * 60 + minutes);
  return `${pad(totalMinutes)}:${pad(seconds)}`;
}

function formatWithSuffix(state: CountdownState): string {
  const { totalSeconds, hours, minutes } = state;

  if (totalSeconds === 0) {
    return "now";
  }

  if (hours > 0) {
    const totalMins = hours * 60 + minutes;
    return `(in ${totalMins}m)`;
  }

  if (minutes > 0) {
    return `(in ${minutes}m)`;
  }

  return `(in ${totalSeconds}s)`;
}

function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  return prefersReducedMotion;
}

export function useCountdown(
  targetTime: Date,
  options: {
    onComplete?: () => void;
    warningThreshold?: number;
    criticalThreshold?: number;
  } = {}
): CountdownState {
  const {
    onComplete,
    warningThreshold = DEFAULT_WARNING_THRESHOLD,
    criticalThreshold = DEFAULT_CRITICAL_THRESHOLD,
  } = options;

  const [state, setState] = useState<CountdownState>(() =>
    calculateCountdownState(targetTime, warningThreshold, criticalThreshold)
  );

  const onCompleteRef = useRef(onComplete);
  const hasCompletedRef = useRef(false);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const _targetTimeMs = targetTime.getTime();
  useEffect(() => {
    hasCompletedRef.current = false;
  }, []);

  useEffect(() => {
    const tick = () => {
      const newState = calculateCountdownState(targetTime, warningThreshold, criticalThreshold);
      setState(newState);

      if (newState.isComplete && !hasCompletedRef.current) {
        hasCompletedRef.current = true;
        onCompleteRef.current?.();
      }
    };

    tick();
    const intervalId = setInterval(tick, UPDATE_INTERVAL);

    return () => clearInterval(intervalId);
  }, [targetTime, warningThreshold, criticalThreshold]);

  return state;
}

export const Countdown = memo(function Countdown({
  targetTime,
  onComplete,
  format = "auto",
  warningThreshold = DEFAULT_WARNING_THRESHOLD,
  criticalThreshold = DEFAULT_CRITICAL_THRESHOLD,
  showSuffix = false,
  className = "",
  "aria-label": ariaLabel,
  "data-testid": testId,
}: CountdownProps) {
  const prefersReducedMotion = usePrefersReducedMotion();

  const state = useCountdown(targetTime, {
    onComplete,
    warningThreshold,
    criticalThreshold,
  });

  const displayText = useMemo(() => {
    if (showSuffix) {
      return formatWithSuffix(state);
    }
    return formatCountdown(state, format);
  }, [state, format, showSuffix]);

  const stateClasses = useMemo(() => {
    if (state.isComplete) {
      return "text-emerald-600 dark:text-emerald-400";
    }
    if (state.isCritical) {
      return "text-red-600 dark:text-red-400";
    }
    if (state.isWarning) {
      return "text-amber-600 dark:text-amber-400";
    }
    return "text-stone-700 dark:text-stone-300";
  }, [state.isComplete, state.isCritical, state.isWarning]);

  const animationClasses = useMemo(() => {
    if (state.isCritical && !prefersReducedMotion) {
      return "animate-pulse";
    }
    return "";
  }, [state.isCritical, prefersReducedMotion]);

  const computedAriaLabel = useMemo(() => {
    if (ariaLabel) {
      return ariaLabel;
    }

    const { hours, minutes, seconds } = state;
    if (state.isComplete) {
      return "Countdown complete";
    }

    const parts: string[] = [];
    if (hours > 0) {
      parts.push(`${hours} hour${hours !== 1 ? "s" : ""}`);
    }
    if (minutes > 0) {
      parts.push(`${minutes} minute${minutes !== 1 ? "s" : ""}`);
    }
    if (seconds > 0 || parts.length === 0) {
      parts.push(`${seconds} second${seconds !== 1 ? "s" : ""}`);
    }

    return `${parts.join(", ")} remaining`;
  }, [ariaLabel, state]);

  return (
    <span role="timer" aria-label={computedAriaLabel} aria-live="polite" aria-atomic="true">
      <time
        dateTime={targetTime.toISOString()}
        className={`tabular-nums font-mono ${stateClasses} ${animationClasses} ${className}`}
        data-testid={testId}
        data-warning={state.isWarning || undefined}
        data-critical={state.isCritical || undefined}
        data-complete={state.isComplete || undefined}
      >
        {displayText}
      </time>
    </span>
  );
});

export default Countdown;
