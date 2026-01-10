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
  ChevronLeft,
  FileText,
  FlaskConical,
  Gauge,
  Grid2x2,
  LineChart,
  LogOut,
  Moon,
  Rss,
  Settings,
  ShieldAlert,
  Sun,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { memo, useState } from "react";
import { Logo } from "@/components/ui/logo";
import { useEventFeedStore } from "@/stores/event-feed-store";
import { usePreferencesStore } from "@/stores/preferences-store";
import { useSidebar } from "@/stores/ui-store";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export interface SidebarProps {
  /** User email to display */
  userEmail?: string;
  /** Sign out handler */
  onSignOut?: () => void;
  /** CSS class name */
  className?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
  { href: "/decisions", label: "Decisions", icon: FileText },
  { href: "/portfolio", label: "Portfolio", icon: Briefcase },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/charts", label: "Charts", icon: LineChart },
  { href: "/options", label: "Options", icon: Grid2x2 },
  { href: "/risk", label: "Risk", icon: ShieldAlert },
  { href: "/backtest", label: "Backtest", icon: FlaskConical },
  { href: "/theses", label: "Theses", icon: BarChart3 },
  { href: "/config", label: "Config", icon: Settings },
  { href: "/feed", label: "Feed", icon: Rss },
];

const SIDEBAR_WIDTH = 240;
const COLLAPSED_WIDTH = 64;

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
  const newEventCount = useEventFeedStore((s) => s.newEventCount);
  const showFeedBadge = item.href === "/feed" && newEventCount > 0 && !isActive;

  return (
    <Link
      href={item.href as never}
      className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
        isActive
          ? "bg-cream-100 dark:bg-night-700 text-cream-900 dark:text-cream-100 font-medium"
          : "text-cream-700 dark:text-cream-300 hover:bg-cream-100 dark:hover:bg-night-700"
      }`}
      title={collapsed && !isHovered ? item.label : undefined}
    >
      <div className="relative flex-shrink-0">
        <Icon className="w-5 h-5" />
        {showFeedBadge && collapsed && !isHovered && (
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-500 rounded-full" />
        )}
      </div>
      {showLabel && (
        <>
          <span className="truncate">{item.label}</span>
          {showFeedBadge && (
            <span className="ml-auto px-1.5 py-0.5 text-xs font-mono bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 rounded">
              {newEventCount > 99 ? "99+" : newEventCount}
            </span>
          )}
        </>
      )}
    </Link>
  );
});

export const Sidebar = memo(function Sidebar({
  userEmail,
  onSignOut,
  className = "",
}: SidebarProps) {
  const { collapsed, toggle: toggleSidebar } = useSidebar();
  const [isHovered, setIsHovered] = useState(false);
  const resolvedTheme = usePreferencesStore((s) => s.getComputedTheme());
  const updateDisplay = usePreferencesStore((s) => s.updateDisplay);

  const toggleTheme = () => {
    updateDisplay({ theme: resolvedTheme === "dark" ? "light" : "dark" });
  };

  const width = collapsed && !isHovered ? COLLAPSED_WIDTH : SIDEBAR_WIDTH;
  const showLabel = !collapsed || isHovered;

  return (
    <aside
      className={`border-r border-cream-200 dark:border-night-700 bg-white dark:bg-night-800 flex flex-col transition-all duration-200 ${className}`}
      style={{ width }}
      onMouseEnter={() => collapsed && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="p-4 border-b border-cream-200 dark:border-night-700 flex items-center justify-between h-14">
        <div className="flex items-center gap-3">
          <Logo className="h-8 w-8 flex-shrink-0" />
        </div>
        {showLabel && (
          <button
            type="button"
            onClick={toggleSidebar}
            className="p-1.5 rounded-md text-cream-500 hover:text-cream-700 dark:text-cream-400 dark:hover:text-cream-200 hover:bg-cream-100 dark:hover:bg-night-700 transition-colors"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <ChevronLeft
              className={`w-4 h-4 transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`}
            />
          </button>
        )}
      </div>

      <nav className="flex-1 mt-4 px-2 space-y-1 overflow-y-auto" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} collapsed={collapsed} isHovered={isHovered} />
        ))}
      </nav>

      <div className="px-2 mb-2">
        <button
          type="button"
          onClick={toggleTheme}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm w-full text-cream-700 dark:text-cream-300 hover:bg-cream-100 dark:hover:bg-night-700 transition-colors"
          title={resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {resolvedTheme === "dark" ? (
            <Sun className="w-5 h-5 flex-shrink-0" />
          ) : (
            <Moon className="w-5 h-5 flex-shrink-0" />
          )}
          {showLabel && (
            <span className="truncate">
              {resolvedTheme === "dark" ? "Light Mode" : "Dark Mode"}
            </span>
          )}
        </button>
      </div>

      {userEmail && (
        <div className="p-4 border-t border-cream-200 dark:border-night-700">
          {!collapsed || isHovered ? (
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

export default Sidebar;
