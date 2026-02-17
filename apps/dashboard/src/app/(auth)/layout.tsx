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
import { useCallback, useEffect, useRef, useState } from "react";
import { GlobalSearch } from "@/components/GlobalSearch";
import { MobileNav, NavDrawer, Sidebar } from "@/components/layout";
import { AddSymbolModal } from "@/components/ui/add-symbol-modal";
import { GlobalLoadingIndicator } from "@/components/ui/GlobalLoadingIndicator";
import { Logo } from "@/components/ui/logo";
import { SkipLink } from "@/components/ui/skip-link";
import { Spinner } from "@/components/ui/spinner";
import { TickerStrip } from "@/components/ui/ticker-strip";
import { useAuth } from "@/contexts/AuthContext";
import { useMarketBell } from "@/hooks/useMarketBell";
import { useMarketTheme } from "@/hooks/useMarketTheme";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { useWebSocketContext } from "@/providers/WebSocketProvider";
import { useSidebar } from "@/stores/ui-store";
import { useWatchlistStore } from "@/stores/watchlist-store";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
	const model = useAuthLayoutModel();

	if (model.isLoading) {
		return <LoadingScreen />;
	}
	if (!model.isAuthenticated) {
		return null;
	}
	if (model.isMobile) {
		return (
			<ResponsiveAuthLayout model={model} mobile>
				{children}
			</ResponsiveAuthLayout>
		);
	}
	if (model.isTablet) {
		return <ResponsiveAuthLayout model={model}>{children}</ResponsiveAuthLayout>;
	}
	return <DesktopAuthLayout model={model}>{children}</DesktopAuthLayout>;
}

function useAuthLayoutModel() {
	const router = useRouter();
	const { isAuthenticated, isLoading, user, signOut } = useAuth();
	const { connected, connectionState } = useWebSocketContext();
	const { isMobile, isTablet, isLaptop, isDesktop } = useMediaQuery();
	const { setCollapsed } = useSidebar();
	const sidebarInitialized = useRef(false);
	const [isDrawerOpen, setDrawerOpen] = useState(false);
	const [isAddSymbolModalOpen, setAddSymbolModalOpen] = useState(false);
	const watchlistSymbols = useWatchlistStore((state) => state.symbols);
	const addSymbol = useWatchlistStore((state) => state.addSymbol);
	const removeSymbol = useWatchlistStore((state) => state.removeSymbol);

	useMarketBell();
	useMarketTheme();
	useAuthLayoutEffects(
		isLoading,
		isAuthenticated,
		router,
		isDesktop,
		isLaptop,
		setDrawerOpen,
		sidebarInitialized,
		setCollapsed,
	);

	const actions = useAuthLayoutActions(router, addSymbol, setAddSymbolModalOpen, setDrawerOpen);

	return {
		...actions,
		connected,
		connectionState,
		isAddSymbolModalOpen,
		isAuthenticated,
		isDesktop,
		isDrawerOpen,
		isLaptop,
		isLoading,
		isMobile,
		isTablet,
		removeSymbol,
		signOut,
		user,
		watchlistSymbols,
	};
}

function useAuthLayoutActions(
	router: ReturnType<typeof useRouter>,
	addSymbol: (symbol: string) => void,
	setAddSymbolModalOpen: React.Dispatch<React.SetStateAction<boolean>>,
	setDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>,
) {
	const handleSymbolClick = useCallback(
		(symbol: string) => router.push(`/charts/${symbol}`),
		[router],
	);
	const handleAddSymbol = useCallback((symbol: string) => addSymbol(symbol), [addSymbol]);

	return {
		addSymbol: handleAddSymbol,
		handleSymbolClick,
		openAddSymbolModal: () => setAddSymbolModalOpen(true),
		openDrawer: () => setDrawerOpen(true),
		closeAddSymbolModal: () => setAddSymbolModalOpen(false),
		closeDrawer: () => setDrawerOpen(false),
	};
}

function useAuthLayoutEffects(
	isLoading: boolean,
	isAuthenticated: boolean,
	router: ReturnType<typeof useRouter>,
	isDesktop: boolean,
	isLaptop: boolean,
	setDrawerOpen: (open: boolean) => void,
	sidebarInitialized: React.MutableRefObject<boolean>,
	setCollapsed: (collapsed: boolean) => void,
) {
	useEffect(() => {
		if (!isLoading && !isAuthenticated) {
			router.push("/login");
		}
	}, [isAuthenticated, isLoading, router]);

	useEffect(() => {
		if (isDesktop || isLaptop) {
			setDrawerOpen(false);
		}
	}, [isDesktop, isLaptop, setDrawerOpen]);

	useEffect(() => {
		if (sidebarInitialized.current) {
			return;
		}
		sidebarInitialized.current = true;
		setCollapsed(isLaptop);
	}, [isLaptop, setCollapsed, sidebarInitialized]);
}

type LayoutModel = ReturnType<typeof useAuthLayoutModel>;

function LoadingScreen() {
	return (
		<div className="flex h-screen items-center justify-center bg-cream-50 dark:bg-night-900">
			<Spinner size="lg" />
		</div>
	);
}

function ResponsiveAuthLayout({
	children,
	mobile = false,
	model,
}: {
	children: React.ReactNode;
	mobile?: boolean;
	model: LayoutModel;
}) {
	return (
		<div className="flex flex-col h-screen bg-cream-50 dark:bg-night-900">
			<SkipLink />
			<GlobalLoadingIndicator />
			<ResponsiveHeader mobile={mobile} model={model} />
			<TickerSection model={model} />
			<main
				id="main-content"
				className={mobile ? "flex-1 p-4 pb-20 overflow-auto" : "flex-1 p-6 overflow-auto"}
				tabIndex={-1}
			>
				{children}
			</main>
			{mobile && <MobileNav onMoreClick={model.openDrawer} />}
			<SharedOverlays model={model} />
		</div>
	);
}

function ResponsiveHeader({ mobile, model }: { mobile: boolean; model: LayoutModel }) {
	return (
		<header className="h-14 border-b border-cream-200 dark:border-night-700 bg-white dark:bg-night-800 px-4 flex items-center justify-between shrink-0">
			<div className="flex items-center gap-3">
				<button
					type="button"
					onClick={model.openDrawer}
					className="p-2 -ml-2 rounded-md text-stone-600 dark:text-night-200 hover:bg-cream-100 dark:hover:bg-night-700"
					aria-label="Open navigation menu"
				>
					<Menu className="w-5 h-5" />
				</button>
				<Logo className={mobile ? "h-6 w-auto" : "h-7 w-auto"} />
			</div>
			<div className="flex items-center gap-4">
				<ConnectionBadge connected={model.connected} state={model.connectionState} />
				<EnvBadge />
			</div>
		</header>
	);
}

function DesktopAuthLayout({ children, model }: { children: React.ReactNode; model: LayoutModel }) {
	return (
		<div className="flex h-screen bg-cream-50 dark:bg-night-900">
			<SkipLink />
			<GlobalLoadingIndicator />
			<Sidebar userEmail={model.user?.email} onSignOut={model.signOut} />
			<main className="flex-1 overflow-auto flex flex-col">
				<header className="h-14 border-b border-cream-200 dark:border-night-700 bg-white dark:bg-night-800 px-6 flex items-center justify-end shrink-0">
					<div className="flex items-center gap-4">
						<ConnectionBadge connected={model.connected} state={model.connectionState} />
						<EnvBadge />
					</div>
				</header>
				<TickerSection model={model} />
				<div id="main-content" className="flex-1 p-6 overflow-auto" tabIndex={-1}>
					{children}
				</div>
			</main>
			<AddSymbolModalShell model={model} />
			<GlobalSearch />
		</div>
	);
}

function TickerSection({ model }: { model: LayoutModel }) {
	return (
		<TickerStrip
			symbols={model.watchlistSymbols}
			onSymbolClick={model.handleSymbolClick}
			onSymbolRemove={model.removeSymbol}
			onSymbolAdd={model.openAddSymbolModal}
			showTickHistory
			allowRemove
			allowAdd
		/>
	);
}

function AddSymbolModalShell({ model }: { model: LayoutModel }) {
	return (
		<AddSymbolModal
			isOpen={model.isAddSymbolModalOpen}
			onClose={model.closeAddSymbolModal}
			onAdd={model.addSymbol}
			existingSymbols={model.watchlistSymbols}
		/>
	);
}

function SharedOverlays({ model }: { model: LayoutModel }) {
	return (
		<>
			<NavDrawer
				open={model.isDrawerOpen}
				onClose={model.closeDrawer}
				userEmail={model.user?.email}
				onSignOut={model.signOut}
			/>
			<AddSymbolModalShell model={model} />
			<GlobalSearch />
		</>
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
	return (
		<span className="text-xs font-medium text-stone-600 dark:text-night-200 dark:text-night-400 uppercase px-2 py-1 bg-cream-100 dark:bg-night-700 rounded">
			{env}
		</span>
	);
}
