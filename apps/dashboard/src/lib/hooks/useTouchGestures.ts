/**
 * useTouchGestures Hook
 *
 * Touch gesture support for mobile interactions including swipe, long-press, and
 * pull-to-refresh.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SwipeDirection = "left" | "right" | "up" | "down";

export interface TouchGestureHandlers {
	onSwipe?: (direction: SwipeDirection, distance: number) => void;
	onLongPress?: () => void;
	onPullRefresh?: () => void | Promise<void>;
}

export interface TouchGestureOptions {
	swipeThreshold?: number;
	longPressDelay?: number;
	pullThreshold?: number;
	enabled?: boolean;
}

export interface TouchGestureState {
	isTouching: boolean;
	isLongPressing: boolean;
	isPulling: boolean;
	pullDistance: number;
	isRefreshing: boolean;
}

export interface UseTouchGesturesReturn<T extends HTMLElement> {
	ref: React.RefObject<T | null>;
	state: TouchGestureState;
	reset: () => void;
}

const DEFAULT_SWIPE_THRESHOLD = 50;
const DEFAULT_LONG_PRESS_DELAY = 500;
const DEFAULT_PULL_THRESHOLD = 80;

type TouchOrigin = { x: number; y: number; time: number };

function deriveSwipeDirection(
	deltaX: number,
	deltaY: number,
	absX: number,
	absY: number,
): SwipeDirection {
	if (absX > absY) {
		return deltaX > 0 ? "right" : "left";
	}
	return deltaY > 0 ? "down" : "up";
}

function clampPullDistance(deltaY: number, maxDelta: number): number {
	return Math.min(deltaY, maxDelta);
}

function useLongPressTimer({
	longPressDelay,
	onLongPress,
	updateState,
}: {
	longPressDelay: number;
	onLongPress: TouchGestureHandlers["onLongPress"];
	updateState: (next: Partial<TouchGestureState>) => void;
}) {
	const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const onLongPressRef = useRef(onLongPress);

	useEffect(() => {
		onLongPressRef.current = onLongPress;
	}, [onLongPress]);

	const clearLongPressTimer = useCallback(() => {
		if (longPressTimerRef.current) {
			clearTimeout(longPressTimerRef.current);
			longPressTimerRef.current = null;
		}
	}, []);

	const startLongPress = useCallback(() => {
		if (!onLongPressRef.current) {
			return;
		}

		longPressTimerRef.current = setTimeout(() => {
			updateState({ isLongPressing: true });
			onLongPressRef.current?.();
		}, longPressDelay);
	}, [longPressDelay, updateState]);

	return {
		clearLongPressTimer,
		startLongPress,
	};
}

function useTouchStart(
	touchStartRef: React.RefObject<TouchOrigin | null>,
	updateState: (next: Partial<TouchGestureState>) => void,
	startLongPress: () => void,
) {
	return useCallback(
		(event: TouchEvent) => {
			const touch = event.touches[0];
			if (!touch) {
				return;
			}

			touchStartRef.current = {
				x: touch.clientX,
				y: touch.clientY,
				time: Date.now(),
			};
			updateState({ isTouching: true, isLongPressing: false });
			startLongPress();
		},
		[startLongPress, touchStartRef, updateState],
	);
}

function useTouchMove({
	ref,
	handlers,
	pullThreshold,
	touchStartRef,
	clearLongPressTimer,
	updateState,
}: {
	ref: React.RefObject<HTMLElement | null>;
	handlers: TouchGestureHandlers;
	pullThreshold: number;
	touchStartRef: React.RefObject<TouchOrigin | null>;
	clearLongPressTimer: () => void;
	updateState: (next: Partial<TouchGestureState>) => void;
}) {
	return useCallback(
		(event: TouchEvent) => {
			const element = ref.current;
			const touch = event.touches[0];
			if (!element || !touchStartRef.current || !touch) {
				return;
			}

			const deltaX = touch.clientX - touchStartRef.current.x;
			const deltaY = touch.clientY - touchStartRef.current.y;

			if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
				clearLongPressTimer();
			}

			if (!handlers.onPullRefresh || deltaY <= 0 || (element.scrollTop ?? 0) !== 0) {
				return;
			}

			event.preventDefault();
			updateState({
				isPulling: true,
				pullDistance: clampPullDistance(deltaY, pullThreshold * 1.5),
			});
		},
		[clearLongPressTimer, handlers.onPullRefresh, pullThreshold, ref, touchStartRef, updateState],
	);
}

function useTouchEnd({
	touchStartRef,
	stateRef,
	handlers,
	swipeThreshold,
	pullThreshold,
	clearLongPressTimer,
	updateState,
	resetTouch,
}: {
	touchStartRef: React.RefObject<TouchOrigin | null>;
	stateRef: React.RefObject<TouchGestureState>;
	handlers: TouchGestureHandlers;
	swipeThreshold: number;
	pullThreshold: number;
	clearLongPressTimer: () => void;
	updateState: (next: Partial<TouchGestureState>) => void;
	resetTouch: () => void;
}) {
	return useCallback(
		async (event: TouchEvent) => {
			const touch = event.changedTouches[0];
			if (!touchStartRef.current) {
				return;
			}

			if (!touch) {
				resetTouch();
				return;
			}

			clearLongPressTimer();
			const deltaX = touch.clientX - touchStartRef.current.x;
			const deltaY = touch.clientY - touchStartRef.current.y;
			const absX = Math.abs(deltaX);
			const absY = Math.abs(deltaY);

			if (handlers.onSwipe && (absX >= swipeThreshold || absY >= swipeThreshold)) {
				handlers.onSwipe(
					deriveSwipeDirection(deltaX, deltaY, absX, absY),
					absX > absY ? absX : absY,
				);
			}

			if (!stateRef.current.isPulling || deltaY < pullThreshold || !handlers.onPullRefresh) {
				resetTouch();
				return;
			}

			updateState({ isRefreshing: true });
			try {
				await handlers.onPullRefresh();
			} finally {
				resetTouch();
			}
		},
		[
			clearLongPressTimer,
			handlers,
			pullThreshold,
			resetTouch,
			stateRef,
			swipeThreshold,
			touchStartRef,
			updateState,
		],
	);
}

function useTouchState(): {
	state: TouchGestureState;
	stateRef: React.RefObject<TouchGestureState>;
	updateState: (next: Partial<TouchGestureState>) => void;
	reset: () => void;
} {
	const [state, setState] = useState<TouchGestureState>({
		isTouching: false,
		isLongPressing: false,
		isPulling: false,
		pullDistance: 0,
		isRefreshing: false,
	});

	const stateRef = useRef(state);
	useEffect(() => {
		stateRef.current = state;
	});

	const updateState = useCallback((next: Partial<TouchGestureState>) => {
		setState((prev) => ({ ...prev, ...next }));
	}, []);

	const reset = useCallback(() => {
		updateState({
			isTouching: false,
			isLongPressing: false,
			isPulling: false,
			pullDistance: 0,
			isRefreshing: false,
		});
	}, [updateState]);

	return { state, stateRef, updateState, reset };
}

function useTouchCallbacks<T extends HTMLElement>({
	ref,
	handlers,
	swipeThreshold,
	longPressDelay,
	pullThreshold,
	reset,
	updateState,
	stateRef,
}: {
	ref: React.RefObject<T | null>;
	handlers: TouchGestureHandlers;
	swipeThreshold: number;
	longPressDelay: number;
	pullThreshold: number;
	reset: () => void;
	updateState: (next: Partial<TouchGestureState>) => void;
	stateRef: React.RefObject<TouchGestureState>;
}) {
	const touchStartRef = useRef<TouchOrigin | null>(null);
	const { clearLongPressTimer, startLongPress } = useLongPressTimer({
		longPressDelay,
		onLongPress: handlers.onLongPress,
		updateState,
	});

	const resetTouch = useCallback(() => {
		touchStartRef.current = null;
		clearLongPressTimer();
		reset();
	}, [clearLongPressTimer, reset]);

	const onTouchStart = useTouchStart(touchStartRef, updateState, startLongPress);
	const onTouchMove = useTouchMove({
		ref: ref as React.RefObject<HTMLElement>,
		handlers,
		pullThreshold,
		touchStartRef,
		clearLongPressTimer,
		updateState,
	});
	const onTouchEnd = useTouchEnd({
		touchStartRef,
		stateRef,
		handlers,
		swipeThreshold,
		pullThreshold,
		clearLongPressTimer,
		updateState,
		resetTouch,
	});

	const resetWithCleanup = useCallback(() => {
		resetTouch();
	}, [resetTouch]);

	return {
		onTouchStart,
		onTouchMove,
		onTouchEnd,
		reset: resetWithCleanup,
	};
}

export function useTouchGestures<T extends HTMLElement = HTMLDivElement>(
	handlers: TouchGestureHandlers,
	options: TouchGestureOptions = {},
): UseTouchGesturesReturn<T> {
	const {
		swipeThreshold = DEFAULT_SWIPE_THRESHOLD,
		longPressDelay = DEFAULT_LONG_PRESS_DELAY,
		pullThreshold = DEFAULT_PULL_THRESHOLD,
		enabled = true,
	} = options;

	const ref = useRef<T>(null);
	const { state, stateRef, updateState, reset } = useTouchState();
	const callbacks = useTouchCallbacks({
		ref,
		handlers,
		swipeThreshold,
		longPressDelay,
		pullThreshold,
		reset,
		updateState,
		stateRef,
	});

	useEffect(() => {
		if (!enabled) {
			return;
		}

		const element = ref.current;
		if (!element) {
			return;
		}

		const onTouchStart = callbacks.onTouchStart;
		const onTouchMove = (event: Event) => callbacks.onTouchMove(event as TouchEvent);
		const onTouchEnd = (event: Event) => {
			void callbacks.onTouchEnd(event as TouchEvent);
		};
		const onCancel = () => callbacks.reset();

		element.addEventListener("touchstart", onTouchStart, { passive: true });
		element.addEventListener("touchmove", onTouchMove, { passive: false });
		element.addEventListener("touchend", onTouchEnd, { passive: true });
		element.addEventListener("touchcancel", onCancel, { passive: true });

		return () => {
			element.removeEventListener("touchstart", onTouchStart);
			element.removeEventListener("touchmove", onTouchMove);
			element.removeEventListener("touchend", onTouchEnd);
			element.removeEventListener("touchcancel", onCancel);
		};
	}, [enabled, callbacks]);

	return { ref, state, reset };
}

export default useTouchGestures;
