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
import { NAV_ITEMS, type NavItem } from "./Sidebar";

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

interface DrawerEffectDependencies {
	open: boolean;
	onClose: () => void;
}

function isNavItemActive(pathname: string, href: string) {
	return pathname === href || pathname.startsWith(`${href}/`);
}

function useDrawerEffects({ open, onClose }: DrawerEffectDependencies) {
	const closeButtonRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape" && open) {
				onClose();
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [open, onClose]);

	useEffect(() => {
		if (open && closeButtonRef.current) {
			closeButtonRef.current.focus();
		}
	}, [open]);

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

	return { closeButtonRef };
}

interface NavLinkProps {
	item: NavItem;
	isActive: boolean;
	onNavClick: () => void;
}

const NavLink = memo(function NavLink({ item, isActive, onNavClick }: NavLinkProps) {
	const Icon = item.icon;

	return (
		<Link
			href={item.href as never}
			onClick={onNavClick}
			className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
				isActive
					? "bg-cream-100 dark:bg-night-700 text-stone-900 dark:text-night-50 font-medium"
					: "text-stone-700 dark:text-night-100 hover:bg-cream-100 dark:hover:bg-night-700"
			}`}
		>
			<Icon className="w-5 h-5" />
			<span>{item.label}</span>
		</Link>
	);
});

interface NavLinkGroupProps {
	links: NavItem[];
	isItemActive: (href: string) => boolean;
	onNavClick: () => void;
}

function NavLinkGroup({ links, isItemActive, onNavClick }: NavLinkGroupProps) {
	return (
		<>
			{links.map((item) => (
				<NavLink
					key={item.href}
					item={item}
					isActive={isItemActive(item.href)}
					onNavClick={onNavClick}
				/>
			))}
		</>
	);
}

interface NavFooterProps {
	userEmail?: string;
	onSignOut?: () => void;
}

interface NavDrawerHeaderProps {
	onClose: () => void;
	closeButtonRef: React.RefObject<HTMLButtonElement>;
}

function NavDrawerHeader({ onClose, closeButtonRef }: NavDrawerHeaderProps) {
	return (
		<div className="flex items-center justify-between p-4 border-b border-cream-200 dark:border-night-700">
			<div className="flex items-center gap-3">
				<Logo className="h-8 w-8" />
			</div>
			<button
				ref={closeButtonRef}
				type="button"
				onClick={onClose}
				className="p-2 rounded-md text-stone-500 dark:text-night-300 hover:bg-cream-100 dark:hover:bg-night-700 transition-colors"
				aria-label="Close navigation menu"
			>
				<X className="w-5 h-5" />
			</button>
		</div>
	);
}

function NavDrawerFooter({ userEmail, onSignOut }: NavFooterProps) {
	if (!userEmail && !onSignOut) {
		return null;
	}

	return (
		<div className="p-4 border-t border-cream-200 dark:border-night-700">
			<div className="flex items-center justify-between gap-2">
				{userEmail ? (
					<div className="text-xs text-stone-500 dark:text-night-300 truncate flex-1">
						{userEmail}
					</div>
				) : (
					<div className="flex-1" />
				)}
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
	);
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
	const isItemActive = (href: string) => isNavItemActive(pathname, href);
	const { closeButtonRef } = useDrawerEffects({ open, onClose });

	// Close drawer on navigation
	const handleNavClick = useCallback(() => {
		onClose();
	}, [onClose]);

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
				<NavDrawerHeader onClose={onClose} closeButtonRef={closeButtonRef} />

				{/* Navigation */}
				<nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto" aria-label="Main navigation">
					<NavLinkGroup links={NAV_ITEMS} isItemActive={isItemActive} onNavClick={handleNavClick} />
				</nav>
				<NavDrawerFooter userEmail={userEmail} onSignOut={onSignOut} />
			</div>
		</div>
	);
});

// ============================================
// Exports
// ============================================

export default NavDrawer;
