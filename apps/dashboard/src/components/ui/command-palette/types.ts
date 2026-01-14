/**
 * Command Palette Types
 */

import type React from "react";

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

export interface CommandContextValue {
	close: () => void;
	search: string;
	selectedIndex: number;
}

export interface GroupedCommands {
	groups: Record<string, CommandItem[]>;
	ungrouped: CommandItem[];
}
