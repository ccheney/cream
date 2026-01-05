/**
 * TanStack Query Provider
 *
 * Wraps the application with QueryClientProvider and ReactQueryDevtools.
 *
 * @see docs/plans/ui/07-state-management.md
 */

"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { type ReactNode, useState } from "react";
import { getQueryClient } from "../api/query-client.js";

// ============================================
// Types
// ============================================

export interface QueryProviderProps {
  children: ReactNode;
  /** Show React Query devtools (default: true in development) */
  showDevtools?: boolean;
}

// ============================================
// Component
// ============================================

/**
 * Query provider with integrated devtools.
 *
 * @example
 * ```tsx
 * // In layout.tsx
 * <QueryProvider>
 *   <App />
 * </QueryProvider>
 * ```
 */
export function QueryProvider({
  children,
  showDevtools = process.env.NODE_ENV === "development",
}: QueryProviderProps) {
  // Use useState to ensure same QueryClient across re-renders
  // but allow SSR to create new instance
  const [queryClient] = useState(() => getQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {showDevtools && <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />}
    </QueryClientProvider>
  );
}

export default QueryProvider;
