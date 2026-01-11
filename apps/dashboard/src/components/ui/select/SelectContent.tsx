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

  const groupedOptions = useMemo((): GroupedOptions => {
    const UNGROUPED = "__ungrouped__";
    const allGroups = Object.groupBy(options, (o) => o.group ?? UNGROUPED);
    const ungrouped = allGroups[UNGROUPED] ?? [];
    const { [UNGROUPED]: _, ...groups } = allGroups;
    return { groups: groups as Record<string, SelectOption[]>, ungrouped };
  }, [options]);

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
        <>
          {groupedOptions.ungrouped
            .filter((opt) => filteredOptions.includes(opt))
            .map((option, index) => (
              <SelectItem
                key={option.value}
                option={option}
                isSelected={multiple ? values.includes(option.value) : value === option.value}
                isHighlighted={highlightedIndex === index}
                multiple={multiple}
                onClick={() => handleOptionClick(option)}
                onMouseEnter={() => setHighlightedIndex(index)}
              />
            ))}

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
      )}
    </div>
  );
}
