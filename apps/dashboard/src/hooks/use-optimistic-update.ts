/**
 * Optimistic Update Hook
 *
 * Provides optimistic updates with automatic rollback on server errors.
 * Uses TanStack Query's mutation pattern for consistency.
 *
 * @see docs/plans/ui/31-realtime-patterns.md lines 120-129
 */

import {
	type QueryClient,
	type QueryKey,
	type UseMutationOptions,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import { useAlert } from "@/stores/alert-store";

// ============================================
// Types
// ============================================

export interface OptimisticUpdateOptions<TData, TVariables, TContext = unknown> {
	/** TanStack Query cache key */
	queryKey: QueryKey;
	/** Function to send update to server */
	mutationFn: (variables: TVariables) => Promise<TData>;
	/** Function to compute optimistic update (applied before server response) */
	optimisticUpdate?: (current: TData | undefined, variables: TVariables) => TData;
	/** Called on successful mutation */
	onSuccess?: (data: TData, variables: TVariables, context: TContext) => void;
	/** Called on error (after rollback) */
	onError?: (error: Error, variables: TVariables, context: TContext) => void;
	/** Custom error message for toast */
	errorMessage?: string | ((error: Error) => string);
	/** Debounce delay in ms (default: 0) */
	debounceMs?: number;
	/** Skip showing error toast */
	skipErrorToast?: boolean;
	/** Retry count (default: 0) */
	retry?: number;
}

export interface OptimisticMutationContext<TData> {
	/** Previous data before optimistic update */
	previousData: TData | undefined;
	/** Snapshot timestamp */
	timestamp: number;
}

export interface UseOptimisticUpdateReturn<TData, TVariables> {
	/** Execute the mutation */
	mutate: (variables: TVariables) => void;
	/** Execute the mutation (async) */
	mutateAsync: (variables: TVariables) => Promise<TData>;
	/** Is mutation in progress */
	isPending: boolean;
	/** Is mutation successful */
	isSuccess: boolean;
	/** Is mutation errored */
	isError: boolean;
	/** Error if any */
	error: Error | null;
	/** Reset mutation state */
	reset: () => void;
}

function buildErrorMessage(
	errorMessage: string | ((error: Error) => string) | undefined,
	error: Error,
) {
	if (typeof errorMessage === "function") {
		return errorMessage(error);
	}
	return errorMessage || `Update failed: ${error.message}`;
}

function createOptimisticMutationOptions<TData, TVariables>(
	queryClient: QueryClient,
	queryKey: QueryKey,
	mutationFn: (variables: TVariables) => Promise<TData>,
	optimisticUpdate: OptimisticUpdateOptions<
		TData,
		TVariables,
		OptimisticMutationContext<TData>
	>["optimisticUpdate"],
	onSuccess: OptimisticUpdateOptions<
		TData,
		TVariables,
		OptimisticMutationContext<TData>
	>["onSuccess"],
	onError: OptimisticUpdateOptions<TData, TVariables, OptimisticMutationContext<TData>>["onError"],
	errorMessage: OptimisticUpdateOptions<
		TData,
		TVariables,
		OptimisticMutationContext<TData>
	>["errorMessage"],
	alert: ReturnType<typeof useAlert>,
	skipErrorToast: boolean,
	retry: number,
	retryMutation: (variables: TVariables) => void,
) {
	return {
		mutationFn,
		retry,
		onMutate: async (variables: TVariables) => {
			await queryClient.cancelQueries({ queryKey });
			const previousData = queryClient.getQueryData<TData>(queryKey);
			if (optimisticUpdate) {
				const optimisticData = optimisticUpdate(previousData, variables);
				queryClient.setQueryData(queryKey, optimisticData);
			}
			return { previousData, timestamp: Date.now() };
		},
		onError: (
			error: Error,
			variables: TVariables,
			context: OptimisticMutationContext<TData> | undefined,
		) => {
			if (context?.previousData !== undefined) {
				queryClient.setQueryData(queryKey, context.previousData);
			}
			if (!skipErrorToast) {
				const message = buildErrorMessage(errorMessage, error);
				alert.warning("Update Failed", message, {
					label: "Retry",
					onClick: () => {
						retryMutation(variables);
					},
				});
			}
			if (context) {
				onError?.(error, variables, context);
			}
		},
		onSuccess: (
			data: TData,
			variables: TVariables,
			context: OptimisticMutationContext<TData> | undefined,
		) => {
			if (context) {
				onSuccess?.(data, variables, context);
			}
		},
		onSettled: async () => {
			await queryClient.invalidateQueries({ queryKey });
		},
	} as UseMutationOptions<TData, Error, TVariables, OptimisticMutationContext<TData>>;
}

function createListMutationOptions<TItem extends { id: string }, TRequest, TResult>(
	queryClient: QueryClient,
	queryKey: QueryKey,
	options: {
		mutationFn?: (request: TRequest) => Promise<TResult>;
		applyOptimistic: (request: TRequest, oldData: TItem[] | undefined) => TItem[];
		onErrorMessage: string;
		alert: ReturnType<typeof useAlert>;
	},
) {
	return {
		mutationFn: options.mutationFn,
		onMutate: async (request: TRequest) => {
			await queryClient.cancelQueries({ queryKey });
			const previousData = queryClient.getQueryData<TItem[]>(queryKey);
			queryClient.setQueryData<TItem[]>(queryKey, (old) => options.applyOptimistic(request, old));
			return { previousData };
		},
		onError: (_error: unknown, _request: TRequest, context: { previousData?: TItem[] }) => {
			queryClient.setQueryData(queryKey, context.previousData);
			options.alert.warning(
				options.onErrorMessage,
				_error instanceof Error ? _error.message : String(_error),
			);
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey });
		},
	} as UseMutationOptions<TResult, Error, TRequest, { previousData?: TItem[] }>;
}

// ============================================
// Debounce Helper
// ============================================

function useDebouncedCallback<TArgs extends unknown[]>(
	callback: (...args: TArgs) => void,
	delay: number,
): (...args: TArgs) => void {
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const callbackRef = useRef(callback);
	callbackRef.current = callback;

	return useCallback(
		(...args: TArgs) => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}

			if (delay === 0) {
				callbackRef.current(...args);
			} else {
				timeoutRef.current = setTimeout(() => {
					callbackRef.current(...args);
				}, delay);
			}
		},
		[delay],
	);
}

// ============================================
// Hook Implementation
// ============================================

/**
 * Hook for optimistic updates with automatic rollback.
 *
 * @example
 * ```tsx
 * const { mutate, isPending } = useOptimisticUpdate({
 *   queryKey: ['alerts', alertId],
 *   mutationFn: async (acknowledged) => {
 *     await api.acknowledgeAlert(alertId);
 *     return { ...alert, acknowledged };
 *   },
 *   optimisticUpdate: (current, acknowledged) => ({
 *     ...current,
 *     acknowledged,
 *   }),
 * });
 *
 * // Usage
 * mutate(true);
 * ```
 */
export function useOptimisticUpdate<TData, TVariables>(
	options: OptimisticUpdateOptions<TData, TVariables, OptimisticMutationContext<TData>>,
): UseOptimisticUpdateReturn<TData, TVariables> {
	const queryClient = useQueryClient();
	const alert = useAlert();

	const {
		queryKey,
		mutationFn,
		optimisticUpdate,
		onSuccess,
		onError,
		errorMessage,
		debounceMs = 0,
		skipErrorToast = false,
		retry = 0,
	} = options;

	const mutateRef = useRef<(variables: TVariables) => void>(() => void 0);
	const retryMutation = useCallback((variables: TVariables) => {
		mutateRef.current(variables);
	}, []);

	const mutation = useMutation(
		createOptimisticMutationOptions(
			queryClient,
			queryKey,
			mutationFn,
			optimisticUpdate,
			onSuccess,
			onError,
			errorMessage,
			alert,
			skipErrorToast,
			retry,
			retryMutation,
		),
	);
	mutateRef.current = mutation.mutate;

	// Debounced mutate function
	const debouncedMutate = useDebouncedCallback(
		(variables: TVariables) => mutation.mutate(variables),
		debounceMs,
	);

	return {
		mutate: debounceMs > 0 ? debouncedMutate : mutation.mutate,
		mutateAsync: mutation.mutateAsync,
		isPending: mutation.isPending,
		isSuccess: mutation.isSuccess,
		isError: mutation.isError,
		error: mutation.error,
		reset: mutation.reset,
	};
}

// ============================================
// Specialized Hooks
// ============================================

/**
 * Hook for optimistic list item updates (add, remove, update).
 */
export function useOptimisticListUpdate<TItem extends { id: string }>(options: {
	queryKey: QueryKey;
	addFn?: (item: TItem) => Promise<TItem>;
	removeFn?: (id: string) => Promise<void>;
	updateFn?: (item: Partial<TItem> & { id: string }) => Promise<TItem>;
	errorMessage?: string;
}) {
	const queryClient = useQueryClient();
	const alert = useAlert();

	const addMutation = useMutation(
		createListMutationOptions<TItem, TItem, TItem>(queryClient, options.queryKey, {
			mutationFn: options.addFn,
			applyOptimistic: (newItem, oldData) => [...(oldData || []), newItem],
			onErrorMessage: options.errorMessage || "Failed to add item",
			alert,
		}),
	);

	const removeMutation = useMutation(
		createListMutationOptions<TItem, string, void>(queryClient, options.queryKey, {
			mutationFn: options.removeFn,
			applyOptimistic: (id, oldData) => (oldData || []).filter((item) => item.id !== id),
			onErrorMessage: options.errorMessage || "Failed to remove item",
			alert,
		}),
	);

	const updateMutation = useMutation(
		createListMutationOptions<TItem, Partial<TItem> & { id: string }, TItem>(
			queryClient,
			options.queryKey,
			{
				mutationFn: options.updateFn,
				applyOptimistic: (updates, oldData) =>
					(oldData || []).map((item) => (item.id === updates.id ? { ...item, ...updates } : item)),
				onErrorMessage: options.errorMessage || "Failed to update item",
				alert,
			},
		),
	);

	return {
		add: addMutation.mutate,
		remove: removeMutation.mutate,
		update: updateMutation.mutate,
		isAdding: addMutation.isPending,
		isRemoving: removeMutation.isPending,
		isUpdating: updateMutation.isPending,
		isPending: addMutation.isPending || removeMutation.isPending || updateMutation.isPending,
	};
}

// ============================================
// Utility: Manual Optimistic Update
// ============================================

/**
 * Utility for manual optimistic updates outside of hooks.
 *
 * @example
 * ```tsx
 * const rollback = applyOptimisticUpdate(
 *   queryClient,
 *   ['position', positionId],
 *   { ...position, stopLoss: newStopLoss }
 * );
 *
 * try {
 *   await api.updateStopLoss(positionId, newStopLoss);
 * } catch (error) {
 *   rollback();
 *   throw error;
 * }
 * ```
 */
export function applyOptimisticUpdate<TData>(
	queryClient: QueryClient,
	queryKey: QueryKey,
	newData: TData,
): () => void {
	const previousData = queryClient.getQueryData<TData>(queryKey);
	queryClient.setQueryData(queryKey, newData);

	return () => {
		queryClient.setQueryData(queryKey, previousData);
	};
}

// ============================================
// Exports
// ============================================

export default useOptimisticUpdate;
