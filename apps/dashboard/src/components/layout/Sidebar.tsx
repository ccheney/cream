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
	Activity,
	BarChart3,
	Beaker,
	Bot,
	Briefcase,
	CalendarDays,
	ChevronLeft,
	Cog,
	FileText,
	Grid2x2,
	LineChart,
	LogOut,
	Moon,
	RefreshCw,
	Rss,
	Settings,
	ShieldAlert,
	Sun,
	Terminal,
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

export const NAV_GROUPS: NavItem[][] = [
	[
		{ href: "/portfolio", label: "Portfolio", icon: Briefcase },
		{ href: "/charts", label: "Charts", icon: LineChart },
		{ href: "/options", label: "Options", icon: Grid2x2 },
	],
	[
		{ href: "/console", label: "Console", icon: Terminal },
		{ href: "/agents", label: "Agents", icon: Bot },
		{ href: "/decisions", label: "Decisions", icon: FileText },
		{ href: "/cycles", label: "Cycles", icon: RefreshCw },
	],
	[
		{ href: "/calendar", label: "Calendar", icon: CalendarDays },
		{ href: "/feed", label: "Feed", icon: Rss },
	],
	[
		{ href: "/workers", label: "Workers", icon: Cog },
		{ href: "/config", label: "Config", icon: Settings },
		{ href: "/observability", label: "Observability", icon: Activity },
	],
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flat();

export const EXPERIMENT_ITEMS: NavItem[] = [
	{ href: "/risk", label: "Risk", icon: ShieldAlert },
	{ href: "/indicators", label: "Indicators", icon: Beaker },
	{ href: "/theses", label: "Theses", icon: BarChart3 },
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
					? "bg-cream-100 dark:bg-night-700 text-stone-900 dark:text-night-50 font-medium"
					: "text-stone-700 dark:text-night-100 hover:bg-cream-100 dark:hover:bg-night-700"
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
						className="p-1.5 rounded-md text-stone-500 dark:text-night-400 hover:text-stone-700 dark:hover:text-night-100 hover:bg-cream-100 dark:hover:bg-night-700 transition-colors"
						title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
					>
						<ChevronLeft
							className={`w-4 h-4 transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`}
						/>
					</button>
				)}
			</div>

			<nav className="flex-1 mt-4 px-2 overflow-y-auto flex flex-col" aria-label="Main navigation">
				<div className="space-y-1">
					{NAV_GROUPS.map((group, groupIndex) => (
						<div key={group[0]?.href ?? `nav-group-${groupIndex}`}>
							{groupIndex > 0 && (
								<div className="my-2 mx-3 border-t border-cream-200 dark:border-night-700" />
							)}
							{group.map((item) => (
								<NavLink key={item.href} item={item} collapsed={collapsed} isHovered={isHovered} />
							))}
						</div>
					))}
				</div>

				<div className="mt-auto pt-4">
					<div className="border-t border-cream-200 dark:border-night-700 pt-4">
						{showLabel && (
							<div className="px-3 mb-2 text-xs font-medium text-stone-400 dark:text-night-400 uppercase tracking-wider">
								Experiments
							</div>
						)}
						<div className="space-y-1">
							{EXPERIMENT_ITEMS.map((item) => (
								<NavLink key={item.href} item={item} collapsed={collapsed} isHovered={isHovered} />
							))}
						</div>
					</div>
				</div>
			</nav>

			<div className="p-4 border-t border-cream-200 dark:border-night-700">
				{!collapsed || isHovered ? (
					<div className="flex items-center justify-between gap-2">
						{userEmail ? (
							<div className="text-xs text-stone-500 dark:text-night-300 truncate flex-1">
								{userEmail}
							</div>
						) : (
							<div className="flex-1" />
						)}
						<div className="flex items-center gap-1">
							<button
								type="button"
								onClick={toggleTheme}
								className="p-1.5 rounded-md text-stone-500 dark:text-night-300 hover:bg-cream-100 dark:hover:bg-night-700 hover:text-stone-700 dark:hover:text-night-100 transition-colors"
								title={resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
							>
								{resolvedTheme === "dark" ? (
									<Sun className="w-4 h-4" />
								) : (
									<Moon className="w-4 h-4" />
								)}
							</button>
							{onSignOut && (
								<button
									type="button"
									onClick={onSignOut}
									className="p-1.5 rounded-md text-stone-500 dark:text-night-300 hover:bg-cream-100 dark:hover:bg-night-700 hover:text-stone-700 dark:hover:text-night-100 transition-colors"
									title="Sign out"
								>
									<LogOut className="w-4 h-4" />
								</button>
							)}
						</div>
					</div>
				) : (
					<div className="flex flex-col items-center gap-2">
						{userEmail && (
							<div className="w-8 h-8 rounded-full bg-cream-200 dark:bg-night-600 flex items-center justify-center">
								<span className="text-xs font-medium text-stone-600 dark:text-night-300">
									{userEmail.charAt(0).toUpperCase()}
								</span>
							</div>
						)}
						<button
							type="button"
							onClick={toggleTheme}
							className="p-1.5 rounded-md text-stone-500 dark:text-night-300 hover:bg-cream-100 dark:hover:bg-night-700 hover:text-stone-700 dark:hover:text-night-100 transition-colors"
							title={resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
						>
							{resolvedTheme === "dark" ? (
								<Sun className="w-4 h-4" />
							) : (
								<Moon className="w-4 h-4" />
							)}
						</button>
					</div>
				)}
			</div>
		</aside>
	);
});

export default Sidebar;
