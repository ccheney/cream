/**
 * useAsyncButton Hook
 *
 * Hook for managing async button state transitions.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ERROR_STATE_DURATION, SUCCESS_STATE_DURATION } from "./animations";
import type { ButtonState, UseAsyncButtonOptions, UseAsyncButtonReturn } from "./types";

/**
 * Hook for managing async button state.
 *
 * @example
 * ```tsx
 * const { state, execute, reset } = useAsyncButton(async () => {
 *   await saveData();
 * });
 *
 * <SuccessButton state={state} onClick={execute} onStateReset={reset}>
 *   Save
 * </SuccessButton>
 * ```
 */
export function useAsyncButton<T>(
	asyncFn: () => Promise<T>,
	options: UseAsyncButtonOptions<T> = {}
): UseAsyncButtonReturn {
	const [state, setState] = useState<ButtonState>("idle");
	const [error, setError] = useState<Error | null>(null);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const {
		successDuration = SUCCESS_STATE_DURATION,
		errorDuration = ERROR_STATE_DURATION,
		onSuccess,
		onError,
	} = options;

	const reset = useCallback(() => {
		setState("idle");
		setError(null);
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current);
		}
	}, []);

	const execute = useCallback(async () => {
		if (state === "loading") {
			return;
		}

		setState("loading");
		setError(null);

		try {
			const result = await asyncFn();
			setState("success");

			timeoutRef.current = setTimeout(() => {
				setState("idle");
				onSuccess?.(result);
			}, successDuration);
		} catch (e) {
			const err = e instanceof Error ? e : new Error(String(e));
			setError(err);
			setState("error");

			timeoutRef.current = setTimeout(() => {
				setState("idle");
				onError?.(err);
			}, errorDuration);
		}
	}, [asyncFn, state, successDuration, errorDuration, onSuccess, onError]);

	useEffect(() => {
		return () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}
		};
	}, []);

	return {
		state,
		execute,
		reset,
		isLoading: state === "loading",
		isSuccess: state === "success",
		isError: state === "error",
		error,
	};
}
