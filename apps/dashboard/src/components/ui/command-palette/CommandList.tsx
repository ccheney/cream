/**
 * Command Palette List Component
 */

"use client";

import type React from "react";
import { CommandItemRow } from "./CommandItem";
import { LoadingSpinner } from "./icons";
import type { CommandItem, GroupedCommands } from "./types";

export interface CommandListProps {
  listRef: React.RefObject<HTMLDivElement | null>;
  loading: boolean;
  emptyMessage: string;
  filteredCommands: CommandItem[];
  groupedCommands: GroupedCommands;
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  close: () => void;
}

export function CommandList({
  listRef,
  loading,
  emptyMessage,
  filteredCommands,
  groupedCommands,
  selectedIndex,
  setSelectedIndex,
  close,
}: CommandListProps) {
  let itemIndex = 0;

  function handleSelect(command: CommandItem): void {
    if (!command.disabled) {
      command.onSelect();
      close();
    }
  }

  return (
    <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-2" role="listbox">
      {loading && (
        <div className="flex items-center justify-center py-8 text-stone-500">
          <LoadingSpinner />
          <span className="ml-2">Searching...</span>
        </div>
      )}

      {!loading && filteredCommands.length === 0 && (
        <div className="py-8 text-center text-stone-500 dark:text-stone-400">{emptyMessage}</div>
      )}

      {!loading && (
        <>
          {groupedCommands.ungrouped.map((command) => {
            const currentIndex = itemIndex++;
            return (
              <CommandItemRow
                key={command.id}
                command={command}
                index={currentIndex}
                isSelected={selectedIndex === currentIndex}
                onSelect={() => handleSelect(command)}
                onHover={() => setSelectedIndex(currentIndex)}
              />
            );
          })}

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
                    onSelect={() => handleSelect(command)}
                    onHover={() => setSelectedIndex(currentIndex)}
                  />
                );
              })}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
