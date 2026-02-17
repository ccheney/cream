/**
 * KeyboardShortcutsProvider
 *
 * Context provider for global keyboard shortcuts with help dialog.
 *
 * @see docs/plans/ui/29-accessibility.md keyboard shortcuts
 */

"use client";

import { useRouter } from "next/navigation";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import {
	Dialog,
	DialogBody,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { type KeyboardShortcut, useKeyboardShortcuts } from "@/lib/hooks/useKeyboardShortcuts";

export interface KeyboardShortcutsContextValue {
	register: (shortcut: KeyboardShortcut) => void;
	unregister: (id: string) => void;
	getShortcuts: () => KeyboardShortcut[];
	openHelp: () => void;
	closeHelp: () => void;
	isHelpOpen: boolean;
	scope: string | undefined;
	setScope: (scope: string | undefined) => void;
}

export interface KeyboardShortcutsProviderProps {
	children: ReactNode;
	initialScope?: string;
}

const KeyboardShortcutsContext = createContext<KeyboardShortcutsContextValue | null>(null);

export function useKeyboardShortcutsContext(): KeyboardShortcutsContextValue {
	const context = useContext(KeyboardShortcutsContext);
	if (!context) {
		throw new Error("useKeyboardShortcutsContext must be used within a KeyboardShortcutsProvider");
	}
	return context;
}

function KeyBadge({ children }: { children: string }): ReactNode {
	return (
		<kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 text-xs font-medium rounded bg-stone-100 dark:bg-stone-700 border border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-300">
			{children}
		</kbd>
	);
}

function ShortcutKeys({ keys }: { keys: string[] }): ReactNode {
	return (
		<div className="flex items-center gap-1">
			{keys.map((key) => (
				<KeyBadge key={key}>{formatKeyDisplay(key)}</KeyBadge>
			))}
		</div>
	);
}

function formatKeyDisplay(key: string): string {
	const isMac =
		typeof navigator !== "undefined" && navigator.platform?.toLowerCase().includes("mac");

	switch (key.toLowerCase()) {
		case "ctrl":
			return isMac ? "⌃" : "Ctrl";
		case "alt":
			return isMac ? "⌥" : "Alt";
		case "shift":
			return "⇧";
		case "meta":
			return isMac ? "⌘" : "Win";
		case "esc":
			return "Esc";
		case "enter":
			return "↵";
		case "up":
			return "↑";
		case "down":
			return "↓";
		case "left":
			return "←";
		case "right":
			return "→";
		case "space":
			return "Space";
		case "?":
			return "?";
		default:
			return key.toUpperCase();
	}
}

interface ShortcutsHelpDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	shortcuts: KeyboardShortcut[];
}

function ShortcutsHelpDialog({
	open,
	onOpenChange,
	shortcuts,
}: ShortcutsHelpDialogProps): ReactNode {
	const grouped = useMemo(() => {
		const groups = Object.groupBy(shortcuts, (s) => s.group ?? "General");

		const sortedGroups = Object.entries(groups).toSorted(([a], [b]) => {
			if (a === "General") {
				return -1;
			}
			if (b === "General") {
				return 1;
			}
			return a.localeCompare(b);
		});

		return sortedGroups as [string, KeyboardShortcut[]][];
	}, [shortcuts]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent maxWidth="max-w-lg">
				<DialogHeader>
					<DialogTitle>Keyboard Shortcuts</DialogTitle>
					<DialogDescription>Use these shortcuts to navigate quickly.</DialogDescription>
				</DialogHeader>

				<DialogBody className="max-h-[60vh] overflow-y-auto">
					<div className="space-y-6">
						{grouped.map(([groupName, groupShortcuts]) => (
							<div key={groupName}>
								<h3 className="text-sm font-medium text-stone-500 dark:text-stone-400 mb-3">
									{groupName}
								</h3>
								<div className="space-y-2">
									{groupShortcuts.map((shortcut) => (
										<div key={shortcut.id} className="flex items-center justify-between py-1.5">
											<span className="text-sm text-stone-700 dark:text-stone-300">
												{shortcut.description ?? shortcut.name}
											</span>
											<ShortcutKeys keys={shortcut.keys} />
										</div>
									))}
								</div>
							</div>
						))}
					</div>
				</DialogBody>

				<DialogFooter>
					<DialogClose>Close</DialogClose>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function emitNavigationEvent(detail: { direction?: "prev" | "next"; action?: "select" }) {
	window.dispatchEvent(new CustomEvent("keyboard-nav", { detail }));
}

interface ShortcutDefinitionsOptions {
	openHelp: () => void;
	closeHelp: () => void;
	goConsole: () => void;
	goPortfolio: () => void;
	goDecisions: () => void;
	goTheses: () => void;
	goSettings: () => void;
}

interface ShortcutNavigationHandlers extends ShortcutDefinitionsOptions {}

const STATIC_SHORTCUT_DEFINITIONS: Omit<KeyboardShortcut, "handler">[] = [
	{
		id: "prev-item",
		name: "Previous item",
		keys: ["k"],
		group: "Lists",
		description: "Move to previous item",
	},
	{
		id: "prev-item-arrow",
		name: "Previous item (arrow)",
		keys: ["up"],
		group: "Lists",
		description: "Move to previous item",
	},
	{
		id: "next-item",
		name: "Next item",
		keys: ["j"],
		group: "Lists",
		description: "Move to next item",
	},
	{
		id: "next-item-arrow",
		name: "Next item (arrow)",
		keys: ["down"],
		group: "Lists",
		description: "Move to next item",
	},
	{
		id: "select-item",
		name: "Select item",
		keys: ["enter"],
		group: "Lists",
		description: "Select or open current item",
	},
] as const;

function createNavigationHandler(id: string) {
	if (id === "select-item") {
		return () => emitNavigationEvent({ action: "select" });
	}
	return () => emitNavigationEvent({ direction: id.startsWith("prev") ? "prev" : "next" });
}

function buildShortcutDefinitions({
	openHelp,
	closeHelp,
	goConsole,
	goPortfolio,
	goDecisions,
	goTheses,
	goSettings,
}: ShortcutNavigationHandlers): KeyboardShortcut[] {
	const listNavigationShortcuts = STATIC_SHORTCUT_DEFINITIONS.map((shortcut) => ({
		...shortcut,
		handler: createNavigationHandler(shortcut.id),
	}));

	return [
		{
			id: "show-help",
			name: "Show keyboard shortcuts",
			keys: ["?"],
			group: "General",
			description: "Show this help dialog",
			handler: openHelp,
		},
		{
			id: "close-modal",
			name: "Close",
			keys: ["esc"],
			group: "General",
			description: "Close modal or drawer",
			handler: closeHelp,
		},
		{
			id: "go-console",
			name: "Go to Console",
			keys: ["g", "d"],
			group: "Navigation",
			description: "Go to Console",
			handler: goConsole,
		},
		{
			id: "go-portfolio",
			name: "Go to Portfolio",
			keys: ["g", "p"],
			group: "Navigation",
			description: "Go to Portfolio",
			handler: goPortfolio,
		},
		{
			id: "go-decisions",
			name: "Go to Decisions",
			keys: ["g", "t"],
			group: "Navigation",
			description: "Go to Decisions",
			handler: goDecisions,
		},
		{
			id: "go-theses",
			name: "Go to Theses",
			keys: ["g", "h"],
			group: "Navigation",
			description: "Go to Theses",
			handler: goTheses,
		},
		{
			id: "go-settings",
			name: "Go to Settings",
			keys: ["g", "s"],
			group: "Navigation",
			description: "Go to Settings",
			handler: goSettings,
		},
		...listNavigationShortcuts,
	];
}

function registerShortcutHandlers(
	shortcuts: KeyboardShortcut[],
	register: (shortcut: KeyboardShortcut) => void,
	unregister: (id: string) => void,
) {
	for (const shortcut of shortcuts) {
		register(shortcut);
	}

	return () => {
		for (const shortcut of shortcuts) {
			unregister(shortcut.id);
		}
	};
}

function useShortcutState(clearSequence: () => void) {
	const [isHelpOpen, setIsHelpOpen] = useState(false);

	const openHelp = useCallback(() => {
		setIsHelpOpen(true);
	}, []);

	const closeHelp = useCallback(() => {
		setIsHelpOpen(false);
		clearSequence();
	}, [clearSequence]);

	const closeHelpIfOpen = useCallback(() => {
		if (!isHelpOpen) {
			return;
		}
		closeHelp();
	}, [isHelpOpen, closeHelp]);

	return {
		isHelpOpen,
		openHelp,
		closeHelp,
		closeHelpIfOpen,
		setIsHelpOpen,
	};
}

function useShortcutRegistrationEffect(
	shortcuts: KeyboardShortcut[],
	register: (shortcut: KeyboardShortcut) => void,
	unregister: (id: string) => void,
) {
	useEffect(() => {
		return registerShortcutHandlers(shortcuts, register, unregister);
	}, [shortcuts, register, unregister]);
}

export function KeyboardShortcutsProvider({
	children,
	initialScope,
}: KeyboardShortcutsProviderProps): ReactNode {
	const router = useRouter();
	const [scope, setScope] = useState<string | undefined>(initialScope);

	const { register, unregister, getShortcuts, clearSequence } = useKeyboardShortcuts({
		scope,
		enabled: true,
	});

	const { isHelpOpen, openHelp, closeHelp, closeHelpIfOpen, setIsHelpOpen } =
		useShortcutState(clearSequence);
	const shortcutDefinitions = useMemo(
		() =>
			buildShortcutDefinitions({
				openHelp,
				closeHelp: closeHelpIfOpen,
				goConsole: () => router.push("/console"),
				goPortfolio: () => router.push("/portfolio"),
				goDecisions: () => router.push("/decisions"),
				goTheses: () => router.push("/theses"),
				goSettings: () => router.push("/config"),
			}),
		[openHelp, closeHelpIfOpen, router],
	);
	useShortcutRegistrationEffect(shortcutDefinitions, register, unregister);

	const value = useMemo(
		() => ({
			register,
			unregister,
			getShortcuts,
			openHelp,
			closeHelp,
			isHelpOpen,
			scope,
			setScope,
		}),
		[register, unregister, getShortcuts, openHelp, closeHelp, isHelpOpen, scope],
	);

	return (
		<KeyboardShortcutsContext.Provider value={value}>
			{children}
			<ShortcutsHelpDialog
				open={isHelpOpen}
				onOpenChange={setIsHelpOpen}
				shortcuts={shortcutDefinitions}
			/>
		</KeyboardShortcutsContext.Provider>
	);
}

export default KeyboardShortcutsProvider;
