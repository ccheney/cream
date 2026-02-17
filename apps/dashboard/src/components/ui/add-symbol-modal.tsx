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
	isOpen: boolean;
	onClose: () => void;
	onAdd: (symbol: string) => void;
	existingSymbols?: string[];
	"data-testid"?: string;
}

const POPULAR_SYMBOLS = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA", "META", "SPY", "QQQ"];
const SYMBOL_REGEX = /^[A-Z]{1,5}(\.[A-Z])?$/;
const MAX_SYMBOL_LENGTH = 5;

interface UseAddSymbolStateResult {
	symbol: string;
	error: string | null;
	inputRef: React.RefObject<HTMLInputElement>;
	handleSubmit: () => void;
	handleQuickSelect: (symbol: string) => void;
	handleChange: (value: string) => void;
	handleKeyDown: (event: React.KeyboardEvent) => void;
}

interface UseAddSymbolActionsDeps {
	symbol: string;
	existingSymbols: string[];
	onAdd: (symbol: string) => void;
	onClose: () => void;
	onError: (message: string) => void;
}

function getValidationError(symbol: string, existingSymbols: string[]): string | null {
	const upperValue = symbol.trim().toUpperCase();

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
}

function getAvailablePopular(existingSymbols: string[]): string[] {
	return POPULAR_SYMBOLS.filter((symbol) => !existingSymbols.includes(symbol));
}

function useAutoFocusInput(isOpen: boolean): React.RefObject<HTMLInputElement> {
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		const timer = setTimeout(() => {
			inputRef.current?.focus();
		}, 100);
		return () => clearTimeout(timer);
	}, [isOpen]);

	return inputRef;
}

function useAddSymbolSubmitAction({
	symbol,
	existingSymbols,
	onAdd,
	onClose,
	onError,
}: UseAddSymbolActionsDeps) {
	return useCallback(() => {
		const upperSymbol = symbol.trim().toUpperCase();
		const validationError = getValidationError(upperSymbol, existingSymbols);

		if (validationError) {
			onError(validationError);
			return;
		}

		onAdd(upperSymbol);
		onClose();
	}, [symbol, existingSymbols, onAdd, onClose, onError]);
}

function useAddSymbolQuickSelectAction({
	existingSymbols,
	onAdd,
	onClose,
	onError,
}: Omit<UseAddSymbolActionsDeps, "symbol">) {
	return useCallback(
		(selected: string) => {
			if (existingSymbols.includes(selected)) {
				onError("Symbol already in watchlist");
				return;
			}
			onAdd(selected);
			onClose();
		},
		[existingSymbols, onAdd, onClose, onError],
	);
}

function useAddSymbolState({
	symbol,
	error,
	setSymbol,
	setError,
	existingSymbols,
	onAdd,
	onClose,
	isOpen,
}: {
	symbol: string;
	error: string | null;
	setSymbol: React.Dispatch<React.SetStateAction<string>>;
	setError: React.Dispatch<React.SetStateAction<string | null>>;
	existingSymbols: string[];
	onAdd: (symbol: string) => void;
	onClose: () => void;
	isOpen: boolean;
}): UseAddSymbolStateResult {
	const inputRef = useAutoFocusInput(isOpen);
	const closeAndReset = useCallback(() => {
		setSymbol("");
		setError(null);
		onClose();
	}, [onClose, setSymbol, setError]);

	const handleSubmit = useAddSymbolSubmitAction({
		symbol,
		existingSymbols,
		onAdd,
		onClose: closeAndReset,
		onError: setError,
	});

	const handleQuickSelect = useAddSymbolQuickSelectAction({
		existingSymbols,
		onAdd,
		onClose: closeAndReset,
		onError: setError,
	});

	const handleChange = useCallback(
		(value: string) => {
			setSymbol(value.toUpperCase());
			setError(null);
		},
		[setSymbol, setError],
	);

	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent) => {
			if (event.key === "Enter") {
				event.preventDefault();
				handleSubmit();
			}
		},
		[handleSubmit],
	);

	return {
		symbol,
		error,
		inputRef,
		handleSubmit,
		handleQuickSelect,
		handleChange,
		handleKeyDown,
	};
}

function PopularSymbolList({
	symbols,
	onSelect,
}: {
	symbols: string[];
	onSelect: (symbol: string) => void;
}) {
	if (symbols.length === 0) {
		return null;
	}

	return (
		<div>
			<p className="text-sm text-stone-500 dark:text-night-300 mb-2">Popular symbols:</p>
			<div className="flex flex-wrap gap-2">
				{symbols.map((sym) => (
					<button
						key={sym}
						type="button"
						onClick={() => onSelect(sym)}
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
	);
}

function AddSymbolFormContent({
	symbol,
	error,
	onChange,
	onKeyDown,
	availablePopular,
	onQuickSelect,
	inputRef,
}: {
	symbol: string;
	error: string | null;
	onChange: (value: string) => void;
	onKeyDown: (event: React.KeyboardEvent) => void;
	availablePopular: string[];
	onQuickSelect: (symbol: string) => void;
	inputRef: React.RefObject<HTMLInputElement>;
}) {
	return (
		<>
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
					onChange={(event) => onChange(event.target.value)}
					onKeyDown={onKeyDown}
					error={!!error}
					testId="symbol-input"
					maxLength={MAX_SYMBOL_LENGTH}
					autoComplete="off"
					autoCapitalize="characters"
				/>
				{error && (
					<p className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">
						{error}
					</p>
				)}
			</div>

			<PopularSymbolList symbols={availablePopular} onSelect={onQuickSelect} />
		</>
	);
}

function AddSymbolSubmitButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
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
	);
}

export const AddSymbolModal = memo(function AddSymbolModal({
	isOpen,
	onClose,
	onAdd,
	existingSymbols = [],
	"data-testid": testId = "add-symbol-modal",
}: AddSymbolModalProps) {
	const [symbol, setSymbol] = useState("");
	const [error, setError] = useState<string | null>(null);

	const { inputRef, handleSubmit, handleQuickSelect, handleChange, handleKeyDown } =
		useAddSymbolState({
			symbol,
			error,
			setSymbol,
			setError,
			existingSymbols,
			onAdd,
			onClose,
			isOpen,
		});

	const availablePopular = getAvailablePopular(existingSymbols);

	return (
		<Dialog open={isOpen} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
			<DialogContent maxWidth="max-w-sm" data-testid={testId}>
				<DialogHeader>
					<DialogTitle>Add Symbol</DialogTitle>
					<DialogDescription>Add a stock or ETF symbol to your watchlist</DialogDescription>
				</DialogHeader>

				<DialogBody>
					<AddSymbolFormContent
						symbol={symbol}
						error={error}
						onChange={handleChange}
						onKeyDown={handleKeyDown}
						availablePopular={availablePopular}
						onQuickSelect={handleQuickSelect}
						inputRef={inputRef}
					/>
				</DialogBody>

				<DialogFooter>
					<DialogClose>Cancel</DialogClose>
					<AddSymbolSubmitButton disabled={!symbol.trim()} onClick={handleSubmit} />
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
});

export default AddSymbolModal;
