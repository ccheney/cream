/**
 * Auth Layout - Wraps all authenticated routes
 *
 * Responsive layout with:
 * - Desktop (≥1280px): Full sidebar with icons + labels
 * - Laptop (1024-1279px): Collapsed sidebar, expand on hover
 * - Tablet (768-1023px): Hamburger menu with slide-in drawer
 * - Mobile (<768px): Bottom navigation bar
 *
 * @see docs/plans/ui/30-themes.md responsive design
 */

"use client";

import { Menu } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { MobileNav, NavDrawer, Sidebar } from "@/components/layout";
import { AddSymbolModal } from "@/components/ui/add-symbol-modal";
import { GlobalLoadingIndicator } from "@/components/ui/GlobalLoadingIndicator";
import { Logo } from "@/components/ui/logo";
import { SkipLink } from "@/components/ui/skip-link";
import { Spinner } from "@/components/ui/spinner";
import { TickerStrip } from "@/components/ui/ticker-strip";
import { useAuth } from "@/contexts/AuthContext";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { useWebSocketContext } from "@/providers/WebSocketProvider";
import { useSidebar } from "@/stores/ui-store";
import { useWatchlistStore } from "@/stores/watchlist-store";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading, user, signOut } = useAuth();
  const { connected, connectionState } = useWebSocketContext();
  const { isMobile, isTablet, isLaptop, isDesktop } = useMediaQuery();
  const { setCollapsed } = useSidebar();
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  const [isAddSymbolModalOpen, setAddSymbolModalOpen] = useState(false);
  const watchlistSymbols = useWatchlistStore((s) => s.symbols);
  const addSymbol = useWatchlistStore((s) => s.addSymbol);
  const removeSymbol = useWatchlistStore((s) => s.removeSymbol);

  const handleSymbolClick = useCallback(
    (symbol: string) => {
      router.push(`/charts/${symbol}`);
    },
    [router]
  );

  const handleSymbolAdd = useCallback(() => {
    setAddSymbolModalOpen(true);
  }, []);

  const handleAddSymbol = useCallback(
    (symbol: string) => {
      addSymbol(symbol);
    },
    [addSymbol]
  );

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  // Close drawer on breakpoint change
  useEffect(() => {
    if (isDesktop || isLaptop) {
      setDrawerOpen(false);
    }
  }, [isDesktop, isLaptop]);

  // Sync sidebar collapsed state with viewport size
  useEffect(() => {
    setCollapsed(isLaptop);
  }, [isLaptop, setCollapsed]);

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

  // Mobile layout: bottom nav + hamburger header
  if (isMobile) {
    return (
      <div className="flex flex-col h-screen bg-cream-50 dark:bg-night-900">
        <SkipLink />
        <GlobalLoadingIndicator />

        {/* Mobile Header */}
        <header className="h-14 border-b border-cream-200 dark:border-night-700 bg-white dark:bg-night-800 px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="p-2 -ml-2 rounded-md text-stone-600 dark:text-night-200 hover:bg-cream-100 dark:hover:bg-night-700"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <Logo className="h-6 w-auto" />
          </div>
          <div className="flex items-center gap-3">
            <ConnectionBadge connected={connected} state={connectionState} />
            <EnvBadge />
          </div>
        </header>

        {/* Ticker Strip */}
        <TickerStrip
          symbols={watchlistSymbols}
          onSymbolClick={handleSymbolClick}
          onSymbolRemove={removeSymbol}
          onSymbolAdd={handleSymbolAdd}
          showTickHistory
          allowRemove
          allowAdd
        />

        {/* Main Content - with bottom padding for nav bar */}
        <div id="main-content" className="flex-1 p-4 pb-20 overflow-auto" tabIndex={-1}>
          {children}
        </div>

        {/* Bottom Navigation */}
        <MobileNav onMoreClick={() => setDrawerOpen(true)} />

        {/* Navigation Drawer */}
        <NavDrawer
          open={isDrawerOpen}
          onClose={() => setDrawerOpen(false)}
          userEmail={user?.email}
          onSignOut={signOut}
        />

        {/* Add Symbol Modal */}
        <AddSymbolModal
          isOpen={isAddSymbolModalOpen}
          onClose={() => setAddSymbolModalOpen(false)}
          onAdd={handleAddSymbol}
          existingSymbols={watchlistSymbols}
        />
      </div>
    );
  }

  // Tablet layout: hamburger menu with overlay drawer
  if (isTablet) {
    return (
      <div className="flex flex-col h-screen bg-cream-50 dark:bg-night-900">
        <SkipLink />
        <GlobalLoadingIndicator />

        {/* Tablet Header */}
        <header className="h-14 border-b border-cream-200 dark:border-night-700 bg-white dark:bg-night-800 px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="p-2 -ml-2 rounded-md text-stone-600 dark:text-night-200 hover:bg-cream-100 dark:hover:bg-night-700"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <Logo className="h-7 w-auto" />
          </div>
          <div className="flex items-center gap-4">
            <ConnectionBadge connected={connected} state={connectionState} />
            <EnvBadge />
          </div>
        </header>

        {/* Ticker Strip */}
        <TickerStrip
          symbols={watchlistSymbols}
          onSymbolClick={handleSymbolClick}
          onSymbolRemove={removeSymbol}
          onSymbolAdd={handleSymbolAdd}
          showTickHistory
          allowRemove
          allowAdd
        />

        {/* Main Content */}
        <main id="main-content" className="flex-1 p-6 overflow-auto" tabIndex={-1}>
          {children}
        </main>

        {/* Navigation Drawer */}
        <NavDrawer
          open={isDrawerOpen}
          onClose={() => setDrawerOpen(false)}
          userEmail={user?.email}
          onSignOut={signOut}
        />

        {/* Add Symbol Modal */}
        <AddSymbolModal
          isOpen={isAddSymbolModalOpen}
          onClose={() => setAddSymbolModalOpen(false)}
          onAdd={handleAddSymbol}
          existingSymbols={watchlistSymbols}
        />
      </div>
    );
  }

  // Desktop/Laptop layout: sidebar (collapsed on laptop)
  return (
    <div className="flex h-screen bg-cream-50 dark:bg-night-900">
      <SkipLink />
      <GlobalLoadingIndicator />

      {/* Sidebar */}
      <Sidebar userEmail={user?.email} onSignOut={signOut} />

      {/* Main content */}
      <main className="flex-1 overflow-auto flex flex-col">
        {/* Header */}
        <header className="h-14 border-b border-cream-200 dark:border-night-700 bg-white dark:bg-night-800 px-6 flex items-center justify-end shrink-0">
          <div className="flex items-center gap-4">
            <ConnectionBadge connected={connected} state={connectionState} />
            <EnvBadge />
          </div>
        </header>

        {/* Ticker Strip */}
        <TickerStrip
          symbols={watchlistSymbols}
          onSymbolClick={handleSymbolClick}
          onSymbolRemove={removeSymbol}
          onSymbolAdd={handleSymbolAdd}
          showTickHistory
          allowRemove
          allowAdd
        />

        {/* Page content */}
        <div id="main-content" className="flex-1 p-6 overflow-auto" tabIndex={-1}>
          {children}
        </div>
      </main>

      {/* Add Symbol Modal */}
      <AddSymbolModal
        isOpen={isAddSymbolModalOpen}
        onClose={() => setAddSymbolModalOpen(false)}
        onAdd={handleAddSymbol}
        existingSymbols={watchlistSymbols}
      />
    </div>
  );
}

function ConnectionBadge({ connected, state }: { connected: boolean; state: string }) {
  const isConnecting = state === "connecting" || state === "reconnecting";

  if (connected) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-green-500" title="Connected" />
        <span className="text-xs text-stone-500 dark:text-night-300 hidden sm:inline">
          Connected
        </span>
      </div>
    );
  }

  if (isConnecting) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" title="Connecting" />
        <span className="text-xs text-amber-600 dark:text-amber-400 hidden sm:inline">
          Connecting
        </span>
      </div>
    );
  }

  return null;
}

function EnvBadge() {
  const env = process.env.NEXT_PUBLIC_CREAM_ENV;
  // Default to BACKTEST for local development
  const displayEnv = env && ["BACKTEST", "PAPER", "LIVE"].includes(env) ? env : "BACKTEST";
  return (
    <span className="text-xs font-medium text-stone-600 dark:text-night-200 dark:text-night-400 uppercase px-2 py-1 bg-cream-100 dark:bg-night-700 rounded">
      {displayEnv}
    </span>
  );
}
