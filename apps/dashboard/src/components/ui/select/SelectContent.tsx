/**
 * SelectContent Component
 *
 * Dropdown content component containing search input and options list.
 */

import type React from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { LoadingSpinner } from "./icons";
import { SelectItem } from "./SelectItem";
import {
	dropdownStyles,
	groupLabelStyles,
	loadingStyles,
	optionStyles,
	searchInputStyles,
} from "./styles";
import type { SelectOption } from "./types";

interface SelectContentProps {
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
	handleOptionClick: (option: SelectOption) => void;
	onSearchInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

interface GroupedOptions {
	groups: Record<string, SelectOption[]>;
	ungrouped: SelectOption[];
}

function useGroupedOptions(options: SelectOption[]): GroupedOptions {
	const UNGROUPED = "__ungrouped__";
	return useMemo(() => {
		const allGroups = Object.groupBy(options, (o) => o.group ?? UNGROUPED);
		const ungrouped = allGroups[UNGROUPED] ?? [];
		const { [UNGROUPED]: _, ...groups } = allGroups;
		return { groups: groups as Record<string, SelectOption[]>, ungrouped };
	}, [options]);
}

function SelectContentList({
	groupedOptions,
	filteredOptions,
	multiple,
	values,
	value,
	highlightedIndex,
	handleOptionClick,
	setHighlightedIndex,
}: {
	groupedOptions: GroupedOptions;
	filteredOptions: SelectOption[];
	multiple: boolean;
	values: string[];
	value?: string;
	highlightedIndex: number;
	setHighlightedIndex: React.Dispatch<React.SetStateAction<number>>;
	handleOptionClick: (option: SelectOption) => void;
}) {
	let flatUngroupedIndex = 0;

	return (
		<>
			{groupedOptions.ungrouped
				.filter((opt) => filteredOptions.includes(opt))
				.map((option) => {
					const currentIndex = flatUngroupedIndex++;
					return (
						<SelectItem
							key={option.value}
							option={option}
							isSelected={multiple ? values.includes(option.value) : value === option.value}
							isHighlighted={highlightedIndex === currentIndex}
							multiple={multiple}
							onClick={() => handleOptionClick(option)}
							onMouseEnter={() => setHighlightedIndex(currentIndex)}
						/>
					);
				})}

			{Object.entries(groupedOptions.groups).map(([groupName, groupOptions]) => {
				const visibleOptions = groupOptions.filter((opt) => filteredOptions.includes(opt));
				if (visibleOptions.length === 0) {
					return null;
				}

				return (
					<div key={groupName}>
						<div style={groupLabelStyles}>{groupName}</div>
						{visibleOptions.map((option) => (
							<SelectItem
								key={option.value}
								option={option}
								isSelected={multiple ? values.includes(option.value) : value === option.value}
								isHighlighted={false}
								multiple={multiple}
								onClick={() => handleOptionClick(option)}
							/>
						))}
					</div>
				);
			})}
		</>
	);
}

export function SelectContent({
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
	handleOptionClick,
	onSearchInputChange,
}: SelectContentProps): React.ReactElement {
	const searchInputRef = useRef<HTMLInputElement>(null);
	const groupedOptions = useGroupedOptions(options);

	useEffect(() => {
		if (searchable && searchInputRef.current) {
			searchInputRef.current.focus();
		}
	}, [searchable]);

	const handleSearchClick = useCallback((e: React.MouseEvent): void => {
		e.stopPropagation();
	}, []);

	return (
		<div style={dropdownStyles} role="listbox" aria-multiselectable={multiple}>
			{searchable && (
				<input
					ref={searchInputRef}
					type="text"
					value={searchQuery}
					onChange={onSearchInputChange}
					placeholder="Search..."
					style={searchInputStyles}
					onClick={handleSearchClick}
				/>
			)}

			{loading && (
				<div style={loadingStyles}>
					<LoadingSpinner />
				</div>
			)}

			{!loading && filteredOptions.length === 0 && (
				<div style={{ ...optionStyles, color: "#a8a29e", cursor: "default" }}>No options found</div>
			)}

			{!loading && (
				<SelectContentList
					groupedOptions={groupedOptions}
					filteredOptions={filteredOptions}
					multiple={multiple}
					values={values}
					value={value}
					highlightedIndex={highlightedIndex}
					handleOptionClick={handleOptionClick}
					setHighlightedIndex={setHighlightedIndex}
				/>
			)}
		</div>
	);
}
