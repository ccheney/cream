/**
 * Auth Layout - Wraps all authenticated routes
 *
 * This layout provides:
 * - Authentication guard
 * - Sidebar navigation
 * - Header with connection status
 */

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect } from "react";
import { Logo } from "@/components/ui/logo";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/contexts/AuthContext";
import { useWebSocketContext } from "@/providers/WebSocketProvider";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuth();
  const { connected, connectionState } = useWebSocketContext();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-cream-50 dark:bg-night-900">
        <Spinner size="lg" />
      </div>
    );
  }

  // Don't render until authenticated
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex h-screen bg-cream-50 dark:bg-night-900">
      {/* Sidebar */}
      <aside className="w-64 border-r border-cream-200 dark:border-night-700 bg-white dark:bg-night-800 flex flex-col">
        <div className="p-4 border-b border-cream-200 dark:border-night-700">
          <Logo className="h-8 w-auto" />
        </div>
        <nav className="flex-1 mt-4 px-2 space-y-1 overflow-y-auto">
          <NavLink href="/dashboard">Dashboard</NavLink>
          <NavLink href="/decisions">Decisions</NavLink>
          <NavLink href="/portfolio">Portfolio</NavLink>
          <NavLink href="/agents">Agents</NavLink>
          <NavLink href="/charts">Charts</NavLink>
          <NavLink href="/risk">Risk</NavLink>
          <NavLink href="/backtest">Backtest</NavLink>
          <NavLink href="/theses">Theses</NavLink>
          <NavLink href="/config">Config</NavLink>
          <NavLink href="/feed">Feed</NavLink>
        </nav>
        <div className="p-4 border-t border-cream-200 dark:border-night-700">
          <div className="text-xs text-cream-500 dark:text-cream-400">{user?.email}</div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto flex flex-col">
        {/* Header */}
        <header className="h-14 border-b border-cream-200 dark:border-night-700 bg-white dark:bg-night-800 px-6 flex items-center justify-between shrink-0">
          <div className="text-sm text-cream-600 dark:text-cream-400">
            {/* Breadcrumb or page title can be added here */}
          </div>
          <div className="flex items-center gap-4">
            {/* Connection status indicator */}
            <ConnectionBadge connected={connected} state={connectionState} />
            <span className="text-sm text-cream-600 dark:text-cream-400 uppercase">
              {process.env.NEXT_PUBLIC_CREAM_ENV ?? "PAPER"}
            </span>
          </div>
        </header>

        {/* Page content with Suspense boundary */}
        <Suspense fallback={<LoadingFallback />}>
          <div className="flex-1 p-6 overflow-auto">{children}</div>
        </Suspense>
      </main>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={`block px-3 py-2 rounded-md text-sm transition-colors ${
        isActive
          ? "bg-cream-100 dark:bg-night-700 text-cream-900 dark:text-cream-100 font-medium"
          : "text-cream-700 dark:text-cream-300 hover:bg-cream-100 dark:hover:bg-night-700"
      }`}
    >
      {children}
    </Link>
  );
}

function ConnectionBadge({ connected, state }: { connected: boolean; state: string }) {
  const colors = {
    connected: "bg-green-500",
    connecting: "bg-yellow-500 animate-pulse",
    reconnecting: "bg-yellow-500 animate-pulse",
    disconnected: "bg-red-500",
  };

  const color = colors[state as keyof typeof colors] ?? colors.disconnected;

  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${color}`} title={state} />
      <span className="text-xs text-cream-500 dark:text-cream-400 capitalize">
        {connected ? "Connected" : state}
      </span>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-64">
      <Spinner size="lg" />
    </div>
  );
}
