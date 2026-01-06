/**
 * Select Component
 *
 * Dropdown select with search, multi-select, and grouped options support.
 *
 * @see docs/plans/ui/24-components.md
 */

import type React from "react";
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";

// ============================================
// Types
// ============================================

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

// ============================================
// Styles
// ============================================

const baseStyles: React.CSSProperties = {
  position: "relative",
  display: "block",
  width: "100%",
};

const triggerStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  width: "100%",
  padding: "10px 12px",
  fontSize: "14px",
  lineHeight: "1.5",
  color: "#1c1917", // stone-900
  backgroundColor: "#ffffff",
  border: "1px solid #d6d3d1", // stone-300
  borderRadius: "6px",
  outline: "none",
  cursor: "pointer",
  transition: "border-color 0.2s, box-shadow 0.2s",
  boxSizing: "border-box" as const,
  textAlign: "left" as const,
};

const triggerOpenStyles: React.CSSProperties = {
  borderColor: "#78716c", // stone-500
  boxShadow: "0 0 0 3px rgba(120, 113, 108, 0.15)",
};

const errorStyles: React.CSSProperties = {
  borderColor: "#dc2626", // red-600
};

const disabledStyles: React.CSSProperties = {
  backgroundColor: "#f5f5f4", // stone-100
  color: "#a8a29e", // stone-400
  cursor: "not-allowed",
};

const dropdownStyles: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  right: 0,
  marginTop: "4px",
  backgroundColor: "#ffffff",
  border: "1px solid #d6d3d1",
  borderRadius: "6px",
  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)",
  zIndex: 50,
  maxHeight: "240px",
  overflow: "auto",
};

const searchInputStyles: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  fontSize: "14px",
  border: "none",
  borderBottom: "1px solid #e7e5e4",
  outline: "none",
  boxSizing: "border-box" as const,
};

const optionStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "8px 12px",
  fontSize: "14px",
  color: "#1c1917",
  cursor: "pointer",
  transition: "background-color 0.1s",
};

const optionHoverStyles: React.CSSProperties = {
  backgroundColor: "#f5f5f4", // stone-100
};

const optionSelectedStyles: React.CSSProperties = {
  backgroundColor: "#e7e5e4", // stone-200
  fontWeight: 500,
};

const optionDisabledStyles: React.CSSProperties = {
  color: "#a8a29e",
  cursor: "not-allowed",
};

const groupLabelStyles: React.CSSProperties = {
  padding: "8px 12px 4px",
  fontSize: "12px",
  fontWeight: 600,
  color: "#78716c", // stone-500
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
};

const loadingStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "16px",
  color: "#78716c",
};

const placeholderStyles: React.CSSProperties = {
  color: "#a8a29e", // stone-400
};

// ============================================
// Component
// ============================================

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
export const Select = forwardRef<HTMLDivElement, SelectProps>(
  (
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
    ref
  ) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Group options by their group property
    const groupedOptions = useMemo(() => {
      const groups: Record<string, SelectOption[]> = {};
      const ungrouped: SelectOption[] = [];

      for (const option of options) {
        if (option.group) {
          const group = option.group;
          if (!groups[group]) {
            groups[group] = [];
          }
          (groups[group] as SelectOption[]).push(option);
        } else {
          ungrouped.push(option);
        }
      }

      return { groups, ungrouped };
    }, [options]);

    // Filter options based on search
    const filteredOptions = useMemo(() => {
      if (!searchQuery) {
        return options;
      }
      const query = searchQuery.toLowerCase();
      return options.filter(
        (opt) => opt.label.toLowerCase().includes(query) || opt.value.toLowerCase().includes(query)
      );
    }, [options, searchQuery]);

    // Get display value
    const displayValue = useMemo(() => {
      if (multiple) {
        if (values.length === 0) {
          return null;
        }
        if (values.length === 1) {
          const opt = options.find((o) => o.value === values[0]);
          return opt?.label || values[0];
        }
        return `${values.length} selected`;
      }
      if (!value) {
        return null;
      }
      const opt = options.find((o) => o.value === value);
      return opt?.label || value;
    }, [multiple, value, values, options]);

    // Handle option click
    const handleOptionClick = useCallback(
      (option: SelectOption) => {
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
      [multiple, values, onChange, onMultiChange]
    );

    // Handle search input
    const handleSearchChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const query = e.target.value;
        setSearchQuery(query);
        onSearchChange?.(query);
        setHighlightedIndex(-1);
      },
      [onSearchChange]
    );

    // Handle keyboard navigation
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
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
      [isOpen, filteredOptions, highlightedIndex, handleOptionClick]
    );

    // Close on outside click
    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          setIsOpen(false);
        }
      };

      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Focus search input when opening
    useEffect(() => {
      if (isOpen && searchable && searchInputRef.current) {
        searchInputRef.current.focus();
      }
    }, [isOpen, searchable]);

    // Reset search when closing
    useEffect(() => {
      if (!isOpen) {
        setSearchQuery("");
        setHighlightedIndex(-1);
      }
    }, [isOpen]);

    const computedTriggerStyles: React.CSSProperties = {
      ...triggerStyles,
      ...(disabled && disabledStyles),
      ...(error && errorStyles),
      ...(isOpen && !error && triggerOpenStyles),
    };

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
        {/* Trigger Button */}
        <button
          type="button"
          style={computedTriggerStyles}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        >
          <span style={displayValue ? undefined : placeholderStyles}>
            {displayValue || placeholder}
          </span>
          <ChevronIcon isOpen={isOpen} />
        </button>

        {/* Dropdown */}
        {isOpen && (
          <div style={dropdownStyles} role="listbox" aria-multiselectable={multiple}>
            {/* Search Input */}
            {searchable && (
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={handleSearchChange}
                placeholder="Search..."
                style={searchInputStyles}
                onClick={(e) => e.stopPropagation()}
              />
            )}

            {/* Loading State */}
            {loading && (
              <div style={loadingStyles}>
                <LoadingSpinner />
              </div>
            )}

            {/* Options */}
            {!loading && filteredOptions.length === 0 && (
              <div style={{ ...optionStyles, color: "#a8a29e", cursor: "default" }}>
                No options found
              </div>
            )}

            {!loading && (
              <>
                {/* Ungrouped options */}
                {groupedOptions.ungrouped
                  .filter((opt) => filteredOptions.includes(opt))
                  .map((option, index) => (
                    <OptionItem
                      key={option.value}
                      option={option}
                      isSelected={multiple ? values.includes(option.value) : value === option.value}
                      isHighlighted={highlightedIndex === index}
                      multiple={multiple}
                      onClick={() => handleOptionClick(option)}
                      onMouseEnter={() => setHighlightedIndex(index)}
                    />
                  ))}

                {/* Grouped options */}
                {Object.entries(groupedOptions.groups).map(([groupName, groupOptions]) => {
                  const visibleOptions = groupOptions.filter((opt) =>
                    filteredOptions.includes(opt)
                  );
                  if (visibleOptions.length === 0) {
                    return null;
                  }

                  return (
                    <div key={groupName}>
                      <div style={groupLabelStyles}>{groupName}</div>
                      {visibleOptions.map((option) => (
                        <OptionItem
                          key={option.value}
                          option={option}
                          isSelected={
                            multiple ? values.includes(option.value) : value === option.value
                          }
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
        )}
      </div>
    );
  }
);

Select.displayName = "Select";

// ============================================
// Sub-components
// ============================================

function OptionItem({
  option,
  isSelected,
  isHighlighted,
  multiple,
  onClick,
  onMouseEnter,
}: {
  option: SelectOption;
  isSelected: boolean;
  isHighlighted: boolean;
  multiple: boolean;
  onClick: () => void;
  onMouseEnter?: () => void;
}) {
  const computedStyles: React.CSSProperties = {
    ...optionStyles,
    ...(option.disabled && optionDisabledStyles),
    ...(isSelected && optionSelectedStyles),
    ...(isHighlighted && optionHoverStyles),
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      style={computedStyles}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={onMouseEnter}
      role="option"
      tabIndex={option.disabled ? -1 : 0}
      aria-selected={isSelected}
      aria-disabled={option.disabled}
    >
      {multiple && (
        <span
          style={{
            width: "16px",
            height: "16px",
            marginRight: "8px",
            border: "1px solid #d6d3d1",
            borderRadius: "3px",
            backgroundColor: isSelected ? "#1c1917" : "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {isSelected && (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
              <path
                d="M1 5L4 8L9 2"
                stroke="#ffffff"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
      )}
      {option.label}
    </div>
  );
}

function ChevronIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      style={{
        transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 0.2s",
      }}
      aria-hidden="true"
    >
      <path
        d="M4 6L8 10L12 6"
        stroke="#78716c"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LoadingSpinner() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      style={{
        animation: "spin 1s linear infinite",
      }}
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="8" stroke="#e7e5e4" strokeWidth="2" />
      <path d="M10 2a8 8 0 018 8" stroke="#78716c" strokeWidth="2" strokeLinecap="round" />
      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </svg>
  );
}

export default Select;
