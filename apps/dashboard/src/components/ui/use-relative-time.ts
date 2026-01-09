/**
 * useRelativeTime Hook
 *
 * Provides live-updating relative timestamps ("2s ago", "5m ago", etc.)
 * Updates every second for recent timestamps, less frequently for older ones.
 *
 * @see docs/plans/ui/31-realtime-patterns.md line 54
 */

import { useEffect, useState } from "react";

export interface UseRelativeTimeOptions {
  recentIntervalMs?: number;
  olderIntervalMs?: number;
  recentThresholdSec?: number;
}

export interface RelativeTimeResult {
  formatted: string;
  secondsAgo: number;
  isRecent: boolean;
}

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

function getSecondsAgo(timestamp: Date | number): number {
  const now = Date.now();
  const then = typeof timestamp === "number" ? timestamp : timestamp.getTime();
  return Math.floor((now - then) / 1000);
}

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

    updateTime();

    const seconds = getSecondsAgo(timestamp);
    const intervalMs = seconds < recentThresholdSec ? recentIntervalMs : olderIntervalMs;

    const interval = setInterval(updateTime, intervalMs);

    return () => clearInterval(interval);
  }, [timestamp, recentIntervalMs, olderIntervalMs, recentThresholdSec]);

  return result;
}

export function useRelativeTimeBatch(
  timestamps: Array<Date | number>,
  options: UseRelativeTimeOptions = {}
): RelativeTimeResult[] {
  const {
    recentIntervalMs = 1000,
    olderIntervalMs: _olderIntervalMs = 30000,
    recentThresholdSec = 60,
  } = options;
  void _olderIntervalMs; // Reserved for future use with adaptive intervals

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

    updateTimes();

    // Batch updates use shortest interval since any timestamp could be recent
    const interval = setInterval(updateTimes, recentIntervalMs);

    return () => clearInterval(interval);
  }, [timestamps, recentIntervalMs, recentThresholdSec]);

  return results;
}

export { formatRelativeTime, getSecondsAgo };
export default useRelativeTime;
