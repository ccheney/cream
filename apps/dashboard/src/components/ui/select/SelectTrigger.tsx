/**
 * SelectTrigger Component
 *
 * Trigger button that opens the dropdown.
 */

import type React from "react";
import { ChevronIcon } from "./icons";
import {
  disabledStyles,
  errorStyles,
  placeholderStyles,
  triggerOpenStyles,
  triggerStyles,
} from "./styles";

interface SelectTriggerProps {
  displayValue: string | null;
  placeholder: string;
  isOpen: boolean;
  disabled: boolean;
  error: boolean;
  onClick: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

export function SelectTrigger({
  displayValue,
  placeholder,
  isOpen,
  disabled,
  error,
  onClick,
  onKeyDown,
}: SelectTriggerProps): React.ReactElement {
  const computedTriggerStyles: React.CSSProperties = {
    ...triggerStyles,
    ...(disabled && disabledStyles),
    ...(error && errorStyles),
    ...(isOpen && !error && triggerOpenStyles),
  };

  return (
    <button
      type="button"
      style={computedTriggerStyles}
      onClick={onClick}
      onKeyDown={onKeyDown}
      disabled={disabled}
      aria-haspopup="listbox"
      aria-expanded={isOpen}
    >
      <span style={displayValue ? undefined : placeholderStyles}>
        {displayValue || placeholder}
      </span>
      <ChevronIcon isOpen={isOpen} />
    </button>
  );
}
