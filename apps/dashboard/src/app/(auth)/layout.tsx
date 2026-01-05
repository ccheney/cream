/**
 * Auth Layout - Wraps all authenticated routes
 *
 * This layout provides:
 * - Authentication guard (to be implemented)
 * - Sidebar navigation
 * - Header with connection status
 */

import { Suspense } from "react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-cream-50 dark:bg-night-900">
      {/* Sidebar - to be implemented in cream-87md (design system) */}
      <aside className="w-64 border-r border-cream-200 dark:border-night-700 bg-white dark:bg-night-800">
        <div className="p-4">
          <h2 className="text-lg font-semibold text-cream-900 dark:text-cream-100">Cream</h2>
        </div>
        <nav className="mt-4 px-2 space-y-1">
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
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {/* Header - to include connection status (cream-s8h9) */}
        <header className="h-14 border-b border-cream-200 dark:border-night-700 bg-white dark:bg-night-800 px-6 flex items-center justify-between">
          <div className="text-sm text-cream-600 dark:text-cream-400">
            {/* Breadcrumb or page title */}
          </div>
          <div className="flex items-center gap-4">
            {/* Connection status indicator - cream-s8h9 */}
            <div className="w-2 h-2 rounded-full bg-green-500" title="Connected" />
            <span className="text-sm text-cream-600 dark:text-cream-400">PAPER</span>
          </div>
        </header>

        {/* Page content with Suspense boundary */}
        <Suspense fallback={<LoadingFallback />}>
          <div className="p-6">{children}</div>
        </Suspense>
      </main>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="block px-3 py-2 rounded-md text-sm text-cream-700 dark:text-cream-300 hover:bg-cream-100 dark:hover:bg-night-700 transition-colors"
    >
      {children}
    </a>
  );
}

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-pulse text-cream-400">Loading...</div>
    </div>
  );
}
