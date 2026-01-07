/**
 * Watchlist Store
 *
 * Manages the user's watchlist symbols with localStorage persistence.
 * Used by the TickerStrip component to display live quotes.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 1.1
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

// ============================================
// Types
// ============================================

export interface WatchlistState {
  /** Symbols in the watchlist */
  symbols: string[];
}

export interface WatchlistActions {
  /** Add a symbol to the watchlist */
  addSymbol: (symbol: string) => void;
  /** Remove a symbol from the watchlist */
  removeSymbol: (symbol: string) => void;
  /** Set the entire watchlist */
  setSymbols: (symbols: string[]) => void;
  /** Check if a symbol is in the watchlist */
  hasSymbol: (symbol: string) => boolean;
  /** Reorder symbols */
  reorderSymbols: (fromIndex: number, toIndex: number) => void;
  /** Clear the watchlist */
  clear: () => void;
}

export type WatchlistStore = WatchlistState & WatchlistActions;

// ============================================
// Defaults
// ============================================

const DEFAULT_SYMBOLS = ["SPY", "QQQ", "AAPL", "NVDA", "MSFT"];

const initialState: WatchlistState = {
  symbols: DEFAULT_SYMBOLS,
};

// ============================================
// Store
// ============================================

/**
 * Watchlist store with localStorage persistence.
 *
 * @example
 * ```tsx
 * const symbols = useWatchlistStore((s) => s.symbols);
 * const addSymbol = useWatchlistStore((s) => s.addSymbol);
 * const removeSymbol = useWatchlistStore((s) => s.removeSymbol);
 *
 * return (
 *   <TickerStrip
 *     symbols={symbols}
 *     onSymbolRemove={removeSymbol}
 *     onSymbolAdd={() => addSymbol('TSLA')}
 *   />
 * );
 * ```
 */
export const useWatchlistStore = create<WatchlistStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      addSymbol: (symbol) => {
        const normalized = symbol.toUpperCase().trim();
        if (!normalized) {
          return;
        }

        set((state) => {
          if (state.symbols.includes(normalized)) {
            return state;
          }
          return { symbols: [...state.symbols, normalized] };
        });
      },

      removeSymbol: (symbol) => {
        const normalized = symbol.toUpperCase().trim();
        set((state) => ({
          symbols: state.symbols.filter((s) => s !== normalized),
        }));
      },

      setSymbols: (symbols) => {
        const normalized = symbols.map((s) => s.toUpperCase().trim()).filter(Boolean);
        set({ symbols: normalized });
      },

      hasSymbol: (symbol) => {
        const normalized = symbol.toUpperCase().trim();
        return get().symbols.includes(normalized);
      },

      reorderSymbols: (fromIndex, toIndex) => {
        set((state) => {
          const symbols = [...state.symbols];
          const [removed] = symbols.splice(fromIndex, 1);
          if (removed) {
            symbols.splice(toIndex, 0, removed);
          }
          return { symbols };
        });
      },

      clear: () => {
        set({ symbols: [] });
      },
    }),
    {
      name: "cream-watchlist",
      version: 1,
    }
  )
);

// ============================================
// Selectors
// ============================================

export const selectSymbols = (state: WatchlistStore) => state.symbols;
export const selectSymbolCount = (state: WatchlistStore) => state.symbols.length;

// ============================================
// Convenience Hook
// ============================================

/**
 * Hook for watchlist management.
 */
export function useWatchlist() {
  return useWatchlistStore((state) => ({
    symbols: state.symbols,
    addSymbol: state.addSymbol,
    removeSymbol: state.removeSymbol,
    setSymbols: state.setSymbols,
    hasSymbol: state.hasSymbol,
    reorderSymbols: state.reorderSymbols,
    clear: state.clear,
  }));
}

export default useWatchlistStore;
