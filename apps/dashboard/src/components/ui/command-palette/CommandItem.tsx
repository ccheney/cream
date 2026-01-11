/**
 * Command Palette Item Component
 */

"use client";

import type React from "react";
import type { CommandItem } from "./types.js";

export interface CommandItemRowProps {
  command: CommandItem;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onHover: () => void;
}

export function CommandItemRow({
  command,
  index,
  isSelected,
  onSelect,
  onHover,
}: CommandItemRowProps) {
  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
    }
  }

  return (
    <div
      data-index={index}
      role="option"
      tabIndex={command.disabled ? -1 : 0}
      aria-selected={isSelected}
      aria-disabled={command.disabled}
      className={`
        flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors
        ${isSelected ? "bg-stone-100 dark:bg-stone-700" : ""}
        ${command.disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-stone-50 dark:hover:bg-stone-700/50"}
      `}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      onMouseEnter={onHover}
    >
      {command.icon && (
        <span className="flex-shrink-0 w-5 h-5 text-stone-500 dark:text-stone-400">
          {command.icon}
        </span>
      )}

      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-stone-900 dark:text-stone-100 truncate">
          {command.label}
        </div>
        {command.description && (
          <div className="text-xs text-stone-500 dark:text-stone-400 truncate">
            {command.description}
          </div>
        )}
      </div>

      {command.shortcut && (
        <div className="flex items-center gap-1">
          {command.shortcut.map((shortcutKey) => (
            <kbd
              key={shortcutKey}
              className="px-1.5 py-0.5 bg-stone-100 dark:bg-stone-600 rounded text-[10px] font-medium text-stone-600 dark:text-stone-300"
            >
              {shortcutKey}
            </kbd>
          ))}
        </div>
      )}
    </div>
  );
}
