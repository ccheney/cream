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

function useFilteredOptions(options: SelectOption[], searchQuery: string) {
	return useMemo(() => {
		if (!searchQuery) {
			return options;
		}

		const query = searchQuery.toLowerCase();
		return options.filter(
			(opt) => opt.label.toLowerCase().includes(query) || opt.value.toLowerCase().includes(query),
		);
	}, [options, searchQuery]);
}

function useDisplayValue(
	options: SelectOption[],
	value: string | undefined,
	values: string[],
	multiple: boolean,
) {
	return useMemo((): string | null => {
		if (multiple) {
			if (values.length === 0) {
				return null;
			}

			if (values.length === 1) {
				const option = options.find((opt) => opt.value === values[0]);
				return option?.label || values[0] || null;
			}

			return `${values.length} selected`;
		}

		if (!value) {
			return null;
		}

		const option = options.find((opt) => opt.value === value);
		return option?.label || value;
	}, [options, value, values, multiple]);
}

function useSelectionHandlers({
	multiple,
	onChange,
	onMultiChange,
	values,
}: {
	multiple: boolean;
	values: string[];
	onChange?: (value: string) => void;
	onMultiChange?: (values: string[]) => void;
}) {
	const handleOptionClick = useCallback(
		(option: SelectOption): void => {
			if (option.disabled) {
				return;
			}

			if (multiple) {
				const newValues = values.includes(option.value)
					? values.filter((value) => value !== option.value)
					: [...values, option.value];
				onMultiChange?.(newValues);
			} else {
				onChange?.(option.value);
			}
		},
		[multiple, values, onChange, onMultiChange],
	);

	return { handleOptionClick };
}

function useKeyboardNavigation({
	isOpen,
	filteredOptions,
	onTriggerOpen,
	onTriggerClose,
	onSelectOption,
	highlightedIndex,
	setHighlightedIndex,
}: {
	isOpen: boolean;
	filteredOptions: SelectOption[];
	highlightedIndex: number;
	onTriggerOpen: () => void;
	onTriggerClose: () => void;
	onSelectOption: (option: SelectOption) => void;
	setHighlightedIndex: React.Dispatch<React.SetStateAction<number>>;
}) {
	return useCallback(
		(event: React.KeyboardEvent) => {
			if (!isOpen) {
				if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
					event.preventDefault();
					onTriggerOpen();
				}
				return;
			}

			switch (event.key) {
				case "Escape":
					event.preventDefault();
					onTriggerClose();
					break;
				case "ArrowDown":
					event.preventDefault();
					setHighlightedIndex((index) => (index < filteredOptions.length - 1 ? index + 1 : 0));
					break;
				case "ArrowUp":
					event.preventDefault();
					setHighlightedIndex((index) => (index > 0 ? index - 1 : filteredOptions.length - 1));
					break;
				case "Enter":
					event.preventDefault();
					if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
						onSelectOption(filteredOptions[highlightedIndex]);
					}
					break;
			}
		},
		[
			filteredOptions,
			highlightedIndex,
			isOpen,
			onSelectOption,
			onTriggerClose,
			onTriggerOpen,
			setHighlightedIndex,
		],
	);
}

function useOutsideClickCollapse(
	ref: React.RefObject<HTMLDivElement | null>,
	setIsOpen: (open: boolean) => void,
) {
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (ref.current && !ref.current.contains(event.target as Node)) {
				setIsOpen(false);
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [ref, setIsOpen]);
}

function useCollapseReset(
	isOpen: boolean,
	setSearchQuery: (query: string) => void,
	setHighlightedIndex: (index: number) => void,
) {
	useEffect(() => {
		if (!isOpen) {
			setSearchQuery("");
			setHighlightedIndex(-1);
		}
	}, [isOpen, setSearchQuery, setHighlightedIndex]);
}

function useRefForwarder(
	ref: React.Ref<HTMLDivElement>,
	containerRef: React.MutableRefObject<HTMLDivElement | null>,
) {
	return useCallback(
		(node: HTMLDivElement | null) => {
			containerRef.current = node;
			if (typeof ref === "function") {
				ref(node);
			} else if (ref) {
				ref.current = node;
			}
		},
		[containerRef, ref],
	);
}

interface SelectState {
	isOpen: boolean;
	searchQuery: string;
	highlightedIndex: number;
	filteredOptions: SelectOption[];
	displayValue: string | null;
	setRef: (node: HTMLDivElement | null) => void;
	setHighlightedIndex: React.Dispatch<React.SetStateAction<number>>;
	setIsOpen: (open: boolean) => void;
	setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
	onSearchInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
	onSelect: (option: SelectOption) => void;
	onToggleOpen: () => void;
	handleKeyDown: (event: React.KeyboardEvent) => void;
}

function useSelectActions({
	multiple,
	values,
	filteredOptions,
	isOpen,
	highlightedIndex,
	disabled,
	setHighlightedIndex,
	setIsOpen,
	setSearchQuery,
	onSearchChange,
	onChange,
	onMultiChange,
}: {
	multiple: boolean;
	values: string[];
	filteredOptions: SelectOption[];
	isOpen: boolean;
	highlightedIndex: number;
	disabled: boolean;
	setHighlightedIndex: React.Dispatch<React.SetStateAction<number>>;
	setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
	setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
	onSearchChange?: (query: string) => void;
	onChange?: (value: string) => void;
	onMultiChange?: (values: string[]) => void;
}) {
	const { handleOptionClick } = useSelectionHandlers({
		multiple,
		values,
		onChange,
		onMultiChange,
	});

	const onSelect = useCallback(
		(option: SelectOption) => {
			handleOptionClick(option);
			if (!multiple) {
				setIsOpen(false);
			}
		},
		[handleOptionClick, multiple, setIsOpen],
	);

	const onSearchInputChange = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => {
			const query = event.target.value;
			setSearchQuery(query);
			onSearchChange?.(query);
			setHighlightedIndex(-1);
		},
		[onSearchChange, setHighlightedIndex, setSearchQuery],
	);

	const handleKeyDown = useKeyboardNavigation({
		isOpen,
		filteredOptions,
		onTriggerOpen: () => setIsOpen(true),
		onTriggerClose: () => setIsOpen(false),
		onSelectOption: onSelect,
		highlightedIndex,
		setHighlightedIndex,
	});

	const onToggleOpen = useCallback(() => {
		if (!disabled) {
			setIsOpen((open) => !open);
		}
	}, [disabled, setIsOpen]);

	return { onSelect, onSearchInputChange, onToggleOpen, handleKeyDown };
}

function useSelectState(
	{
		options,
		value,
		values,
		multiple,
		onSearchChange,
		disabled,
		onChange,
		onMultiChange,
	}: {
		options: SelectOption[];
		value?: string;
		values: string[];
		multiple: boolean;
		onSearchChange?: (query: string) => void;
		disabled: boolean;
		onChange?: (value: string) => void;
		onMultiChange?: (values: string[]) => void;
	},
	ref: React.Ref<HTMLDivElement>,
): SelectState {
	const [isOpen, setIsOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [highlightedIndex, setHighlightedIndex] = useState(-1);
	const containerRef = useRef<HTMLDivElement>(null);

	const filteredOptions = useFilteredOptions(options, searchQuery);
	const displayValue = useDisplayValue(options, value, values, multiple);

	const { onSearchInputChange, onSelect, onToggleOpen, handleKeyDown } = useSelectActions({
		multiple,
		values,
		filteredOptions,
		isOpen,
		highlightedIndex,
		disabled,
		setHighlightedIndex,
		setIsOpen,
		setSearchQuery,
		onSearchChange,
		onChange,
		onMultiChange,
	});

	useOutsideClickCollapse(containerRef, setIsOpen);
	useCollapseReset(isOpen, setSearchQuery, setHighlightedIndex);

	const setRef = useRefForwarder(ref, containerRef);

	return {
		isOpen,
		searchQuery,
		highlightedIndex,
		filteredOptions,
		displayValue,
		setRef,
		setHighlightedIndex,
		setIsOpen,
		setSearchQuery,
		onSearchInputChange,
		onSelect,
		onToggleOpen,
		handleKeyDown,
	};
}

function SelectContentRenderer({
	options,
	filteredOptions,
	searchable,
	loading,
	multiple,
	value,
	values,
	searchQuery,
	highlightedIndex,
	setHighlightedIndex,
	onSelect,
	onSearchInputChange,
}: {
	options: SelectOption[];
	filteredOptions: SelectOption[];
	searchable: boolean;
	loading: boolean;
	multiple: boolean;
	value?: string;
	values: string[];
	searchQuery: string;
	highlightedIndex: number;
	setHighlightedIndex: React.Dispatch<React.SetStateAction<number>>;
	onSelect: (option: SelectOption) => void;
	onSearchInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
	return (
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
			handleOptionClick={onSelect}
			onSearchInputChange={onSearchInputChange}
		/>
	);
}

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
	const selectState = useSelectState(
		{
			options,
			value,
			values,
			multiple,
			disabled,
			onSearchChange,
			onChange,
			onMultiChange,
		},
		ref,
	);

	return (
		<div ref={selectState.setRef} style={baseStyles} className={className} data-testid={testId}>
			<SelectTrigger
				displayValue={selectState.displayValue}
				placeholder={placeholder}
				isOpen={selectState.isOpen}
				disabled={disabled}
				error={error}
				onClick={selectState.onToggleOpen}
				onKeyDown={selectState.handleKeyDown}
			/>

			{selectState.isOpen && (
				<SelectContentRenderer
					options={options}
					filteredOptions={selectState.filteredOptions}
					searchable={searchable}
					loading={loading}
					multiple={multiple}
					value={value}
					values={values}
					searchQuery={selectState.searchQuery}
					highlightedIndex={selectState.highlightedIndex}
					setHighlightedIndex={selectState.setHighlightedIndex}
					onSelect={selectState.onSelect}
					onSearchInputChange={selectState.onSearchInputChange}
				/>
			)}
		</div>
	);
});

export default Select;
