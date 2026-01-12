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

const POPULAR_SYMBOLS = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA", "META", "SPY", "QQQ"];
// Supports standard tickers (AAPL) and share classes (BRK.B, BF.A)
const SYMBOL_REGEX = /^[A-Z]{1,5}(\.[A-Z])?$/;

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

  useEffect(() => {
    if (isOpen) {
      // Delay ensures modal animation completes before focus
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isOpen]);

  const handleClose = useCallback(() => {
    setSymbol("");
    setError(null);
    onClose();
  }, [onClose]);

  const validateSymbol = useCallback(
    (value: string): string | null => {
      const upperValue = value.toUpperCase().trim();

      if (!upperValue) {
        return "Please enter a symbol";
      }

      if (!SYMBOL_REGEX.test(upperValue)) {
        return "Invalid symbol format (e.g., AAPL, BRK.B)";
      }

      if (existingSymbols.includes(upperValue)) {
        return "Symbol already in watchlist";
      }

      return null;
    },
    [existingSymbols]
  );

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase();
    setSymbol(value);
    setError(null);
  }, []);

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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

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

  const availablePopular = POPULAR_SYMBOLS.filter((s) => !existingSymbols.includes(s));

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent maxWidth="max-w-sm" data-testid={testId}>
        <DialogHeader>
          <DialogTitle>Add Symbol</DialogTitle>
          <DialogDescription>Add a stock or ETF symbol to your watchlist</DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className="mb-4">
            <label
              htmlFor="symbol-input"
              className="block text-sm font-medium text-stone-700 dark:text-night-100 mb-2"
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

          {availablePopular.length > 0 && (
            <div>
              <p className="text-sm text-stone-500 dark:text-night-300 mb-2">Popular symbols:</p>
              <div className="flex flex-wrap gap-2">
                {availablePopular.map((sym) => (
                  <button
                    key={sym}
                    type="button"
                    onClick={() => handleQuickSelect(sym)}
                    className="
                      px-2.5 py-1 text-xs font-medium rounded-md
                      bg-cream-100 dark:bg-night-700
                      text-stone-700 dark:text-night-100
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
