/**
 * Select Component
 *
 * Dropdown select with search, multi-select, and grouped options support.
 *
 * @see docs/plans/ui/24-components.md
 */

import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SelectContent } from "./SelectContent";
import { SelectTrigger } from "./SelectTrigger";
import { baseStyles } from "./styles";
import type { SelectOption, SelectProps } from "./types";

export type { SelectOption, SelectProps } from "./types";

/**
 * Select component with search, multi-select, and grouped options.
 *
 * @example
 * ```tsx
 * // Simple select
 * <Select
 *   options={[
 *     { value: "1h", label: "1 Hour" },
 *     { value: "1d", label: "1 Day" },
 *   ]}
 *   value={timeframe}
 *   onChange={setTimeframe}
 * />
 *
 * // Searchable multi-select
 * <Select
 *   options={symbols}
 *   values={selectedSymbols}
 *   onMultiChange={setSelectedSymbols}
 *   multiple
 *   searchable
 *   placeholder="Select symbols..."
 * />
 * ```
 */
export const Select = forwardRef<HTMLDivElement, SelectProps>(function Select(
	{
		options,
		value,
		values = [],
		placeholder = "Select...",
		multiple = false,
		searchable = false,
		loading = false,
		disabled = false,
		error = false,
		onChange,
		onMultiChange,
		onSearchChange,
		testId = "select",
		className,
	},
	ref,
) {
	const [isOpen, setIsOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [highlightedIndex, setHighlightedIndex] = useState(-1);
	const containerRef = useRef<HTMLDivElement>(null);

	const filteredOptions = useMemo((): SelectOption[] => {
		if (!searchQuery) {
			return options;
		}
		const query = searchQuery.toLowerCase();
		return options.filter(
			(opt) => opt.label.toLowerCase().includes(query) || opt.value.toLowerCase().includes(query),
		);
	}, [options, searchQuery]);

	const displayValue = useMemo((): string | null => {
		if (multiple) {
			if (values.length === 0) {
				return null;
			}
			if (values.length === 1) {
				const opt = options.find((o) => o.value === values[0]);
				return opt?.label || values[0] || null;
			}
			return `${values.length} selected`;
		}
		if (!value) {
			return null;
		}
		const opt = options.find((o) => o.value === value);
		return opt?.label || value;
	}, [multiple, value, values, options]);

	const handleOptionClick = useCallback(
		(option: SelectOption): void => {
			if (option.disabled) {
				return;
			}

			if (multiple) {
				const newValues = values.includes(option.value)
					? values.filter((v) => v !== option.value)
					: [...values, option.value];
				onMultiChange?.(newValues);
			} else {
				onChange?.(option.value);
				setIsOpen(false);
			}
		},
		[multiple, values, onChange, onMultiChange],
	);

	const handleSearchInputChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>): void => {
			const query = e.target.value;
			setSearchQuery(query);
			onSearchChange?.(query);
			setHighlightedIndex(-1);
		},
		[onSearchChange],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent): void => {
			if (!isOpen) {
				if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
					e.preventDefault();
					setIsOpen(true);
				}
				return;
			}

			switch (e.key) {
				case "Escape":
					e.preventDefault();
					setIsOpen(false);
					break;
				case "ArrowDown":
					e.preventDefault();
					setHighlightedIndex((i) => (i < filteredOptions.length - 1 ? i + 1 : 0));
					break;
				case "ArrowUp":
					e.preventDefault();
					setHighlightedIndex((i) => (i > 0 ? i - 1 : filteredOptions.length - 1));
					break;
				case "Enter":
					e.preventDefault();
					if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
						handleOptionClick(filteredOptions[highlightedIndex]);
					}
					break;
			}
		},
		[isOpen, filteredOptions, highlightedIndex, handleOptionClick],
	);

	const handleTriggerClick = useCallback((): void => {
		if (!disabled) {
			setIsOpen(!isOpen);
		}
	}, [disabled, isOpen]);

	useEffect(() => {
		function handleClickOutside(e: MouseEvent): void {
			if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
				setIsOpen(false);
			}
		}

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	useEffect(() => {
		if (!isOpen) {
			setSearchQuery("");
			setHighlightedIndex(-1);
		}
	}, [isOpen]);

	return (
		<div
			ref={(node) => {
				containerRef.current = node;
				if (typeof ref === "function") {
					ref(node);
				} else if (ref) {
					ref.current = node;
				}
			}}
			style={baseStyles}
			className={className}
			data-testid={testId}
		>
			<SelectTrigger
				displayValue={displayValue}
				placeholder={placeholder}
				isOpen={isOpen}
				disabled={disabled}
				error={error}
				onClick={handleTriggerClick}
				onKeyDown={handleKeyDown}
			/>

			{isOpen && (
				<SelectContent
					options={options}
					filteredOptions={filteredOptions}
					searchable={searchable}
					loading={loading}
					multiple={multiple}
					value={value}
					values={values}
					searchQuery={searchQuery}
					highlightedIndex={highlightedIndex}
					setHighlightedIndex={setHighlightedIndex}
					handleOptionClick={handleOptionClick}
					onSearchInputChange={handleSearchInputChange}
				/>
			)}
		</div>
	);
});

export default Select;
