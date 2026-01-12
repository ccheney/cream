/**
 * MobileNav Component
 *
 * Bottom navigation bar for mobile devices (<768px).
 * Shows primary navigation items with icons.
 *
 * @see docs/plans/ui/30-themes.md responsive design
 */

"use client";

import { Bot, Briefcase, FileText, Gauge, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { memo } from "react";

// ============================================
// Types
// ============================================

export interface MobileNavItem {
  href: `/${string}`;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export interface MobileNavProps {
  /** Callback when "More" is clicked */
  onMoreClick?: () => void;
  /** CSS class name */
  className?: string;
}

// ============================================
// Constants
// ============================================

const MOBILE_NAV_ITEMS: MobileNavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
  { href: "/portfolio", label: "Portfolio", icon: Briefcase },
  { href: "/decisions", label: "Decisions", icon: FileText },
  { href: "/agents", label: "Agents", icon: Bot },
];

// ============================================
// Nav Item Component
// ============================================

interface NavItemProps {
  item: MobileNavItem;
  isActive: boolean;
}

const NavItem = memo(function NavItem({ item, isActive }: NavItemProps) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href as never}
      className={`flex flex-col items-center justify-center gap-1 flex-1 py-2 transition-colors ${
        isActive ? "text-stone-900 dark:text-night-50" : "text-stone-500 dark:text-night-300"
      }`}
    >
      <Icon
        className={`w-5 h-5 ${isActive ? "text-stone-700 dark:text-night-100 dark:text-night-200" : ""}`}
      />
      <span className="text-xs font-medium">{item.label}</span>
    </Link>
  );
});

// ============================================
// Main Component
// ============================================

/**
 * MobileNav displays a fixed bottom navigation bar for mobile devices.
 *
 * @example
 * ```tsx
 * {isMobile && <MobileNav onMoreClick={() => setDrawerOpen(true)} />}
 * ```
 */
export const MobileNav = memo(function MobileNav({ onMoreClick, className = "" }: MobileNavProps) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  // Check if current page is in the more menu
  const isMoreActive = !MOBILE_NAV_ITEMS.some((item) => isActive(item.href));

  return (
    <nav
      className={`fixed bottom-0 left-0 right-0 h-16 bg-white dark:bg-night-800 border-t border-cream-200 dark:border-night-700 flex items-center z-50 safe-area-inset-bottom ${className}`}
      aria-label="Mobile navigation"
    >
      {MOBILE_NAV_ITEMS.map((item) => (
        <NavItem key={item.href} item={item} isActive={isActive(item.href)} />
      ))}

      {/* More button */}
      <button
        type="button"
        onClick={onMoreClick}
        className={`flex flex-col items-center justify-center gap-1 flex-1 py-2 transition-colors ${
          isMoreActive ? "text-stone-900 dark:text-night-50" : "text-stone-500 dark:text-night-300"
        }`}
        aria-label="More navigation options"
        aria-expanded="false"
      >
        <MoreHorizontal
          className={`w-5 h-5 ${isMoreActive ? "text-stone-700 dark:text-night-100 dark:text-night-200" : ""}`}
        />
        <span className="text-xs font-medium">More</span>
      </button>
    </nav>
  );
});

// ============================================
// Exports
// ============================================

export default MobileNav;
