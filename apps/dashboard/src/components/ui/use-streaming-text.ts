/**
 * @see docs/plans/ui/31-realtime-patterns.md lines 69-87
 */

import {
	type Dispatch,
	type SetStateAction,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

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
// Internal streaming helpers
// ============================================

interface StreamingSink {
	setStatus: (status: StreamingStatus) => void;
	setError: (error: string | null) => void;
	appendChunk: (chunk: string) => void;
	flushPendingText: () => void;
}

function truncate(text: string, maxLength: number): string {
	return text.length > maxLength ? text.slice(-maxLength) : text;
}

function createDebounceController(flush: () => void, debounceMs: number) {
	let timer: ReturnType<typeof setTimeout> | null = null;

	const schedule = () => {
		if (timer) {
			return;
		}

		timer = setTimeout(() => {
			flush();
			timer = null;
		}, debounceMs);
	};

	const clear = () => {
		if (!timer) {
			return;
		}

		clearTimeout(timer);
		timer = null;
	};

	return { schedule, clear };
}

function createStreamingEventSource(url: string, debounceMs: number, sink: StreamingSink) {
	let eventSource: EventSource | null = null;
	const { clear, schedule } = createDebounceController(sink.flushPendingText, debounceMs);

	const closeSource = () => {
		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}
	};

	const stop = () => {
		clear();
		closeSource();
		sink.flushPendingText();
	};

	const onComplete = () => {
		sink.flushPendingText();
		sink.setStatus("complete");
		stop();
	};

	const onErrorMessage = (event: MessageEvent) => {
		sink.flushPendingText();
		sink.setError((event.data as string) || "Stream error");
		sink.setStatus("error");
		stop();
	};

	const onError = (source: EventSource) => () => {
		sink.flushPendingText();
		if (source.readyState === EventSource.CLOSED) {
			sink.setStatus("complete");
		} else {
			sink.setError("Connection error");
			sink.setStatus("error");
		}
		stop();
	};

	const start = () => {
		if (eventSource) {
			return;
		}

		eventSource = new EventSource(url);
		sink.setStatus("processing");
		sink.setError(null);
		eventSource.onopen = () => {
			sink.setStatus("processing");
		};
		eventSource.onmessage = (event) => {
			sink.appendChunk(event.data);
			schedule();
		};
		eventSource.addEventListener("complete", () => {
			onComplete();
		});
		eventSource.addEventListener("error-message", onErrorMessage);
		eventSource.onerror = onError(eventSource);
	};

	return { start, stop };
}

function useStreamingPendingText(maxLength: number, setText: Dispatch<SetStateAction<string>>) {
	const pendingTextRef = useRef("");

	const appendChunk = useCallback(
		(chunk: string) => {
			pendingTextRef.current = truncate(`${pendingTextRef.current}${chunk}`, maxLength);
		},
		[maxLength],
	);

	const flush = useCallback(() => {
		if (!pendingTextRef.current) {
			return;
		}

		setText((value) => {
			const nextText = `${value}${pendingTextRef.current}`;
			pendingTextRef.current = "";
			return truncate(nextText, maxLength);
		});
	}, [maxLength, setText]);

	const reset = useCallback(() => {
		pendingTextRef.current = "";
	}, []);

	return { appendChunk, flush, reset };
}

function useStreamingController(url: string | null, debounceMs: number, sink: StreamingSink) {
	const sinkMemoized = useMemo(
		() => ({
			setStatus: sink.setStatus,
			setError: sink.setError,
			appendChunk: sink.appendChunk,
			flushPendingText: sink.flushPendingText,
		}),
		[sink.setStatus, sink.setError, sink.appendChunk, sink.flushPendingText],
	);

	return useMemo(
		() => (url ? createStreamingEventSource(url, debounceMs, sinkMemoized) : null),
		[url, debounceMs, sinkMemoized],
	);
}

function useAutoStartStreaming(
	autoConnect: boolean,
	url: string | null,
	controller: ReturnType<typeof createStreamingEventSource> | null,
	start: () => void,
	stop: () => void,
) {
	useEffect(() => {
		if (autoConnect && url && controller) {
			start();
		}

		return () => {
			stop();
		};
	}, [autoConnect, controller, start, stop, url]);
}

// ============================================
// Hook Implementation
// ============================================

export function useStreamingText(
	url: string | null,
	options: UseStreamingTextOptions = {},
): UseStreamingTextReturn {
	const { autoConnect = false, debounceMs = 50, maxLength = 50000 } = options;

	const [text, setText] = useState("");
	const [status, setStatus] = useState<StreamingStatus>("idle");
	const [error, setError] = useState<string | null>(null);
	const {
		appendChunk,
		flush,
		reset: resetPendingText,
	} = useStreamingPendingText(maxLength, setText);

	const controller = useStreamingController(url, debounceMs, {
		setStatus,
		setError,
		appendChunk,
		flushPendingText: flush,
	});

	const stop = useCallback(() => {
		controller?.stop();
		if (status === "processing") {
			setStatus("idle");
		}
	}, [controller, status]);

	const start = useCallback(() => {
		if (url && controller) {
			controller.start();
		}
	}, [controller, url]);

	useAutoStartStreaming(autoConnect, url, controller, start, stop);

	const reset = useCallback(() => {
		stop();
		setText("");
		setStatus("idle");
		setError(null);
		resetPendingText();
	}, [resetPendingText, stop]);

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

	const append = useCallback(
		(chunk: string) => {
			setText((prev) => prev + chunk);
			if (status === "idle") {
				setStatus("processing");
			}
		},
		[status],
	);

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
