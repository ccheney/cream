/**
 * Command Palette Search Input Component
 */

"use client";

import type React from "react";
import { ClearIcon, SearchIcon } from "./icons";

export interface CommandInputProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  placeholder: string;
}

export function CommandInput({
  inputRef,
  value,
  onChange,
  onKeyDown,
  placeholder,
}: CommandInputProps) {
  return (
    <div className="flex items-center px-4 border-b border-stone-200 dark:border-stone-700">
      <SearchIcon />
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="flex-1 py-4 px-3 text-base bg-transparent outline-none text-stone-900 dark:text-stone-100 placeholder:text-stone-400"
        aria-label="Search commands"
        aria-autocomplete="list"
        role="combobox"
        aria-expanded="true"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="p-1 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
          aria-label="Clear search"
        >
          <ClearIcon />
        </button>
      )}
    </div>
  );
}
