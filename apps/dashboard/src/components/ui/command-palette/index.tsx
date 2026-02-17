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

const DEFAULT_EMPTY_MESSAGE = "No results found";
const DEFAULT_PLACEHOLDER = "Search commands...";
const DEFAULT_RECENT_MESSAGE = "Recent";
const RECENT_GROUP = "__recent__";

function filterCommands(
	commands: CommandItem[],
	search: string,
	recentIds: string[],
): CommandItem[] {
	if (!search) {
		const recent = recentIds
			.map((id) => commands.find((c) => c.id === id))
			.filter((c): c is CommandItem => c !== undefined);
		const others = commands.filter((c) => !recentIds.includes(c.id));

		return [...recent.map((command) => ({ ...command, group: DEFAULT_RECENT_MESSAGE })), ...others];
	}

	return commands
		.map((item) => ({ item, score: scoreMatch(search, item) }))
		.filter(({ score }) => score > 0)
		.toSorted((a, b) => b.score - a.score)
		.map(({ item }) => item);
}

function groupCommands(commands: CommandItem[]): GroupedCommands {
	const allGroups = Object.groupBy(commands, (command) => command.group ?? RECENT_GROUP);
	const ungrouped = allGroups[RECENT_GROUP] ?? [];
	const { [RECENT_GROUP]: _, ...groups } = allGroups;
	return { groups: groups as Record<string, CommandItem[]>, ungrouped };
}

interface PaletteStateProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	commands: CommandItem[];
	recentIds: string[];
}

function usePaletteSearchState() {
	const [search, setSearch] = useState("");
	const [selectedIndex, setSelectedIndex] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);

	const onSearchChange = useCallback((value: string) => {
		setSearch(value);
		setSelectedIndex(0);
	}, []);

	return {
		search,
		selectedIndex,
		setSelectedIndex,
		inputRef,
		listRef,
		onSearchChange,
	};
}

function usePaletteOpenLifecycle(
	open: boolean,
	setSearch: (value: string) => void,
	setSelectedIndex: (index: number) => void,
) {
	useEffect(() => {
		if (open) {
			setSearch("");
			setSelectedIndex(0);
		}
	}, [open, setSearch, setSelectedIndex]);
}

function useCommandPaletteFilters(commands: CommandItem[], search: string, recentIds: string[]) {
	const filteredCommands = useMemo(
		() => filterCommands(commands, search, recentIds),
		[commands, search, recentIds],
	);
	const groupedCommands = useMemo(() => groupCommands(filteredCommands), [filteredCommands]);

	return { filteredCommands, groupedCommands };
}

function usePaletteKeyboardHandlers(
	filteredCommands: CommandItem[],
	selectedIndex: number,
	close: () => void,
	setSelectedIndex: (index: number) => void,
) {
	return useCallback(
		(event: React.KeyboardEvent) => {
			switch (event.key) {
				case "ArrowDown":
					event.preventDefault();
					setSelectedIndex((selectedIndex + 1) % Math.max(filteredCommands.length, 1));
					break;
				case "ArrowUp":
					event.preventDefault();
					setSelectedIndex(
						(selectedIndex - 1 + filteredCommands.length) % Math.max(filteredCommands.length, 1),
					);
					break;
				case "Enter": {
					event.preventDefault();
					const selected = filteredCommands[selectedIndex];
					if (selected && !selected.disabled) {
						selected.onSelect();
						close();
					}
					break;
				}
				case "Escape":
					event.preventDefault();
					close();
					break;
			}
		},
		[close, filteredCommands, selectedIndex, setSelectedIndex],
	);
}

function usePaletteAutoFocus(open: boolean, inputRef: React.RefObject<HTMLInputElement | null>) {
	useEffect(() => {
		if (!open) {
			return;
		}
		setTimeout(() => {
			inputRef.current?.focus();
		}, 0);
	}, [open, inputRef]);
}

function usePaletteSelectionScroll(
	listRef: React.RefObject<HTMLDivElement | null>,
	selectedIndex: number,
) {
	useEffect(() => {
		const list = listRef.current;
		if (!list) {
			return;
		}

		const selectedElement = list.querySelector(`[data-index="${selectedIndex}"]`);
		if (selectedElement) {
			selectedElement.scrollIntoView({ block: "nearest" });
		}
	}, [listRef, selectedIndex]);
}

function usePaletteState(props: PaletteStateProps) {
	const { open, onOpenChange, commands, recentIds } = props;
	const [mounted, setMounted] = useState(false);
	const { search, selectedIndex, setSelectedIndex, inputRef, listRef, onSearchChange } =
		usePaletteSearchState();
	const { filteredCommands, groupedCommands } = useCommandPaletteFilters(
		commands,
		search,
		recentIds,
	);
	const close = useCallback(() => onOpenChange(false), [onOpenChange]);

	usePaletteOpenLifecycle(open, onSearchChange, setSelectedIndex);

	usePaletteAutoFocus(open, inputRef);
	usePaletteSelectionScroll(listRef, selectedIndex);

	useEffect(() => {
		setMounted(true);
	}, []);

	const handleKeyDown = usePaletteKeyboardHandlers(
		filteredCommands,
		selectedIndex,
		close,
		setSelectedIndex,
	);

	return {
		mounted,
		search,
		selectedIndex,
		inputRef,
		listRef,
		close,
		filteredCommands,
		groupedCommands,
		setSelectedIndex,
		onSearchChange,
		handleKeyDown,
	};
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
	onKeyDown: (event: React.KeyboardEvent) => void;
	close: () => void;
}

function CommandPaletteShell({
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
						<KbdShortcut left="↑" right="↓" label="to navigate" />
						<KbdShortcut left="↵" label="to select" />
						<KbdShortcut left="esc" label="to close" />
					</div>
				</div>
			</div>
		</div>
	);
}

function KbdShortcut({ left, right, label }: { left: string; right?: string; label: string }) {
	return (
		<span className="flex items-center gap-1">
			<kbd className="px-1.5 py-0.5 bg-stone-100 dark:bg-stone-700 rounded text-[10px]">{left}</kbd>
			{right && (
				<kbd className="px-1.5 py-0.5 bg-stone-100 dark:bg-stone-700 rounded text-[10px]">
					{right}
				</kbd>
			)}
			<span>{label}</span>
		</span>
	);
}

function CommandPalettePortal({
	close,
	search,
	selectedIndex,
	inputRef,
	listRef,
	placeholder,
	emptyMessage,
	loading,
	filteredCommands,
	groupedCommands,
	handleKeyDown,
	onSearchChange,
	setSelectedIndex,
}: {
	close: () => void;
	search: string;
	selectedIndex: number;
	inputRef: React.RefObject<HTMLInputElement | null>;
	listRef: React.RefObject<HTMLDivElement | null>;
	placeholder: string;
	emptyMessage: string;
	loading: boolean;
	filteredCommands: CommandItem[];
	groupedCommands: GroupedCommands;
	handleKeyDown: (event: React.KeyboardEvent) => void;
	onSearchChange: (value: string) => void;
	setSelectedIndex: (index: number) => void;
}) {
	return createPortal(
		<>
			<div
				className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm animate-in fade-in-0 duration-150"
				onClick={close}
				aria-hidden="true"
			/>
			<CommandContext.Provider value={{ close, search, selectedIndex }}>
				<CommandPaletteShell
					inputRef={inputRef}
					listRef={listRef}
					search={search}
					setSearch={onSearchChange}
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
			</CommandContext.Provider>
		</>,
		document.body,
	);
}

/**
 * Command Palette - Quick navigation and actions.
 */
export function CommandPalette({
	open,
	onOpenChange,
	commands,
	placeholder = DEFAULT_PLACEHOLDER,
	emptyMessage = DEFAULT_EMPTY_MESSAGE,
	loading = false,
	recentIds = [],
}: CommandPaletteProps) {
	const {
		mounted,
		search,
		selectedIndex,
		inputRef,
		listRef,
		close,
		filteredCommands,
		groupedCommands,
		setSelectedIndex,
		onSearchChange,
		handleKeyDown,
	} = usePaletteState({ open, onOpenChange, commands, recentIds });

	if (!mounted || !open) {
		return null;
	}

	return (
		<CommandPalettePortal
			close={close}
			search={search}
			selectedIndex={selectedIndex}
			inputRef={inputRef}
			listRef={listRef}
			placeholder={placeholder}
			emptyMessage={emptyMessage}
			loading={loading}
			filteredCommands={filteredCommands}
			groupedCommands={groupedCommands}
			onSearchChange={onSearchChange}
			handleKeyDown={handleKeyDown}
			setSelectedIndex={setSelectedIndex}
		/>
	);
}

export type { CommandItem, CommandPaletteProps } from "./types";
export { fuzzyMatch, scoreMatch } from "./utils";
export default CommandPalette;
