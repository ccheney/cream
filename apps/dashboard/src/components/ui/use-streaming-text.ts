/**
 * useStreamingText Hook
 *
 * Connects to a Server-Sent Events (SSE) endpoint and accumulates
 * streaming text chunks in real-time.
 *
 * @see docs/plans/ui/31-realtime-patterns.md lines 69-87
 */

import { useCallback, useEffect, useRef, useState } from "react";

// ============================================
// Types
// ============================================

export type StreamingStatus = "idle" | "processing" | "complete" | "error";

export interface UseStreamingTextOptions {
  /** Auto-connect on mount */
  autoConnect?: boolean;
  /** Debounce interval for UI updates (ms) */
  debounceMs?: number;
  /** Maximum text length before truncation */
  maxLength?: number;
}

export interface UseStreamingTextReturn {
  /** Accumulated text from stream */
  text: string;
  /** Current streaming status */
  status: StreamingStatus;
  /** Error message if status is 'error' */
  error: string | null;
  /** Start the stream */
  start: () => void;
  /** Stop the stream */
  stop: () => void;
  /** Reset text and status */
  reset: () => void;
}

// ============================================
// Hook Implementation
// ============================================

export function useStreamingText(
  url: string | null,
  options: UseStreamingTextOptions = {}
): UseStreamingTextReturn {
  const { autoConnect = false, debounceMs = 50, maxLength = 50000 } = options;

  const [text, setText] = useState("");
  const [status, setStatus] = useState<StreamingStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  // Refs for cleanup and debouncing
  const eventSourceRef = useRef<EventSource | null>(null);
  const pendingTextRef = useRef("");
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Flush pending text to state.
   */
  const flushText = useCallback(() => {
    if (pendingTextRef.current) {
      setText((prev) => {
        const newText = prev + pendingTextRef.current;
        pendingTextRef.current = "";
        return newText.length > maxLength
          ? newText.slice(-maxLength)
          : newText;
      });
    }
  }, [maxLength]);

  /**
   * Connect to the SSE endpoint.
   */
  const start = useCallback(() => {
    if (!url || eventSourceRef.current) return;

    setStatus("processing");
    setError(null);

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setStatus("processing");
    };

    eventSource.onmessage = (event) => {
      // Accumulate text in pending buffer
      pendingTextRef.current += event.data;

      // Debounce UI updates
      if (!debounceTimerRef.current) {
        debounceTimerRef.current = setTimeout(() => {
          flushText();
          debounceTimerRef.current = null;
        }, debounceMs);
      }
    };

    eventSource.onerror = () => {
      // Flush any pending text
      flushText();

      // Check if this is a normal close or an error
      if (eventSource.readyState === EventSource.CLOSED) {
        setStatus("complete");
      } else {
        setError("Connection error");
        setStatus("error");
      }
      eventSource.close();
      eventSourceRef.current = null;
    };

    // Listen for explicit complete event
    eventSource.addEventListener("complete", () => {
      flushText();
      setStatus("complete");
      eventSource.close();
      eventSourceRef.current = null;
    });

    // Listen for explicit error event with message
    eventSource.addEventListener("error-message", (event) => {
      flushText();
      setError((event as MessageEvent).data || "Stream error");
      setStatus("error");
      eventSource.close();
      eventSourceRef.current = null;
    });
  }, [url, debounceMs, flushText]);

  /**
   * Stop the stream.
   */
  const stop = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    // Flush any remaining text
    flushText();

    if (status === "processing") {
      setStatus("idle");
    }
  }, [flushText, status]);

  /**
   * Reset to initial state.
   */
  const reset = useCallback(() => {
    stop();
    setText("");
    setStatus("idle");
    setError(null);
    pendingTextRef.current = "";
  }, [stop]);

  // Auto-connect on mount if enabled
  useEffect(() => {
    if (autoConnect && url) {
      start();
    }

    return () => {
      stop();
    };
  }, [autoConnect, url, start, stop]);

  return {
    text,
    status,
    error,
    start,
    stop,
    reset,
  };
}

// ============================================
// Manual Text Streaming (for non-SSE sources)
// ============================================

export interface UseManualStreamingReturn {
  /** Accumulated text */
  text: string;
  /** Current status */
  status: StreamingStatus;
  /** Append text chunk */
  append: (chunk: string) => void;
  /** Set status */
  setStatus: (status: StreamingStatus) => void;
  /** Reset */
  reset: () => void;
}

export function useManualStreaming(): UseManualStreamingReturn {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<StreamingStatus>("idle");

  const append = useCallback((chunk: string) => {
    setText((prev) => prev + chunk);
    if (status === "idle") {
      setStatus("processing");
    }
  }, [status]);

  const reset = useCallback(() => {
    setText("");
    setStatus("idle");
  }, []);

  return {
    text,
    status,
    append,
    setStatus,
    reset,
  };
}

export default useStreamingText;
