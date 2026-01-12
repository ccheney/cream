/**
 * App Providers
 *
 * Client-side providers wrapper for the application.
 * Includes auth, query client, WebSocket, and keyboard shortcuts providers.
 *
 * @see docs/plans/ui/07-state-management.md
 */

"use client";

import { useEffect } from "react";
import { KeyboardShortcutsProvider } from "@/components/providers/keyboard-shortcuts-provider";
import { AuthProvider } from "@/contexts/AuthContext";
import { QueryProvider } from "@/lib/providers/QueryProvider";
import { WebSocketProvider } from "@/providers/WebSocketProvider";
import { subscribeToThemeChanges } from "@/stores/preferences-store";

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  useEffect(() => {
    return subscribeToThemeChanges();
  }, []);

  return (
    <QueryProvider>
      <AuthProvider>
        <WebSocketProvider>
          <KeyboardShortcutsProvider>{children}</KeyboardShortcutsProvider>
        </WebSocketProvider>
      </AuthProvider>
    </QueryProvider>
  );
}
