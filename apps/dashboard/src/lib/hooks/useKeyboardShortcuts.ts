"use client";

import {
	type Dispatch,
	type MutableRefObject,
	type SetStateAction,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

export type KeyModifier = "ctrl" | "alt" | "shift" | "meta";

export interface KeyboardShortcut {
	id: string;
	name: string;
	keys: string[];
	handler: (event: KeyboardEvent) => void;
	group?: string;
	description?: string;
	enabled?: boolean;
	preventDefault?: boolean;
	scope?: string;
}

export interface UseKeyboardShortcutsOptions {
	sequenceTimeout?: number;
	enabled?: boolean;
	scope?: string;
}

export interface UseKeyboardShortcutsReturn {
	register: (shortcut: KeyboardShortcut) => void;
	unregister: (id: string) => void;
	getShortcuts: () => KeyboardShortcut[];
	clearSequence: () => void;
	pendingSequence: string[];
	shortcuts: KeyboardShortcut[];
}

const DEFAULT_SEQUENCE_TIMEOUT = 500;
const IGNORE_ELEMENTS = new Set(["INPUT", "TEXTAREA", "SELECT", "BUTTON"]);
const MODIFIER_KEYS = new Set(["ctrl", "alt", "shift", "meta"]);

type ShortcutMapRef = MutableRefObject<Map<string, KeyboardShortcut>>;
type SequenceRef = MutableRefObject<string[]>;
type SequenceTimeoutRef = MutableRefObject<ReturnType<typeof setTimeout> | null>;
type SetSequence = Dispatch<SetStateAction<string[]>>;

function normalizeKey(key: string): string {
	const lower = key.toLowerCase();

	switch (lower) {
		case "arrowup":
			return "up";
		case "arrowdown":
			return "down";
		case "arrowleft":
			return "left";
		case "arrowright":
			return "right";
		case "escape":
			return "esc";
		case " ":
			return "space";
		case "control":
			return "ctrl";
		case "command":
		case "os":
			return "meta";
		default:
			return lower;
	}
}

function getModifiers(event: KeyboardEvent): KeyModifier[] {
	const modifiers: KeyModifier[] = [];
	if (event.ctrlKey) {
		modifiers.push("ctrl");
	}
	if (event.altKey) {
		modifiers.push("alt");
	}
	if (event.shiftKey) {
		modifiers.push("shift");
	}
	if (event.metaKey) {
		modifiers.push("meta");
	}
	return modifiers;
}

function shouldIgnoreElement(target: EventTarget | null): boolean {
	if (!target || !(target instanceof Element)) {
		return false;
	}
	if (IGNORE_ELEMENTS.has(target.tagName)) {
		return true;
	}
	if (target.getAttribute("contenteditable") === "true") {
		return true;
	}
	if (target.getAttribute("role") === "textbox") {
		return true;
	}
	return false;
}

function sequenceMatches(sequence: string[], shortcutKeys: string[]): boolean {
	if (sequence.length !== shortcutKeys.length) {
		return false;
	}
	return sequence.every((key, index) => {
		const shortcutKey = shortcutKeys[index];
		return shortcutKey !== undefined && key === normalizeKey(shortcutKey);
	});
}

function isPrefix(sequence: string[], shortcutKeys: string[]): boolean {
	if (sequence.length >= shortcutKeys.length) {
		return false;
	}
	return sequence.every((key, index) => {
		const shortcutKey = shortcutKeys[index];
		return shortcutKey !== undefined && key === normalizeKey(shortcutKey);
	});
}

function clearSequenceTimer(sequenceTimeoutRef: SequenceTimeoutRef): void {
	if (!sequenceTimeoutRef.current) {
		return;
	}
	clearTimeout(sequenceTimeoutRef.current);
	sequenceTimeoutRef.current = null;
}

function isModifierKey(key: string): boolean {
	return MODIFIER_KEYS.has(key);
}

function buildKeyString(key: string, modifiers: KeyModifier[], sequenceLength: number): string {
	if (sequenceLength > 0 || modifiers.length === 0) {
		return key;
	}

	const isPrintableWithShift =
		modifiers.length === 1 && modifiers[0] === "shift" && key.length === 1;
	if (isPrintableWithShift) {
		return key;
	}

	return [...modifiers.toSorted(), key].join("+");
}

function matchesShortcutScope(shortcut: KeyboardShortcut, scope: string | undefined): boolean {
	if (shortcut.enabled === false) {
		return false;
	}
	if (shortcut.scope && shortcut.scope !== scope) {
		return false;
	}
	return true;
}

interface ShortcutEvaluationResult {
	matched: boolean;
	hasPrefix: boolean;
}

function evaluateShortcutSequence(
	shortcutsRef: ShortcutMapRef,
	sequence: string[],
	scope: string | undefined,
	event: KeyboardEvent,
): ShortcutEvaluationResult {
	let matched = false;
	let hasPrefix = false;

	for (const shortcut of shortcutsRef.current.values()) {
		if (!matchesShortcutScope(shortcut, scope)) {
			continue;
		}

		const normalizedKeys = shortcut.keys.map(normalizeKey);
		if (sequenceMatches(sequence, normalizedKeys)) {
			matched = true;
			if (shortcut.preventDefault !== false) {
				event.preventDefault();
			}
			shortcut.handler(event);
			break;
		}

		if (isPrefix(sequence, normalizedKeys)) {
			hasPrefix = true;
		}
	}

	return { matched, hasPrefix };
}

interface KeyDownHandlerOptions {
	scope: string | undefined;
	sequenceTimeout: number;
	shortcutsRef: ShortcutMapRef;
	sequenceRef: SequenceRef;
	sequenceTimeoutRef: SequenceTimeoutRef;
	setPendingSequence: SetSequence;
	clearSequence: () => void;
}

function createKeyDownHandler({
	scope,
	sequenceTimeout,
	shortcutsRef,
	sequenceRef,
	sequenceTimeoutRef,
	setPendingSequence,
	clearSequence,
}: KeyDownHandlerOptions): (event: KeyboardEvent) => void {
	return (event) => {
		if (shouldIgnoreElement(event.target) && event.key !== "Escape") {
			return;
		}

		const key = normalizeKey(event.key);
		if (isModifierKey(key)) {
			return;
		}

		const modifiers = getModifiers(event);
		const keyString = buildKeyString(key, modifiers, sequenceRef.current.length);
		sequenceRef.current = [...sequenceRef.current, keyString];
		setPendingSequence([...sequenceRef.current]);
		clearSequenceTimer(sequenceTimeoutRef);

		const { matched, hasPrefix } = evaluateShortcutSequence(
			shortcutsRef,
			sequenceRef.current,
			scope,
			event,
		);
		if (matched || !hasPrefix) {
			clearSequence();
			return;
		}
		sequenceTimeoutRef.current = setTimeout(clearSequence, sequenceTimeout);
	};
}

interface KeyboardListenerEffectOptions {
	enabled: boolean;
	scope: string | undefined;
	sequenceTimeout: number;
	shortcutsRef: ShortcutMapRef;
	sequenceRef: SequenceRef;
	sequenceTimeoutRef: SequenceTimeoutRef;
	setPendingSequence: SetSequence;
	clearSequence: () => void;
}

function useKeyboardListenerEffect({
	enabled,
	scope,
	sequenceTimeout,
	shortcutsRef,
	sequenceRef,
	sequenceTimeoutRef,
	setPendingSequence,
	clearSequence,
}: KeyboardListenerEffectOptions): void {
	useEffect(() => {
		if (!enabled) {
			return;
		}

		const handleKeyDown = createKeyDownHandler({
			scope,
			sequenceTimeout,
			shortcutsRef,
			sequenceRef,
			sequenceTimeoutRef,
			setPendingSequence,
			clearSequence,
		});

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [
		enabled,
		scope,
		sequenceTimeout,
		shortcutsRef,
		sequenceRef,
		sequenceTimeoutRef,
		setPendingSequence,
		clearSequence,
	]);
}

interface ShortcutRegistry {
	shortcutsRef: ShortcutMapRef;
	shortcuts: KeyboardShortcut[];
	register: (shortcut: KeyboardShortcut) => void;
	unregister: (id: string) => void;
	getShortcuts: () => KeyboardShortcut[];
}

function useShortcutRegistry(): ShortcutRegistry {
	const shortcutsRef = useRef<Map<string, KeyboardShortcut>>(new Map());
	const [shortcuts, setShortcuts] = useState<KeyboardShortcut[]>([]);

	const syncShortcuts = useCallback(() => {
		setShortcuts(Array.from(shortcutsRef.current.values()));
	}, []);

	const register = useCallback(
		(shortcut: KeyboardShortcut) => {
			shortcutsRef.current.set(shortcut.id, shortcut);
			syncShortcuts();
		},
		[syncShortcuts],
	);

	const unregister = useCallback(
		(id: string) => {
			shortcutsRef.current.delete(id);
			syncShortcuts();
		},
		[syncShortcuts],
	);

	const getShortcuts = useCallback(() => {
		return Array.from(shortcutsRef.current.values());
	}, []);

	return {
		shortcutsRef,
		shortcuts,
		register,
		unregister,
		getShortcuts,
	};
}

export function useKeyboardShortcuts(
	options: UseKeyboardShortcutsOptions = {},
): UseKeyboardShortcutsReturn {
	const { sequenceTimeout = DEFAULT_SEQUENCE_TIMEOUT, enabled = true, scope } = options;
	const { shortcutsRef, shortcuts, register, unregister, getShortcuts } = useShortcutRegistry();

	const sequenceRef = useRef<string[]>([]);
	const sequenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [pendingSequence, setPendingSequence] = useState<string[]>([]);

	const clearSequence = useCallback(() => {
		sequenceRef.current = [];
		setPendingSequence([]);
		clearSequenceTimer(sequenceTimeoutRef);
	}, []);

	useKeyboardListenerEffect({
		enabled,
		scope,
		sequenceTimeout,
		shortcutsRef,
		sequenceRef,
		sequenceTimeoutRef,
		setPendingSequence,
		clearSequence,
	});

	useEffect(() => {
		return () => {
			clearSequenceTimer(sequenceTimeoutRef);
		};
	}, []);

	return {
		register,
		unregister,
		getShortcuts,
		clearSequence,
		pendingSequence,
		shortcuts,
	};
}

export default useKeyboardShortcuts;
