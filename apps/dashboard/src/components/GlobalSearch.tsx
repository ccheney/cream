"use client";

/**
 * Global Search Component
 *
 * Command palette for global fuzzy search across all entities.
 * Opens with Cmd+K (Mac) or Ctrl+K (Windows/Linux).
 *
 * @see docs/plans/46-postgres-drizzle-migration.md
 */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type CommandItem, CommandPalette } from "@/components/ui/command-palette";
import { type SearchResult, useGlobalSearch } from "@/hooks/queries";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";

// ============================================
// Icon Components
// ============================================

function SearchIcon() {
	return (
		<svg
			className="w-4 h-4"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			aria-hidden="true"
		>
			<circle cx="11" cy="11" r="8" />
			<path d="m21 21-4.35-4.35" />
		</svg>
	);
}

function ChartIcon() {
	return (
		<svg
			className="w-4 h-4"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			aria-hidden="true"
		>
			<path d="M3 3v18h18" />
			<path d="m18.7 8-5.1 5.2-2.8-2.7L7 14.3" />
		</svg>
	);
}

function NavigationIcon() {
	return (
		<svg
			className="w-4 h-4"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			aria-hidden="true"
		>
			<rect width="18" height="18" x="3" y="3" rx="2" />
			<path d="M3 9h18" />
		</svg>
	);
}

function DecisionIcon() {
	return (
		<svg
			className="w-4 h-4"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			aria-hidden="true"
		>
			<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
			<path d="m9 11 3 3L22 4" />
		</svg>
	);
}

function ThesisIcon() {
	return (
		<svg
			className="w-4 h-4"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			aria-hidden="true"
		>
			<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
			<path d="M14 2v6h6" />
			<path d="M16 13H8" />
			<path d="M16 17H8" />
			<path d="M10 9H8" />
		</svg>
	);
}

function AlertIcon() {
	return (
		<svg
			className="w-4 h-4"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			aria-hidden="true"
		>
			<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
			<path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
		</svg>
	);
}

// ============================================
// Helpers
// ============================================

function getIconForType(type: SearchResult["type"]) {
	switch (type) {
		case "symbol":
			return <ChartIcon />;
		case "navigation":
			return <NavigationIcon />;
		case "decision":
			return <DecisionIcon />;
		case "thesis":
			return <ThesisIcon />;
		case "alert":
			return <AlertIcon />;
		default:
			return <SearchIcon />;
	}
}

function getGroupForType(type: SearchResult["type"]): string {
	switch (type) {
		case "navigation":
			return "Navigation";
		case "symbol":
			return "Symbols";
		case "decision":
			return "Decisions";
		case "thesis":
			return "Theses";
		case "alert":
			return "Alerts";
		default:
			return "Results";
	}
}

// ============================================
// Main Component
// ============================================

export function GlobalSearch() {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const debouncedSearch = useDebouncedValue(search, 200);

	const { data, isLoading } = useGlobalSearch(debouncedSearch);

	// Handle keyboard shortcut
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "k") {
				e.preventDefault();
				setOpen(true);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	// Transform search results to command items
	const commands = useMemo((): CommandItem[] => {
		if (!data?.results) {
			return [];
		}

		return data.results.map((result) => ({
			id: result.id,
			label: result.title,
			description: result.subtitle ?? undefined,
			group: getGroupForType(result.type),
			icon: getIconForType(result.type),
			onSelect: () => {
				router.push(result.url);
			},
		}));
	}, [data?.results, router]);

	const handleOpenChange = useCallback((newOpen: boolean) => {
		setOpen(newOpen);
		if (!newOpen) {
			setSearch("");
		}
	}, []);

	return (
		<CommandPalette
			open={open}
			onOpenChange={handleOpenChange}
			commands={commands}
			placeholder="Search anything... (symbols, pages, decisions)"
			emptyMessage={search.length < 2 ? "Type at least 2 characters to search" : "No results found"}
			loading={isLoading}
		/>
	);
}

export default GlobalSearch;
