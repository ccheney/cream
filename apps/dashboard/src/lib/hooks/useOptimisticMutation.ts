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
	type QueryClient,
	type QueryKey,
	type UseMutationResult,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import { type MutableRefObject, useRef } from "react";
import { useToastStore } from "@/stores/toast-store";

export interface OptimisticMutationOptions<TData, TVariables, TContext = unknown> {
	mutationFn: MutationFunction<TData, TVariables>;
	queryKey: QueryKey;
	optimisticUpdate: (currentData: TData | undefined, variables: TVariables) => TData;
	successMessage?: string | ((data: TData, variables: TVariables) => string);
	errorMessage?: string | ((error: Error, variables: TVariables) => string);
	onSuccess?: (data: TData, variables: TVariables, context: TContext) => void;
	onError?: (error: Error, variables: TVariables, context: TContext | undefined) => void;
	showSuccessToast?: boolean;
	showErrorToast?: boolean;
	invalidateKeys?: QueryKey[];
}

export interface OptimisticMutationResult<TData, TVariables> {
	mutate: (variables: TVariables) => void;
	mutateAsync: (variables: TVariables) => Promise<TData>;
	isPending: boolean;
	isSuccess: boolean;
	isError: boolean;
	error: Error | null;
	data: TData | undefined;
	reset: () => void;
}

type MutationMessage<TPayload, TVariables> =
	| string
	| ((payload: TPayload, variables: TVariables) => string)
	| undefined;

function resolveMutationMessage<TPayload, TVariables>(
	message: MutationMessage<TPayload, TVariables>,
	payload: TPayload,
	variables: TVariables,
	fallback: string,
): string {
	if (typeof message === "function") {
		return message(payload, variables);
	}
	return message ?? fallback;
}

function invalidateQueryKeys(queryClient: QueryClient, invalidateKeys?: QueryKey[]): void {
	if (!invalidateKeys) {
		return;
	}
	for (const key of invalidateKeys) {
		queryClient.invalidateQueries({ queryKey: key });
	}
}

interface OnMutateHandlerOptions<TData, TVariables, _TContext> {
	queryClient: QueryClient;
	queryKey: QueryKey;
	optimisticUpdate: (currentData: TData | undefined, variables: TVariables) => TData;
	previousDataRef: MutableRefObject<TData | undefined>;
}

function createOnMutateHandler<TData, TVariables, TContext>({
	queryClient,
	queryKey,
	optimisticUpdate,
	previousDataRef,
}: OnMutateHandlerOptions<TData, TVariables, TContext>): (
	variables: TVariables,
) => Promise<TContext> {
	return async (variables) => {
		await queryClient.cancelQueries({ queryKey });
		previousDataRef.current = queryClient.getQueryData<TData>(queryKey);
		queryClient.setQueryData<TData>(queryKey, (currentData) =>
			optimisticUpdate(currentData, variables),
		);
		return { previousData: previousDataRef.current } as TContext;
	};
}

interface OnSuccessHandlerOptions<TData, TVariables, TContext> {
	queryClient: QueryClient;
	successMessage: OptimisticMutationOptions<TData, TVariables, TContext>["successMessage"];
	showSuccessToast: boolean;
	showSuccess: (message: string) => void;
	invalidateKeys?: QueryKey[];
	onSuccess?: (data: TData, variables: TVariables, context: TContext) => void;
}

function createOnSuccessHandler<TData, TVariables, TContext>({
	queryClient,
	successMessage,
	showSuccessToast,
	showSuccess,
	invalidateKeys,
	onSuccess,
}: OnSuccessHandlerOptions<TData, TVariables, TContext>) {
	return (data: TData, variables: TVariables, context: TContext) => {
		if (showSuccessToast && successMessage) {
			const message = resolveMutationMessage(successMessage, data, variables, "");
			showSuccess(message);
		}
		invalidateQueryKeys(queryClient, invalidateKeys);
		onSuccess?.(data, variables, context);
	};
}

interface OnErrorHandlerOptions<TData, TVariables, TContext> {
	queryClient: QueryClient;
	queryKey: QueryKey;
	previousDataRef: MutableRefObject<TData | undefined>;
	errorMessage: OptimisticMutationOptions<TData, TVariables, TContext>["errorMessage"];
	showErrorToast: boolean;
	showError: (message: string) => void;
	onError?: (error: Error, variables: TVariables, context: TContext | undefined) => void;
}

function createOnErrorHandler<TData, TVariables, TContext>({
	queryClient,
	queryKey,
	previousDataRef,
	errorMessage,
	showErrorToast,
	showError,
	onError,
}: OnErrorHandlerOptions<TData, TVariables, TContext>) {
	return (error: Error, variables: TVariables, context: TContext | undefined) => {
		if (previousDataRef.current !== undefined) {
			queryClient.setQueryData(queryKey, previousDataRef.current);
		}
		if (showErrorToast) {
			const message = resolveMutationMessage(
				errorMessage,
				error,
				variables,
				error.message ?? "An error occurred",
			);
			showError(message);
		}
		onError?.(error, variables, context);
	};
}

function toMutationResult<TData, TVariables>(
	mutation: UseMutationResult<TData, Error, TVariables, unknown>,
): OptimisticMutationResult<TData, TVariables> {
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

/**
 * Hook for mutations with optimistic updates.
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
 * acknowledgeAlert('alert-123');
 * ```
 */
export function useOptimisticMutation<TData, TVariables, TContext = unknown>(
	options: OptimisticMutationOptions<TData, TVariables, TContext>,
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
	const previousDataRef = useRef<TData | undefined>(undefined);
	const onMutate = createOnMutateHandler<TData, TVariables, TContext>({
		queryClient,
		queryKey,
		optimisticUpdate,
		previousDataRef,
	});
	const onSuccessHandler = createOnSuccessHandler<TData, TVariables, TContext>({
		queryClient,
		successMessage,
		showSuccessToast,
		showSuccess,
		invalidateKeys,
		onSuccess,
	});
	const onErrorHandler = createOnErrorHandler<TData, TVariables, TContext>({
		queryClient,
		queryKey,
		previousDataRef,
		errorMessage,
		showErrorToast,
		showError,
		onError,
	});

	const mutation = useMutation<TData, Error, TVariables, TContext>({
		mutationFn,
		onMutate,
		onSuccess: onSuccessHandler,
		onError: onErrorHandler,
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey });
		},
	});

	return toMutationResult(mutation);
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
	options: SimpleMutationOptions<TData, TVariables>,
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
