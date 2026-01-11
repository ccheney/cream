/**
 * Select Component Types
 */

import type React from "react";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  group?: string;
}

export interface SelectProps {
  /** Select options */
  options: SelectOption[];
  /** Current value (single select) */
  value?: string;
  /** Current values (multi-select) */
  values?: string[];
  /** Placeholder text */
  placeholder?: string;
  /** Enable multi-select */
  multiple?: boolean;
  /** Enable search/filter */
  searchable?: boolean;
  /** Show loading state */
  loading?: boolean;
  /** Disable the select */
  disabled?: boolean;
  /** Error state */
  error?: boolean;
  /** Change handler (single select) */
  onChange?: (value: string) => void;
  /** Change handler (multi-select) */
  onMultiChange?: (values: string[]) => void;
  /** Search input change handler */
  onSearchChange?: (query: string) => void;
  /** Test ID */
  testId?: string;
  /** Additional class name */
  className?: string;
}

export interface SelectContextValue {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  highlightedIndex: number;
  setHighlightedIndex: React.Dispatch<React.SetStateAction<number>>;
  multiple: boolean;
  value?: string;
  values: string[];
  filteredOptions: SelectOption[];
  handleOptionClick: (option: SelectOption) => void;
  onSearchChange?: (query: string) => void;
}

export interface OptionItemProps {
  option: SelectOption;
  isSelected: boolean;
  isHighlighted: boolean;
  multiple: boolean;
  onClick: () => void;
  onMouseEnter?: () => void;
}
