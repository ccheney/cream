/**
 * Command Palette Component
 *
 * Linear/Raycast-style command palette for quick navigation and actions.
 *
 * @see docs/plans/ui/20-design-philosophy.md
 */

"use client";

import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import { CommandInput } from "./CommandInput";
import { CommandList } from "./CommandList";
import { CommandContext } from "./context";
import type { CommandItem, CommandPaletteProps, GroupedCommands } from "./types";
import { scoreMatch } from "./utils";

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

  useEffect(() => {
    setMounted(true);
  }, []);

  const close = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const filteredCommands = useMemo(() => {
    if (!search) {
      const recent = recentIds
        .map((id) => commands.find((c) => c.id === id))
        .filter((c): c is CommandItem => c !== undefined);

      const others = commands.filter((c) => !recentIds.includes(c.id));
      const recentWithGroup = recent.map((c) => ({ ...c, group: "Recent" }));

      return [...recentWithGroup, ...others];
    }

    const scored = commands
      .map((item) => ({ item, score: scoreMatch(search, item) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score);

    return scored.map(({ item }) => item);
  }, [commands, search, recentIds]);

  const groupedCommands = useMemo((): GroupedCommands => {
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

  useEffect(() => {
    if (open) {
      setSearch("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

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
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm animate-in fade-in-0 duration-150"
        onClick={close}
        aria-hidden="true"
      />

      <CommandPaletteContent
        inputRef={inputRef}
        listRef={listRef}
        search={search}
        setSearch={(value) => {
          setSearch(value);
          setSelectedIndex(0);
        }}
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

interface CommandPaletteContentProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  listRef: React.RefObject<HTMLDivElement | null>;
  search: string;
  setSearch: (value: string) => void;
  placeholder: string;
  emptyMessage: string;
  loading: boolean;
  filteredCommands: CommandItem[];
  groupedCommands: GroupedCommands;
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
        <CommandInput
          inputRef={inputRef}
          value={search}
          onChange={setSearch}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
        />

        <CommandList
          listRef={listRef}
          loading={loading}
          emptyMessage={emptyMessage}
          filteredCommands={filteredCommands}
          groupedCommands={groupedCommands}
          selectedIndex={selectedIndex}
          setSelectedIndex={setSelectedIndex}
          close={close}
        />

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

export type { CommandItem, CommandPaletteProps } from "./types";
export { fuzzyMatch, scoreMatch } from "./utils";
export default CommandPalette;
