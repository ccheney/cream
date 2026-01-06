/**
 * useOptimisticMutation Hook
 *
 * Wrapper around TanStack Query's useMutation for optimistic updates.
 * Provides immediate UI feedback with automatic rollback on failure.
 *
 * @see docs/plans/ui/31-realtime-patterns.md Optimistic Updates section
 */

"use client";

import {
  type MutationFunction,
  type QueryKey,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useRef } from "react";
import { useToastStore } from "@/stores/toast-store";

// ============================================
// Types
// ============================================

export interface OptimisticMutationOptions<TData, TVariables, TContext = unknown> {
  /** Mutation function to call */
  mutationFn: MutationFunction<TData, TVariables>;
  /** Query key to update optimistically */
  queryKey: QueryKey;
  /** Function to update query data optimistically */
  optimisticUpdate: (currentData: TData | undefined, variables: TVariables) => TData;
  /** Success message for toast (optional) */
  successMessage?: string | ((data: TData, variables: TVariables) => string);
  /** Error message for toast (optional, uses error.message if not provided) */
  errorMessage?: string | ((error: Error, variables: TVariables) => string);
  /** Called on successful mutation */
  onSuccess?: (data: TData, variables: TVariables, context: TContext) => void;
  /** Called on error (after rollback) */
  onError?: (error: Error, variables: TVariables, context: TContext | undefined) => void;
  /** Whether to show success toast (default: false) */
  showSuccessToast?: boolean;
  /** Whether to show error toast (default: true) */
  showErrorToast?: boolean;
  /** Related query keys to invalidate on success */
  invalidateKeys?: QueryKey[];
}

export interface OptimisticMutationResult<TData, TVariables> {
  /** Execute the mutation */
  mutate: (variables: TVariables) => void;
  /** Execute the mutation and return a promise */
  mutateAsync: (variables: TVariables) => Promise<TData>;
  /** Whether mutation is pending */
  isPending: boolean;
  /** Whether mutation was successful */
  isSuccess: boolean;
  /** Whether mutation failed */
  isError: boolean;
  /** Error from mutation */
  error: Error | null;
  /** Data returned from mutation */
  data: TData | undefined;
  /** Reset mutation state */
  reset: () => void;
}

// ============================================
// Hook
// ============================================

/**
 * Hook for mutations with optimistic updates.
 *
 * Pattern:
 * 1. Apply change optimistically in UI
 * 2. Send request to server
 * 3. On success: invalidate/refetch to sync
 * 4. On failure: revert UI, show error toast
 *
 * @example
 * ```tsx
 * const { mutate: acknowledgeAlert } = useOptimisticMutation({
 *   mutationFn: (alertId: string) => api.alerts.acknowledge(alertId),
 *   queryKey: ['alerts'],
 *   optimisticUpdate: (alerts, alertId) =>
 *     alerts?.map(a => a.id === alertId ? { ...a, acknowledged: true } : a),
 *   successMessage: 'Alert acknowledged',
 *   showSuccessToast: true,
 * });
 *
 * // Usage
 * acknowledgeAlert('alert-123');
 * ```
 */
export function useOptimisticMutation<TData, TVariables, TContext = unknown>(
  options: OptimisticMutationOptions<TData, TVariables, TContext>
): OptimisticMutationResult<TData, TVariables> {
  const {
    mutationFn,
    queryKey,
    optimisticUpdate,
    successMessage,
    errorMessage,
    onSuccess,
    onError,
    showSuccessToast = false,
    showErrorToast = true,
    invalidateKeys,
  } = options;

  const queryClient = useQueryClient();
  const { success: showSuccess, error: showError } = useToastStore();

  // Store previous data for rollback
  const previousDataRef = useRef<TData | undefined>(undefined);

  const mutation = useMutation<TData, Error, TVariables, TContext>({
    mutationFn,

    onMutate: async (variables) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey });

      // Snapshot current data for rollback
      previousDataRef.current = queryClient.getQueryData<TData>(queryKey);

      // Optimistically update cache
      queryClient.setQueryData<TData>(queryKey, (currentData) =>
        optimisticUpdate(currentData, variables)
      );

      // Return context for potential rollback
      return { previousData: previousDataRef.current } as TContext;
    },

    onSuccess: (data, variables, context) => {
      // Show success toast if enabled
      if (showSuccessToast && successMessage) {
        const message =
          typeof successMessage === "function" ? successMessage(data, variables) : successMessage;
        showSuccess(message);
      }

      // Invalidate related queries to ensure consistency
      if (invalidateKeys) {
        for (const key of invalidateKeys) {
          queryClient.invalidateQueries({ queryKey: key });
        }
      }

      // Call user's onSuccess
      onSuccess?.(data, variables, context);
    },

    onError: (error, variables, context) => {
      // Rollback to previous data
      if (previousDataRef.current !== undefined) {
        queryClient.setQueryData(queryKey, previousDataRef.current);
      }

      // Show error toast
      if (showErrorToast) {
        const message =
          typeof errorMessage === "function"
            ? errorMessage(error, variables)
            : (errorMessage ?? error.message ?? "An error occurred");
        showError(message);
      }

      // Call user's onError
      onError?.(error, variables, context);
    },

    onSettled: () => {
      // Always refetch after mutation settles to ensure consistency
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    isError: mutation.isError,
    error: mutation.error,
    data: mutation.data,
    reset: mutation.reset,
  };
}

// ============================================
// Simple Mutation Hook (without optimistic updates)
// ============================================

export interface SimpleMutationOptions<TData, TVariables> {
  /** Mutation function to call */
  mutationFn: MutationFunction<TData, TVariables>;
  /** Success message for toast */
  successMessage?: string | ((data: TData, variables: TVariables) => string);
  /** Error message for toast */
  errorMessage?: string | ((error: Error, variables: TVariables) => string);
  /** Called on success */
  onSuccess?: (data: TData, variables: TVariables) => void;
  /** Called on error */
  onError?: (error: Error, variables: TVariables) => void;
  /** Query keys to invalidate on success */
  invalidateKeys?: QueryKey[];
  /** Whether to show success toast (default: true) */
  showSuccessToast?: boolean;
  /** Whether to show error toast (default: true) */
  showErrorToast?: boolean;
}

/**
 * Simple mutation hook with toast notifications.
 * Use this when you don't need optimistic updates.
 *
 * @example
 * ```tsx
 * const { mutate: updateSettings } = useSimpleMutation({
 *   mutationFn: (data) => api.settings.update(data),
 *   successMessage: 'Settings saved',
 *   invalidateKeys: [['settings']],
 * });
 * ```
 */
export function useSimpleMutation<TData, TVariables>(
  options: SimpleMutationOptions<TData, TVariables>
): OptimisticMutationResult<TData, TVariables> {
  const {
    mutationFn,
    successMessage,
    errorMessage,
    onSuccess,
    onError,
    invalidateKeys,
    showSuccessToast = true,
    showErrorToast = true,
  } = options;

  const queryClient = useQueryClient();
  const { success: showSuccess, error: showError } = useToastStore();

  const mutation = useMutation<TData, Error, TVariables>({
    mutationFn,

    onSuccess: (data, variables) => {
      // Show success toast
      if (showSuccessToast && successMessage) {
        const message =
          typeof successMessage === "function" ? successMessage(data, variables) : successMessage;
        showSuccess(message);
      }

      // Invalidate queries
      if (invalidateKeys) {
        for (const key of invalidateKeys) {
          queryClient.invalidateQueries({ queryKey: key });
        }
      }

      onSuccess?.(data, variables);
    },

    onError: (error, variables) => {
      if (showErrorToast) {
        const message =
          typeof errorMessage === "function"
            ? errorMessage(error, variables)
            : (errorMessage ?? error.message ?? "An error occurred");
        showError(message);
      }

      onError?.(error, variables);
    },
  });

  return {
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    isError: mutation.isError,
    error: mutation.error,
    data: mutation.data,
    reset: mutation.reset,
  };
}

// ============================================
// Exports
// ============================================

export default useOptimisticMutation;
