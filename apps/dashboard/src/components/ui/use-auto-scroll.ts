/**
 * useAutoScroll Hook
 *
 * Manages auto-scroll behavior for real-time feeds.
 * Auto-scrolls to bottom when new items arrive (if already at bottom),
 * pauses when user scrolls up, and resumes when user scrolls back to bottom.
 *
 * @see docs/plans/ui/31-realtime-patterns.md lines 50-52
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseAutoScrollOptions {
	/** Threshold in pixels to consider "at bottom" */
	threshold?: number;
	/** Debounce time in ms for scroll position checks */
	debounceMs?: number;
}

export interface UseAutoScrollReturn {
	/** Reference to attach to the scrollable container */
	containerRef: React.RefObject<HTMLDivElement | null>;
	/** Whether auto-scroll is currently active */
	isAutoScrolling: boolean;
	/** Whether user is at the bottom of the feed */
	isAtBottom: boolean;
	/** New items since user scrolled away */
	newItemCount: number;
	/** Scroll to bottom and resume auto-scroll */
	scrollToBottom: () => void;
	/** Notify that new items have arrived */
	onNewItems: (count?: number) => void;
	/** Handle scroll events (attach to onScroll) */
	onScroll: () => void;
}

function isAtBottom(container: HTMLDivElement | null, threshold: number): boolean {
	if (!container) {
		return true;
	}

	const { scrollTop, scrollHeight, clientHeight } = container;
	const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
	return distanceFromBottom <= threshold;
}

interface ScrollPositionTrackerResult {
	onScroll: () => void;
	isProgrammaticScrollRef: React.MutableRefObject<boolean>;
}

function useScrollPositionTracker(
	containerRef: React.RefObject<HTMLDivElement | null>,
	threshold: number,
	debounceMs: number,
	onPositionChange: (atBottom: boolean) => void,
): ScrollPositionTrackerResult {
	const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const isProgrammaticScrollRef = useRef(false);

	const onScroll = useCallback(() => {
		if (debounceTimerRef.current) {
			clearTimeout(debounceTimerRef.current);
		}

		isProgrammaticScrollRef.current = true;
		debounceTimerRef.current = setTimeout(() => {
			isProgrammaticScrollRef.current = false;
			onPositionChange(isAtBottom(containerRef.current, threshold));
		}, debounceMs);
	}, [containerRef, threshold, debounceMs, onPositionChange]);

	useEffect(() => {
		return () => {
			if (debounceTimerRef.current) {
				clearTimeout(debounceTimerRef.current);
			}
		};
	}, []);

	return { onScroll, isProgrammaticScrollRef };
}

function useAutoScrollStateHandlers(
	containerRef: React.RefObject<HTMLDivElement | null>,
	threshold: number,
	debounceMs: number,
	isAutoScrolling: boolean,
	setIsAutoScrolling: (isAutoScrolling: boolean) => void,
	setIsAtBottomState: (isAtBottom: boolean) => void,
	setNewItemCount: (updater: number | ((prevState: number) => number)) => void,
) {
	const handlePositionChange = useCallback(
		(atBottom: boolean) => {
			setIsAtBottomState(atBottom);
			if (atBottom) {
				setIsAutoScrolling(true);
				setNewItemCount(0);
			} else {
				setIsAutoScrolling(false);
			}
		},
		[setIsAutoScrolling, setIsAtBottomState, setNewItemCount],
	);

	const { onScroll, isProgrammaticScrollRef } = useScrollPositionTracker(
		containerRef,
		threshold,
		debounceMs,
		handlePositionChange,
	);

	const scrollToBottom = useCallback(() => {
		const container = containerRef.current;
		if (!container) {
			return;
		}

		container.scrollTo({
			top: container.scrollHeight,
			behavior: "smooth",
		});

		setIsAutoScrolling(true);
		setIsAtBottomState(true);
		setNewItemCount(0);
	}, [containerRef, setIsAutoScrolling, setIsAtBottomState, setNewItemCount]);

	const onNewItems = useCallback(
		(count = 1) => {
			if (isAutoScrolling && !isProgrammaticScrollRef.current) {
				requestAnimationFrame(() => {
					scrollToBottom();
				});
			} else {
				setNewItemCount((prev) => prev + count);
			}
		},
		[isAutoScrolling, isProgrammaticScrollRef, scrollToBottom, setNewItemCount],
	);

	return { onScroll, onNewItems, scrollToBottom };
}

export function useAutoScroll(options: UseAutoScrollOptions = {}): UseAutoScrollReturn {
	const { threshold = 50, debounceMs = 100 } = options;

	const containerRef = useRef<HTMLDivElement | null>(null);
	const [isAutoScrolling, setIsAutoScrolling] = useState(true);
	const [isAtBottomState, setIsAtBottomState] = useState(true);
	const [newItemCount, setNewItemCount] = useState(0);

	const { onScroll, onNewItems, scrollToBottom } = useAutoScrollStateHandlers(
		containerRef,
		threshold,
		debounceMs,
		isAutoScrolling,
		setIsAutoScrolling,
		setIsAtBottomState,
		setNewItemCount,
	);

	return {
		containerRef,
		isAutoScrolling,
		isAtBottom: isAtBottomState,
		newItemCount,
		scrollToBottom,
		onNewItems,
		onScroll,
	};
}

export default useAutoScroll;
