/**
 * AddSymbolModal Component
 *
 * Modal dialog for adding a symbol to the watchlist.
 * Includes validation and search functionality.
 *
 * @see docs/plans/ui/24-components.md modals section
 */

"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

// ============================================
// Types
// ============================================

export interface AddSymbolModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** Callback when a symbol is added */
  onAdd: (symbol: string) => void;
  /** Optional list of existing symbols to prevent duplicates */
  existingSymbols?: string[];
  /** Test ID */
  "data-testid"?: string;
}

// ============================================
// Constants
// ============================================

/** Common stock symbols for quick selection */
const POPULAR_SYMBOLS = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA", "META", "SPY", "QQQ"];

/** Symbol validation regex: 1-5 uppercase letters */
const SYMBOL_REGEX = /^[A-Z]{1,5}$/;

// ============================================
// Component
// ============================================

/**
 * AddSymbolModal - Modal for adding a symbol to the watchlist.
 *
 * @example
 * ```tsx
 * const [isOpen, setIsOpen] = useState(false);
 *
 * <AddSymbolModal
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   onAdd={(symbol) => addToWatchlist(symbol)}
 *   existingSymbols={watchlist}
 * />
 * ```
 */
export const AddSymbolModal = memo(function AddSymbolModal({
  isOpen,
  onClose,
  onAdd,
  existingSymbols = [],
  "data-testid": testId = "add-symbol-modal",
}: AddSymbolModalProps) {
  const [symbol, setSymbol] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure modal is rendered
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isOpen]);

  // Clear state when closing
  const handleClose = useCallback(() => {
    setSymbol("");
    setError(null);
    onClose();
  }, [onClose]);

  // Validate symbol
  const validateSymbol = useCallback(
    (value: string): string | null => {
      const upperValue = value.toUpperCase().trim();

      if (!upperValue) {
        return "Please enter a symbol";
      }

      if (!SYMBOL_REGEX.test(upperValue)) {
        return "Symbol must be 1-5 letters";
      }

      if (existingSymbols.includes(upperValue)) {
        return "Symbol already in watchlist";
      }

      return null;
    },
    [existingSymbols]
  );

  // Handle input change
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase();
    setSymbol(value);
    setError(null);
  }, []);

  // Handle submit
  const handleSubmit = useCallback(() => {
    const upperSymbol = symbol.toUpperCase().trim();
    const validationError = validateSymbol(upperSymbol);

    if (validationError) {
      setError(validationError);
      return;
    }

    onAdd(upperSymbol);
    handleClose();
  }, [symbol, validateSymbol, onAdd, handleClose]);

  // Handle keyboard submit
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  // Handle quick select
  const handleQuickSelect = useCallback(
    (sym: string) => {
      if (existingSymbols.includes(sym)) {
        setError("Symbol already in watchlist");
        return;
      }
      onAdd(sym);
      handleClose();
    },
    [existingSymbols, onAdd, handleClose]
  );

  // Filter out already-added symbols from popular list
  const availablePopular = POPULAR_SYMBOLS.filter((s) => !existingSymbols.includes(s));

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent maxWidth="max-w-sm" data-testid={testId}>
        <DialogHeader>
          <DialogTitle>Add Symbol</DialogTitle>
          <DialogDescription>Add a stock or ETF symbol to your watchlist</DialogDescription>
        </DialogHeader>

        <DialogBody>
          {/* Symbol Input */}
          <div className="mb-4">
            <label
              htmlFor="symbol-input"
              className="block text-sm font-medium text-cream-700 dark:text-cream-300 mb-2"
            >
              Symbol
            </label>
            <Input
              ref={inputRef}
              id="symbol-input"
              type="text"
              placeholder="e.g., AAPL"
              value={symbol}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              error={!!error}
              testId="symbol-input"
              maxLength={5}
              autoComplete="off"
              autoCapitalize="characters"
            />
            {error && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">
                {error}
              </p>
            )}
          </div>

          {/* Quick Select */}
          {availablePopular.length > 0 && (
            <div>
              <p className="text-sm text-cream-500 dark:text-cream-400 mb-2">Popular symbols:</p>
              <div className="flex flex-wrap gap-2">
                {availablePopular.map((sym) => (
                  <button
                    key={sym}
                    type="button"
                    onClick={() => handleQuickSelect(sym)}
                    className="
                      px-2.5 py-1 text-xs font-medium rounded-md
                      bg-cream-100 dark:bg-night-700
                      text-cream-700 dark:text-cream-300
                      hover:bg-cream-200 dark:hover:bg-night-600
                      transition-colors duration-150
                    "
                    data-testid={`quick-select-${sym}`}
                  >
                    {sym}
                  </button>
                ))}
              </div>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <DialogClose>Cancel</DialogClose>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!symbol.trim()}
            className="
              px-4 py-2 text-sm font-medium rounded-md
              bg-accent-warm text-white
              hover:bg-accent-warm/90
              disabled:opacity-50 disabled:cursor-not-allowed
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-warm focus-visible:ring-offset-2
              transition-colors duration-150
            "
            data-testid="add-symbol-submit"
          >
            Add Symbol
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export default AddSymbolModal;
