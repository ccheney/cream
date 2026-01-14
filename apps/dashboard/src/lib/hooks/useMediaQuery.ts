/**
 * useMediaQuery Hook
 *
 * Responsive breakpoint detection with SSR support.
 *
 * @see docs/plans/ui/30-themes.md responsive design
 */

"use client";

import { useEffect, useState } from "react";

// ============================================
// Types
// ============================================

export type Breakpoint = "mobile" | "tablet" | "laptop" | "desktop";

export interface UseMediaQueryReturn {
	/** Current breakpoint name */
	breakpoint: Breakpoint;
	/** True if mobile (<768px) */
	isMobile: boolean;
	/** True if tablet (768-1023px) */
	isTablet: boolean;
	/** True if laptop (1024-1279px) */
	isLaptop: boolean;
	/** True if desktop (≥1280px) */
	isDesktop: boolean;
	/** True if touch device */
	isTouch: boolean;
}

// ============================================
// Constants
// ============================================

export const BREAKPOINTS = {
	mobile: 0,
	tablet: 768,
	laptop: 1024,
	desktop: 1280,
} as const;

// ============================================
// Hook
// ============================================

/**
 * Hook for responsive breakpoint detection.
 *
 * @example
 * ```tsx
 * function Layout() {
 *   const { isMobile, isDesktop, breakpoint } = useMediaQuery();
 *
 *   if (isMobile) {
 *     return <MobileLayout />;
 *   }
 *
 *   return <DesktopLayout />;
 * }
 * ```
 */
export function useMediaQuery(): UseMediaQueryReturn {
	// Default to desktop for SSR
	const [state, setState] = useState<UseMediaQueryReturn>({
		breakpoint: "desktop",
		isMobile: false,
		isTablet: false,
		isLaptop: false,
		isDesktop: true,
		isTouch: false,
	});

	useEffect(() => {
		const getBreakpoint = (width: number): Breakpoint => {
			if (width < BREAKPOINTS.tablet) {
				return "mobile";
			}
			if (width < BREAKPOINTS.laptop) {
				return "tablet";
			}
			if (width < BREAKPOINTS.desktop) {
				return "laptop";
			}
			return "desktop";
		};

		const update = () => {
			const width = window.innerWidth;
			const breakpoint = getBreakpoint(width);
			const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;

			setState({
				breakpoint,
				isMobile: breakpoint === "mobile",
				isTablet: breakpoint === "tablet",
				isLaptop: breakpoint === "laptop",
				isDesktop: breakpoint === "desktop",
				isTouch,
			});
		};

		// Initial update
		update();

		// Listen for resize
		window.addEventListener("resize", update);
		return () => window.removeEventListener("resize", update);
	}, []);

	return state;
}

/**
 * Hook for single media query match.
 *
 * @example
 * ```tsx
 * const prefersDark = useMatchMedia("(prefers-color-scheme: dark)");
 * ```
 */
export function useMatchMedia(query: string): boolean {
	const [matches, setMatches] = useState(false);

	useEffect(() => {
		const mediaQuery = window.matchMedia(query);
		setMatches(mediaQuery.matches);

		const handler = (event: MediaQueryListEvent) => {
			setMatches(event.matches);
		};

		mediaQuery.addEventListener("change", handler);
		return () => mediaQuery.removeEventListener("change", handler);
	}, [query]);

	return matches;
}

// ============================================
// Exports
// ============================================

export default useMediaQuery;
