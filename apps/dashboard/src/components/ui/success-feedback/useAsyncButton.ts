/**
 * useAsyncButton Hook
 *
 * Hook for managing async button state transitions.
 */

import {
	type Dispatch,
	type SetStateAction,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { ERROR_STATE_DURATION, SUCCESS_STATE_DURATION } from "./animations";
import type { ButtonState, UseAsyncButtonOptions, UseAsyncButtonReturn } from "./types";

interface AsyncButtonRuntime<T> {
	targetSuccessDuration: number;
	targetErrorDuration: number;
	onSuccess?: (result: T) => void;
	onError?: (error: Error) => void;
	setState: Dispatch<SetStateAction<ButtonState>>;
	setError: Dispatch<SetStateAction<Error | null>>;
}

function useAsyncButtonTimer() {
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const clear = useCallback(() => {
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current);
			timeoutRef.current = null;
		}
	}, []);

	const schedule = useCallback(
		(durationMs: number, callback: () => void, setState: Dispatch<SetStateAction<ButtonState>>) => {
			clear();
			timeoutRef.current = setTimeout(() => {
				setState("idle");
				callback();
			}, durationMs);
		},
		[clear],
	);

	useEffect(() => {
		return () => {
			clear();
		};
	}, [clear]);

	return { clear, schedule };
}

function useAsyncButtonLifecycle<T>({
	targetSuccessDuration,
	targetErrorDuration,
	onSuccess,
	onError,
	setState,
	setError,
}: AsyncButtonRuntime<T>) {
	const { clear, schedule } = useAsyncButtonTimer();

	const handleSuccess = useCallback(
		(result: T) => {
			setState("success");
			schedule(
				targetSuccessDuration,
				() => {
					onSuccess?.(result);
				},
				setState,
			);
		},
		[onSuccess, schedule, setState, targetSuccessDuration],
	);

	const handleError = useCallback(
		(error: Error) => {
			setError(error);
			setState("error");
			schedule(
				targetErrorDuration,
				() => {
					onError?.(error);
				},
				setState,
			);
		},
		[onError, schedule, setError, setState, targetErrorDuration],
	);

	const reset = useCallback(() => {
		setState("idle");
		setError(null);
		clear();
	}, [clear, setError, setState]);

	return { handleSuccess, handleError, reset };
}

function useAsyncButtonExecution<T>(
	asyncFn: () => Promise<T>,
	state: ButtonState,
	setError: Dispatch<SetStateAction<Error | null>>,
	setState: Dispatch<SetStateAction<ButtonState>>,
	handleSuccess: (result: T) => void,
	handleError: (error: Error) => void,
) {
	return useCallback(async () => {
		if (state === "loading") {
			return;
		}

		setError(null);
		setState("loading");
		try {
			const result = await asyncFn();
			handleSuccess(result);
		} catch (error) {
			handleError(error instanceof Error ? error : new Error(String(error)));
		}
	}, [asyncFn, handleError, handleSuccess, setError, setState, state]);
}

/**
 * Hook for managing async button state.
 */
export function useAsyncButton<T>(
	asyncFn: () => Promise<T>,
	options: UseAsyncButtonOptions<T> = {},
): UseAsyncButtonReturn {
	const [state, setState] = useState<ButtonState>("idle");
	const [error, setError] = useState<Error | null>(null);
	const {
		successDuration = SUCCESS_STATE_DURATION,
		errorDuration = ERROR_STATE_DURATION,
		onSuccess,
		onError,
	} = options;

	const { handleSuccess, handleError, reset } = useAsyncButtonLifecycle<T>({
		targetSuccessDuration: successDuration,
		targetErrorDuration: errorDuration,
		onSuccess,
		onError,
		setState,
		setError,
	});

	const execute = useAsyncButtonExecution(
		asyncFn,
		state,
		setError,
		setState,
		handleSuccess,
		handleError,
	);

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
