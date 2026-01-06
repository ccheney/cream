/**
 * Command Palette Component
 *
 * Linear/Raycast-style command palette for quick navigation and actions.
 *
 * @see docs/plans/ui/20-design-philosophy.md
 */

"use client";

import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";

// ============================================
// Types
// ============================================

export interface CommandItem {
  /** Unique identifier */
  id: string;
  /** Display label */
  label: string;
  /** Optional description */
  description?: string;
  /** Group for categorization */
  group?: string;
  /** Keywords for search matching */
  keywords?: string[];
  /** Icon component */
  icon?: React.ReactNode;
  /** Keyboard shortcut hint */
  shortcut?: string[];
  /** Action when selected */
  onSelect: () => void;
  /** Whether item is disabled */
  disabled?: boolean;
}

export interface CommandPaletteProps {
  /** Whether palette is open */
  open: boolean;
  /** Callback when palette should close */
  onOpenChange: (open: boolean) => void;
  /** Available commands */
  commands: CommandItem[];
  /** Placeholder for search input */
  placeholder?: string;
  /** Empty state message */
  emptyMessage?: string;
  /** Loading state */
  loading?: boolean;
  /** Recent items to show at top */
  recentIds?: string[];
}

interface CommandContextValue {
  close: () => void;
  search: string;
  selectedIndex: number;
}

// ============================================
// Context
// ============================================

const CommandContext = createContext<CommandContextValue | null>(null);

// Reserved for future use by sub-components
function _useCommandContext() {
  const context = useContext(CommandContext);
  if (!context) {
    throw new Error("Command components must be used within CommandPalette");
  }
  return context;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Simple fuzzy match - checks if query chars appear in order
 */
function fuzzyMatch(query: string, text: string): boolean {
  const lowerQuery = query.toLowerCase();
  const lowerText = text.toLowerCase();

  let queryIndex = 0;
  for (let i = 0; i < lowerText.length && queryIndex < lowerQuery.length; i++) {
    if (lowerText[i] === lowerQuery[queryIndex]) {
      queryIndex++;
    }
  }

  return queryIndex === lowerQuery.length;
}

/**
 * Score a match - higher is better
 */
function scoreMatch(query: string, item: CommandItem): number {
  const lowerQuery = query.toLowerCase();
  const lowerLabel = item.label.toLowerCase();

  // Exact match in label
  if (lowerLabel === lowerQuery) {
    return 100;
  }

  // Starts with query
  if (lowerLabel.startsWith(lowerQuery)) {
    return 80;
  }

  // Contains query
  if (lowerLabel.includes(lowerQuery)) {
    return 60;
  }

  // Fuzzy match in label
  if (fuzzyMatch(lowerQuery, lowerLabel)) {
    return 40;
  }

  // Match in keywords
  if (item.keywords?.some((kw) => kw.toLowerCase().includes(lowerQuery))) {
    return 30;
  }

  // Match in description
  if (item.description?.toLowerCase().includes(lowerQuery)) {
    return 20;
  }

  return 0;
}

// ============================================
// Component
// ============================================

/**
 * Command Palette - Quick navigation and actions.
 *
 * @example
 * ```tsx
 * const [open, setOpen] = useState(false);
 *
 * // Trigger with Cmd+K
 * useEffect(() => {
 *   const handler = (e: KeyboardEvent) => {
 *     if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
 *       e.preventDefault();
 *       setOpen(true);
 *     }
 *   };
 *   window.addEventListener('keydown', handler);
 *   return () => window.removeEventListener('keydown', handler);
 * }, []);
 *
 * <CommandPalette
 *   open={open}
 *   onOpenChange={setOpen}
 *   commands={[
 *     { id: 'dashboard', label: 'Go to Dashboard', group: 'Navigation', onSelect: () => router.push('/') },
 *     { id: 'portfolio', label: 'Go to Portfolio', group: 'Navigation', onSelect: () => router.push('/portfolio') },
 *   ]}
 * />
 * ```
 */
export function CommandPalette({
  open,
  onOpenChange,
  commands,
  placeholder = "Search commands...",
  emptyMessage = "No results found",
  loading = false,
  recentIds = [],
}: CommandPaletteProps) {
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Mount check for portal
  useEffect(() => {
    setMounted(true);
  }, []);

  const close = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  // Filter and sort commands
  const filteredCommands = useMemo(() => {
    if (!search) {
      // Show recent items first, then all grouped
      const recent = recentIds
        .map((id) => commands.find((c) => c.id === id))
        .filter((c): c is CommandItem => c !== undefined);

      const others = commands.filter((c) => !recentIds.includes(c.id));

      // Add "Recent" group to recent items
      const recentWithGroup = recent.map((c) => ({ ...c, group: "Recent" }));

      return [...recentWithGroup, ...others];
    }

    // Score and filter
    const scored = commands
      .map((item) => ({ item, score: scoreMatch(search, item) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score);

    return scored.map(({ item }) => item);
  }, [commands, search, recentIds]);

  // Group commands
  const groupedCommands = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    const ungrouped: CommandItem[] = [];

    for (const command of filteredCommands) {
      if (command.group) {
        if (!groups[command.group]) {
          groups[command.group] = [];
        }
        (groups[command.group] as CommandItem[]).push(command);
      } else {
        ungrouped.push(command);
      }
    }

    return { groups, ungrouped };
  }, [filteredCommands]);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setSearch("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => (i < filteredCommands.length - 1 ? i + 1 : 0));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => (i > 0 ? i - 1 : filteredCommands.length - 1));
          break;
        case "Enter": {
          e.preventDefault();
          const selected = filteredCommands[selectedIndex];
          if (selected && !selected.disabled) {
            selected.onSelect();
            close();
          }
          break;
        }
        case "Escape":
          e.preventDefault();
          close();
          break;
      }
    },
    [filteredCommands, selectedIndex, close]
  );

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) {
      return;
    }

    const selectedElement = list.querySelector(`[data-index="${selectedIndex}"]`);
    if (selectedElement) {
      selectedElement.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (!mounted || !open) {
    return null;
  }

  return createPortal(
    <CommandContext.Provider value={{ close, search, selectedIndex }}>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm animate-in fade-in-0 duration-150"
        onClick={close}
        aria-hidden="true"
      />

      {/* Command Palette */}
      <CommandPaletteContent
        inputRef={inputRef}
        listRef={listRef}
        search={search}
        setSearch={setSearch}
        placeholder={placeholder}
        emptyMessage={emptyMessage}
        loading={loading}
        filteredCommands={filteredCommands}
        groupedCommands={groupedCommands}
        selectedIndex={selectedIndex}
        setSelectedIndex={setSelectedIndex}
        onKeyDown={handleKeyDown}
        close={close}
      />
    </CommandContext.Provider>,
    document.body
  );
}

// ============================================
// CommandPaletteContent
// ============================================

interface CommandPaletteContentProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  listRef: React.RefObject<HTMLDivElement | null>;
  search: string;
  setSearch: (value: string) => void;
  placeholder: string;
  emptyMessage: string;
  loading: boolean;
  filteredCommands: CommandItem[];
  groupedCommands: { groups: Record<string, CommandItem[]>; ungrouped: CommandItem[] };
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  close: () => void;
}

function CommandPaletteContent({
  inputRef,
  listRef,
  search,
  setSearch,
  placeholder,
  emptyMessage,
  loading,
  filteredCommands,
  groupedCommands,
  selectedIndex,
  setSelectedIndex,
  onKeyDown,
  close,
}: CommandPaletteContentProps) {
  const { containerRef } = useFocusTrap({
    active: true,
    onEscape: close,
  });

  let itemIndex = 0;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4"
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-stone-800 rounded-xl shadow-2xl border border-stone-200 dark:border-stone-700 overflow-hidden animate-in fade-in-0 zoom-in-95 slide-in-from-top-4 duration-200"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        {/* Search Input */}
        <div className="flex items-center px-4 border-b border-stone-200 dark:border-stone-700">
          <SearchIcon />
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            className="flex-1 py-4 px-3 text-base bg-transparent outline-none text-stone-900 dark:text-stone-100 placeholder:text-stone-400"
            aria-label="Search commands"
            aria-autocomplete="list"
            role="combobox"
            aria-expanded="true"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="p-1 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
              aria-label="Clear search"
            >
              <ClearIcon />
            </button>
          )}
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-2" role="listbox">
          {loading && (
            <div className="flex items-center justify-center py-8 text-stone-500">
              <LoadingSpinner />
              <span className="ml-2">Searching...</span>
            </div>
          )}

          {!loading && filteredCommands.length === 0 && (
            <div className="py-8 text-center text-stone-500 dark:text-stone-400">
              {emptyMessage}
            </div>
          )}

          {!loading && (
            <>
              {/* Ungrouped items */}
              {groupedCommands.ungrouped.map((command) => {
                const currentIndex = itemIndex++;
                return (
                  <CommandItemRow
                    key={command.id}
                    command={command}
                    index={currentIndex}
                    isSelected={selectedIndex === currentIndex}
                    onSelect={() => {
                      if (!command.disabled) {
                        command.onSelect();
                        close();
                      }
                    }}
                    onHover={() => setSelectedIndex(currentIndex)}
                  />
                );
              })}

              {/* Grouped items */}
              {Object.entries(groupedCommands.groups).map(([groupName, groupCommands]) => (
                <div key={groupName}>
                  <div className="px-4 py-2 text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider">
                    {groupName}
                  </div>
                  {groupCommands.map((command) => {
                    const currentIndex = itemIndex++;
                    return (
                      <CommandItemRow
                        key={command.id}
                        command={command}
                        index={currentIndex}
                        isSelected={selectedIndex === currentIndex}
                        onSelect={() => {
                          if (!command.disabled) {
                            command.onSelect();
                            close();
                          }
                        }}
                        onHover={() => setSelectedIndex(currentIndex)}
                      />
                    );
                  })}
                </div>
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-stone-200 dark:border-stone-700 text-xs text-stone-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-stone-100 dark:bg-stone-700 rounded text-[10px]">
                ↑
              </kbd>
              <kbd className="px-1.5 py-0.5 bg-stone-100 dark:bg-stone-700 rounded text-[10px]">
                ↓
              </kbd>
              <span>to navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-stone-100 dark:bg-stone-700 rounded text-[10px]">
                ↵
              </kbd>
              <span>to select</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-stone-100 dark:bg-stone-700 rounded text-[10px]">
                esc
              </kbd>
              <span>to close</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// CommandItemRow
// ============================================

interface CommandItemRowProps {
  command: CommandItem;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onHover: () => void;
}

function CommandItemRow({ command, index, isSelected, onSelect, onHover }: CommandItemRowProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
    }
  };

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
      {/* Icon */}
      {command.icon && (
        <span className="flex-shrink-0 w-5 h-5 text-stone-500 dark:text-stone-400">
          {command.icon}
        </span>
      )}

      {/* Content */}
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

      {/* Shortcut */}
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

// ============================================
// Icons
// ============================================

function SearchIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      className="text-stone-400"
      aria-hidden="true"
    >
      <path
        d="M17.5 17.5L13.875 13.875M15.8333 9.16667C15.8333 12.8486 12.8486 15.8333 9.16667 15.8333C5.48477 15.8333 2.5 12.8486 2.5 9.16667C2.5 5.48477 5.48477 2.5 9.16667 2.5C12.8486 2.5 15.8333 5.48477 15.8333 9.16667Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M12 4L4 12M4 4L12 12"
        stroke="currentColor"
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
      className="animate-spin"
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="8" stroke="#e7e5e4" strokeWidth="2" />
      <path d="M10 2a8 8 0 018 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ============================================
// Exports
// ============================================

export default CommandPalette;
