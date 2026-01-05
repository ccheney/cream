/**
 * useRelativeTime Hook
 *
 * Provides live-updating relative timestamps ("2s ago", "5m ago", etc.)
 * Updates every second for recent timestamps, less frequently for older ones.
 *
 * @see docs/plans/ui/31-realtime-patterns.md line 54
 */

import { useEffect, useState } from "react";

// ============================================
// Types
// ============================================

export interface UseRelativeTimeOptions {
  /** Update interval in ms for recent timestamps (< 60s) */
  recentIntervalMs?: number;
  /** Update interval in ms for older timestamps */
  olderIntervalMs?: number;
  /** Threshold in seconds for "recent" timestamps */
  recentThresholdSec?: number;
}

export interface RelativeTimeResult {
  /** Formatted relative time string */
  formatted: string;
  /** Seconds since the timestamp */
  secondsAgo: number;
  /** Whether timestamp is considered "recent" */
  isRecent: boolean;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Format seconds into a relative time string.
 */
function formatRelativeTime(seconds: number): string {
  if (seconds < 0) {
    return "just now";
  }
  if (seconds < 5) {
    return "just now";
  }
  if (seconds < 60) {
    return `${Math.floor(seconds)}s ago`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Calculate seconds since a given timestamp.
 */
function getSecondsAgo(timestamp: Date | number): number {
  const now = Date.now();
  const then = typeof timestamp === "number" ? timestamp : timestamp.getTime();
  return Math.floor((now - then) / 1000);
}

// ============================================
// Hook Implementation
// ============================================

/**
 * Hook for a single relative timestamp.
 */
export function useRelativeTime(
  timestamp: Date | number | undefined,
  options: UseRelativeTimeOptions = {}
): RelativeTimeResult {
  const { recentIntervalMs = 1000, olderIntervalMs = 30000, recentThresholdSec = 60 } = options;

  const [result, setResult] = useState<RelativeTimeResult>(() => {
    if (!timestamp) {
      return { formatted: "", secondsAgo: 0, isRecent: false };
    }
    const seconds = getSecondsAgo(timestamp);
    return {
      formatted: formatRelativeTime(seconds),
      secondsAgo: seconds,
      isRecent: seconds < recentThresholdSec,
    };
  });

  useEffect(() => {
    if (!timestamp) {
      return;
    }

    const updateTime = () => {
      const seconds = getSecondsAgo(timestamp);
      setResult({
        formatted: formatRelativeTime(seconds),
        secondsAgo: seconds,
        isRecent: seconds < recentThresholdSec,
      });
    };

    // Initial update
    updateTime();

    // Determine update interval based on how recent the timestamp is
    const seconds = getSecondsAgo(timestamp);
    const intervalMs = seconds < recentThresholdSec ? recentIntervalMs : olderIntervalMs;

    const interval = setInterval(updateTime, intervalMs);

    return () => clearInterval(interval);
  }, [timestamp, recentIntervalMs, olderIntervalMs, recentThresholdSec]);

  return result;
}

/**
 * Hook for multiple relative timestamps (batch updates for performance).
 */
export function useRelativeTimeBatch(
  timestamps: Array<Date | number>,
  options: UseRelativeTimeOptions = {}
): RelativeTimeResult[] {
  const { recentIntervalMs = 1000, olderIntervalMs = 30000, recentThresholdSec = 60 } = options;

  const [results, setResults] = useState<RelativeTimeResult[]>(() =>
    timestamps.map((ts) => {
      const seconds = getSecondsAgo(ts);
      return {
        formatted: formatRelativeTime(seconds),
        secondsAgo: seconds,
        isRecent: seconds < recentThresholdSec,
      };
    })
  );

  useEffect(() => {
    const updateTimes = () => {
      setResults(
        timestamps.map((ts) => {
          const seconds = getSecondsAgo(ts);
          return {
            formatted: formatRelativeTime(seconds),
            secondsAgo: seconds,
            isRecent: seconds < recentThresholdSec,
          };
        })
      );
    };

    // Initial update
    updateTimes();

    // Use the shortest interval (recent) for batch updates
    const interval = setInterval(updateTimes, recentIntervalMs);

    return () => clearInterval(interval);
  }, [timestamps, recentIntervalMs, recentThresholdSec]);

  return results;
}

// ============================================
// Utility Export
// ============================================

export { formatRelativeTime, getSecondsAgo };
export default useRelativeTime;
