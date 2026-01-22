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

	const mutationOptions: UseMutationOptions<
		TData,
		Error,
		TVariables,
		OptimisticMutationContext<TData>
	> = {
		mutationFn,
		retry,

		// Before mutation: apply optimistic update
		onMutate: async (variables) => {
			// Cancel any outgoing refetches (prevent race conditions)
			await queryClient.cancelQueries({ queryKey });

			// Snapshot the previous value
			const previousData = queryClient.getQueryData<TData>(queryKey);

			// Apply optimistic update if provided
			if (optimisticUpdate) {
				const optimisticData = optimisticUpdate(previousData, variables);
				queryClient.setQueryData(queryKey, optimisticData);
			}

			// Return context with previous data
			return { previousData, timestamp: Date.now() };
		},

		// On error: rollback to previous value
		onError: (error, variables, context) => {
			// Rollback to previous data
			if (context?.previousData !== undefined) {
				queryClient.setQueryData(queryKey, context.previousData);
			}

			// Show error toast unless skipped
			if (!skipErrorToast) {
				const message =
					typeof errorMessage === "function"
						? errorMessage(error)
						: errorMessage || `Update failed: ${error.message}`;

				alert.warning("Update Failed", message, {
					label: "Retry",
					onClick: () => {
						// Re-attempt the mutation
						mutation.mutate(variables);
					},
				});
			}

			// Call user's onError handler
			if (context) {
				onError?.(error, variables, context);
			}
		},

		// On success: call user's onSuccess handler
		onSuccess: (data, variables, context) => {
			if (context) {
				onSuccess?.(data, variables, context);
			}
		},

		// After mutation (success or error): refetch to ensure consistency
		onSettled: async () => {
			await queryClient.invalidateQueries({ queryKey });
		},
	};

	const mutation = useMutation(mutationOptions);

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

	// Add mutation
	const addMutation = useMutation({
		mutationFn: options.addFn,
		onMutate: async (newItem) => {
			await queryClient.cancelQueries({ queryKey: options.queryKey });
			const previousData = queryClient.getQueryData<TItem[]>(options.queryKey);
			queryClient.setQueryData<TItem[]>(options.queryKey, (old) => [...(old || []), newItem]);
			return { previousData };
		},
		onError: (error, _variables, context) => {
			queryClient.setQueryData(options.queryKey, context?.previousData);
			alert.warning("Failed to add item", error.message);
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: options.queryKey });
		},
	});

	// Remove mutation
	const removeMutation = useMutation({
		mutationFn: options.removeFn,
		onMutate: async (id) => {
			await queryClient.cancelQueries({ queryKey: options.queryKey });
			const previousData = queryClient.getQueryData<TItem[]>(options.queryKey);
			queryClient.setQueryData<TItem[]>(options.queryKey, (old) =>
				(old || []).filter((item) => item.id !== id),
			);
			return { previousData };
		},
		onError: (error, _variables, context) => {
			queryClient.setQueryData(options.queryKey, context?.previousData);
			alert.warning("Failed to remove item", error.message);
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: options.queryKey });
		},
	});

	// Update mutation
	const updateMutation = useMutation({
		mutationFn: options.updateFn,
		onMutate: async (updates) => {
			await queryClient.cancelQueries({ queryKey: options.queryKey });
			const previousData = queryClient.getQueryData<TItem[]>(options.queryKey);
			queryClient.setQueryData<TItem[]>(options.queryKey, (old) =>
				(old || []).map((item) => (item.id === updates.id ? { ...item, ...updates } : item)),
			);
			return { previousData };
		},
		onError: (error, _variables, context) => {
			queryClient.setQueryData(options.queryKey, context?.previousData);
			alert.warning("Failed to update item", error.message);
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: options.queryKey });
		},
	});

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
