/**
 * NavDrawer Component
 *
 * Slide-in navigation drawer for tablet/mobile views.
 * Accessed via hamburger menu on tablet or "More" on mobile.
 *
 * @see docs/plans/ui/30-themes.md responsive design
 */

"use client";

import { LogOut, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { memo, useCallback, useEffect, useRef } from "react";
import { Logo } from "@/components/ui/logo";
import { NAV_ITEMS } from "./Sidebar";

// ============================================
// Types
// ============================================

export interface NavDrawerProps {
  /** Whether drawer is open */
  open: boolean;
  /** Callback to close drawer */
  onClose: () => void;
  /** User email to display */
  userEmail?: string;
  /** Sign out handler */
  onSignOut?: () => void;
}

// ============================================
// Main Component
// ============================================

/**
 * NavDrawer displays a slide-in navigation overlay.
 *
 * @example
 * ```tsx
 * <NavDrawer
 *   open={isDrawerOpen}
 *   onClose={() => setDrawerOpen(false)}
 *   userEmail={user.email}
 * />
 * ```
 */
export const NavDrawer = memo(function NavDrawer({
  open,
  onClose,
  userEmail,
  onSignOut,
}: NavDrawerProps) {
  const pathname = usePathname();
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // Focus trap and focus management
  useEffect(() => {
    if (open && closeButtonRef.current) {
      closeButtonRef.current.focus();
    }
  }, [open]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Close drawer on navigation
  const handleNavClick = useCallback(() => {
    onClose();
  }, [onClose]);

  const isActive = (href: string) => {
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className="absolute top-0 left-0 h-full w-72 bg-white dark:bg-night-800 shadow-xl transform transition-transform animate-slide-in-left"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-cream-200 dark:border-night-700">
          <div className="flex items-center gap-3">
            <Logo className="h-8 w-8" />
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="p-2 rounded-md text-cream-500 hover:bg-cream-100 dark:hover:bg-night-700 transition-colors"
            aria-label="Close navigation menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <Link
                key={item.href}
                href={item.href as never}
                onClick={handleNavClick}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                  active
                    ? "bg-cream-100 dark:bg-night-700 text-cream-900 dark:text-cream-100 font-medium"
                    : "text-cream-700 dark:text-cream-300 hover:bg-cream-100 dark:hover:bg-night-700"
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User info */}
        {userEmail && (
          <div className="p-4 border-t border-cream-200 dark:border-night-700">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-cream-500 dark:text-cream-400 truncate flex-1">
                {userEmail}
              </div>
              {onSignOut && (
                <button
                  type="button"
                  onClick={onSignOut}
                  className="p-1.5 rounded-md text-cream-500 dark:text-cream-400 hover:bg-cream-100 dark:hover:bg-night-700 hover:text-cream-700 dark:hover:text-cream-200 transition-colors"
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

// ============================================
// Exports
// ============================================

export default NavDrawer;
