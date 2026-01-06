/**
 * App Providers
 *
 * Client-side providers wrapper for the application.
 * Includes auth, query client, and WebSocket providers.
 *
 * @see docs/plans/ui/07-state-management.md
 */

"use client";

import { AuthProvider } from "@/contexts/AuthContext";
import { QueryProvider } from "@/lib/providers/QueryProvider";
import { WebSocketProvider } from "@/providers/WebSocketProvider";

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <QueryProvider>
      <AuthProvider>
        <WebSocketProvider>{children}</WebSocketProvider>
      </AuthProvider>
    </QueryProvider>
  );
}
