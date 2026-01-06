/**
 * Sidebar Component
 *
 * Responsive sidebar navigation with collapse behavior.
 * - Desktop (≥1280px): Full sidebar (240px) with icons + labels
 * - Laptop (1024-1279px): Collapsed sidebar (64px), expand on hover
 *
 * @see docs/plans/ui/30-themes.md responsive design
 */

"use client";

import {
  BarChart3,
  Bot,
  Briefcase,
  FileText,
  FlaskConical,
  Gauge,
  LineChart,
  Rss,
  Settings,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { memo, useState } from "react";
import { Logo } from "@/components/ui/logo";

// ============================================
// Types
// ============================================

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export interface SidebarProps {
  /** Whether sidebar is collapsed (icons only) */
  collapsed?: boolean;
  /** User email to display */
  userEmail?: string;
  /** CSS class name */
  className?: string;
}

// ============================================
// Constants
// ============================================

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
  { href: "/decisions", label: "Decisions", icon: FileText },
  { href: "/portfolio", label: "Portfolio", icon: Briefcase },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/charts", label: "Charts", icon: LineChart },
  { href: "/risk", label: "Risk", icon: ShieldAlert },
  { href: "/backtest", label: "Backtest", icon: FlaskConical },
  { href: "/theses", label: "Theses", icon: BarChart3 },
  { href: "/config", label: "Config", icon: Settings },
  { href: "/feed", label: "Feed", icon: Rss },
];

const SIDEBAR_WIDTH = 240;
const COLLAPSED_WIDTH = 64;

// ============================================
// Nav Link Component
// ============================================

interface NavLinkProps {
  item: NavItem;
  collapsed: boolean;
  isHovered: boolean;
}

const NavLink = memo(function NavLink({ item, collapsed, isHovered }: NavLinkProps) {
  const pathname = usePathname();
  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;
  const showLabel = !collapsed || isHovered;

  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
        isActive
          ? "bg-cream-100 dark:bg-night-700 text-cream-900 dark:text-cream-100 font-medium"
          : "text-cream-700 dark:text-cream-300 hover:bg-cream-100 dark:hover:bg-night-700"
      }`}
      title={collapsed && !isHovered ? item.label : undefined}
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      {showLabel && <span className="truncate">{item.label}</span>}
    </Link>
  );
});

// ============================================
// Main Component
// ============================================

/**
 * Sidebar navigation with responsive collapse behavior.
 *
 * @example
 * ```tsx
 * <Sidebar collapsed={isLaptop} userEmail={user.email} />
 * ```
 */
export const Sidebar = memo(function Sidebar({
  collapsed = false,
  userEmail,
  className = "",
}: SidebarProps) {
  const [isHovered, setIsHovered] = useState(false);

  const width = collapsed && !isHovered ? COLLAPSED_WIDTH : SIDEBAR_WIDTH;

  return (
    <aside
      className={`border-r border-cream-200 dark:border-night-700 bg-white dark:bg-night-800 flex flex-col transition-all duration-200 ${className}`}
      style={{ width }}
      onMouseEnter={() => collapsed && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Logo */}
      <div className="p-4 border-b border-cream-200 dark:border-night-700 flex items-center gap-3 h-14">
        <Logo className="h-8 w-8 flex-shrink-0" />
        {(!collapsed || isHovered) && (
          <span className="font-semibold text-cream-900 dark:text-cream-100 truncate">Cream</span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 mt-4 px-2 space-y-1 overflow-y-auto" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} collapsed={collapsed} isHovered={isHovered} />
        ))}
      </nav>

      {/* User info */}
      {userEmail && (
        <div className="p-4 border-t border-cream-200 dark:border-night-700">
          {!collapsed || isHovered ? (
            <div className="text-xs text-cream-500 dark:text-cream-400 truncate">{userEmail}</div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-cream-200 dark:bg-night-600 flex items-center justify-center">
              <span className="text-xs font-medium text-cream-600 dark:text-cream-300">
                {userEmail.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>
      )}
    </aside>
  );
});

// ============================================
// Exports
// ============================================

export default Sidebar;
