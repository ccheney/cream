/**
 * Options Chain Page - Symbol Selector
 *
 * Landing page for options chain view. Allows selecting an underlying symbol.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 2.1
 */

"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { useWatchlistStore } from "@/stores/watchlist-store";

export default function OptionsPage() {
	const router = useRouter();
	const watchlistSymbols = useWatchlistStore((s) => s.symbols);
	const [searchValue, setSearchValue] = useState("");
	const [isNavigating, setIsNavigating] = useState(false);

	const handleSymbolSelect = useCallback(
		(symbol: string) => {
			setIsNavigating(true);
			router.push(`/options/${symbol.toUpperCase()}`);
		},
		[router],
	);

	const handleSearchSubmit = useCallback(
		(e: React.FormEvent) => {
			e.preventDefault();
			if (searchValue.trim()) {
				handleSymbolSelect(searchValue.trim());
			}
		},
		[searchValue, handleSymbolSelect],
	);

	return (
		<div className="space-y-6">
			<h1 className="text-2xl font-semibold text-stone-700 dark:text-night-50">Options</h1>

			{/* Search */}
			<form onSubmit={handleSearchSubmit}>
				<div className="relative">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400 dark:text-night-400" />
					<input
						type="text"
						value={searchValue}
						onChange={(e) => setSearchValue(e.target.value.toUpperCase())}
						placeholder="Enter symbol (e.g., AAPL, SPY, NVDA)"
						className="
              w-full pl-10 pr-4 py-3
              bg-white dark:bg-night-800
              border border-cream-200 dark:border-night-600
              rounded-lg
              text-stone-700 dark:text-night-50
              placeholder:text-stone-400
              focus:outline-none focus:ring-2 focus:ring-accent-warm
            "
						autoComplete="off"
						autoCapitalize="characters"
					/>
					<button
						type="submit"
						disabled={!searchValue.trim() || isNavigating}
						className="
              absolute right-2 top-1/2 -translate-y-1/2
              px-4 py-1.5 bg-accent-warm text-white rounded-md
              hover:bg-accent-warm/90 disabled:opacity-50
              transition-colors duration-150
            "
					>
						{isNavigating ? <Spinner size="sm" /> : "View Chain"}
					</button>
				</div>
			</form>

			{/* Watchlist Quick Select */}
			{watchlistSymbols.length > 0 && (
				<div>
					<h2 className="text-sm font-medium text-stone-600 dark:text-night-200 dark:text-night-400 mb-3">
						From Watchlist
					</h2>
					<div className="flex flex-wrap gap-2">
						{watchlistSymbols.map((symbol) => (
							<button
								key={symbol}
								type="button"
								onClick={() => handleSymbolSelect(symbol)}
								disabled={isNavigating}
								className="
                  px-4 py-2 bg-cream-100 dark:bg-night-700
                  text-stone-700 dark:text-night-100
                  rounded-md font-medium
                  hover:bg-cream-200 dark:hover:bg-night-600
                  disabled:opacity-50
                  transition-colors duration-150
                "
							>
								{symbol}
							</button>
						))}
					</div>
				</div>
			)}

			{/* Popular Symbols */}
			<div>
				<h2 className="text-sm font-medium text-stone-600 dark:text-night-200 dark:text-night-400 mb-3">
					Popular
				</h2>
				<div className="flex flex-wrap gap-2">
					{["SPY", "QQQ", "AAPL", "NVDA", "TSLA", "MSFT", "AMZN", "META", "IWM", "GLD"].map(
						(symbol) => (
							<button
								key={symbol}
								type="button"
								onClick={() => handleSymbolSelect(symbol)}
								disabled={isNavigating}
								className="
                  px-4 py-2 bg-cream-50 dark:bg-night-800
                  text-stone-600 dark:text-night-200
                  border border-cream-200 dark:border-night-600
                  rounded-md
                  hover:bg-cream-100 dark:hover:bg-night-700
                  disabled:opacity-50
                  transition-colors duration-150
                "
							>
								{symbol}
							</button>
						),
					)}
				</div>
			</div>
		</div>
	);
}
