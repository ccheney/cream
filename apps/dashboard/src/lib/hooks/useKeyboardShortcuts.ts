/**
 * useKeyboardShortcuts Hook
 *
 * Keyboard shortcut management with sequence support (e.g., 'g d' for Go to Dashboard).
 *
 * @see docs/plans/ui/29-accessibility.md keyboard shortcuts
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ============================================
// Types
// ============================================

export type KeyModifier = "ctrl" | "alt" | "shift" | "meta";

export interface KeyboardShortcut {
  /** Unique identifier for the shortcut */
  id: string;
  /** Display name */
  name: string;
  /** Key sequence (e.g., ['g', 'd'] or ['?'] or ['ctrl', 'k']) */
  keys: string[];
  /** Callback when shortcut is triggered */
  handler: (event: KeyboardEvent) => void;
  /** Group for organizing in help dialog */
  group?: string;
  /** Description for help dialog */
  description?: string;
  /** Whether shortcut is enabled (default: true) */
  enabled?: boolean;
  /** Whether to prevent default browser behavior */
  preventDefault?: boolean;
  /** Scope - only active when matching scope is current */
  scope?: string;
}

export interface UseKeyboardShortcutsOptions {
  /** Maximum time between keys in a sequence (ms) */
  sequenceTimeout?: number;
  /** Whether shortcuts are enabled globally */
  enabled?: boolean;
  /** Current scope */
  scope?: string;
}

export interface UseKeyboardShortcutsReturn {
  /** Register a new shortcut */
  register: (shortcut: KeyboardShortcut) => void;
  /** Unregister a shortcut by id */
  unregister: (id: string) => void;
  /** Get all registered shortcuts */
  getShortcuts: () => KeyboardShortcut[];
  /** Clear current sequence */
  clearSequence: () => void;
  /** Current pending sequence */
  pendingSequence: string[];
  /** All registered shortcuts (reactive) */
  shortcuts: KeyboardShortcut[];
}

// ============================================
// Constants
// ============================================

const DEFAULT_SEQUENCE_TIMEOUT = 500;

// Elements that should not trigger shortcuts when focused
const IGNORE_ELEMENTS = new Set(["INPUT", "TEXTAREA", "SELECT", "BUTTON"]);

// ============================================
// Utility Functions
// ============================================

/**
 * Normalize a key to lowercase, handling special keys.
 */
function normalizeKey(key: string): string {
  const lower = key.toLowerCase();

  // Map special keys
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

/**
 * Get modifier keys from event.
 */
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

/**
 * Check if an element should ignore keyboard shortcuts.
 */
function shouldIgnoreElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) {
    return false;
  }

  // Check if element is editable
  if (IGNORE_ELEMENTS.has(target.tagName)) {
    return true;
  }

  // Check for contenteditable
  if (target.getAttribute("contenteditable") === "true") {
    return true;
  }

  // Check for role="textbox"
  if (target.getAttribute("role") === "textbox") {
    return true;
  }

  return false;
}

/**
 * Check if a sequence matches a shortcut's keys.
 */
function sequenceMatches(sequence: string[], shortcutKeys: string[]): boolean {
  if (sequence.length !== shortcutKeys.length) {
    return false;
  }

  return sequence.every((key, index) => {
    const shortcutKey = shortcutKeys[index];
    return shortcutKey !== undefined && key === normalizeKey(shortcutKey);
  });
}

/**
 * Check if a sequence is a prefix of a shortcut's keys.
 */
function isPrefix(sequence: string[], shortcutKeys: string[]): boolean {
  if (sequence.length >= shortcutKeys.length) {
    return false;
  }

  return sequence.every((key, index) => {
    const shortcutKey = shortcutKeys[index];
    return shortcutKey !== undefined && key === normalizeKey(shortcutKey);
  });
}

// ============================================
// Hook
// ============================================

/**
 * Hook for managing keyboard shortcuts with sequence support.
 *
 * @example
 * ```tsx
 * function App() {
 *   const { register } = useKeyboardShortcuts();
 *
 *   useEffect(() => {
 *     register({
 *       id: 'go-console',
 *       name: 'Go to Console',
 *       keys: ['g', 'd'],
 *       group: 'Navigation',
 *       handler: () => router.push('/console'),
 *     });
 *
 *     register({
 *       id: 'show-help',
 *       name: 'Show shortcuts',
 *       keys: ['?'],
 *       handler: () => setHelpOpen(true),
 *     });
 *   }, [register]);
 * }
 * ```
 */
export function useKeyboardShortcuts(
  options: UseKeyboardShortcutsOptions = {}
): UseKeyboardShortcutsReturn {
  const { sequenceTimeout = DEFAULT_SEQUENCE_TIMEOUT, enabled = true, scope } = options;

  const shortcutsRef = useRef<Map<string, KeyboardShortcut>>(new Map());
  const sequenceRef = useRef<string[]>([]);
  const sequenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingSequence, setPendingSequence] = useState<string[]>([]);
  const [shortcuts, setShortcuts] = useState<KeyboardShortcut[]>([]);

  const clearSequence = useCallback(() => {
    sequenceRef.current = [];
    setPendingSequence([]);
    if (sequenceTimeoutRef.current) {
      clearTimeout(sequenceTimeoutRef.current);
      sequenceTimeoutRef.current = null;
    }
  }, []);

  const register = useCallback((shortcut: KeyboardShortcut) => {
    shortcutsRef.current.set(shortcut.id, shortcut);
    setShortcuts(Array.from(shortcutsRef.current.values()));
  }, []);

  const unregister = useCallback((id: string) => {
    shortcutsRef.current.delete(id);
    setShortcuts(Array.from(shortcutsRef.current.values()));
  }, []);

  const getShortcuts = useCallback(() => {
    return Array.from(shortcutsRef.current.values());
  }, []);

  // Handle keydown events
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if typing in an input
      if (shouldIgnoreElement(event.target)) {
        // Still handle Escape in inputs
        if (event.key !== "Escape") {
          return;
        }
      }

      const key = normalizeKey(event.key);
      const modifiers = getModifiers(event);

      // Skip modifier-only presses
      if (["ctrl", "alt", "shift", "meta"].includes(key)) {
        return;
      }

      // Build the current key string (with modifiers for single-key shortcuts)
      let keyString = key;
      if (sequenceRef.current.length === 0 && modifiers.length > 0) {
        // For single-key shortcuts with modifiers, include modifiers
        // But exclude shift for printable characters (shift+/ produces ?, shift+1 produces !, etc.)
        const isPrintableWithShift =
          modifiers.length === 1 && modifiers[0] === "shift" && key.length === 1;
        if (!isPrintableWithShift) {
          keyString = [...modifiers.sort(), key].join("+");
        }
      }

      // Add to sequence
      sequenceRef.current = [...sequenceRef.current, keyString];
      setPendingSequence([...sequenceRef.current]);

      // Clear existing timeout
      if (sequenceTimeoutRef.current) {
        clearTimeout(sequenceTimeoutRef.current);
      }

      // Check for matches
      let matched = false;
      let hasPrefix = false;

      for (const shortcut of shortcutsRef.current.values()) {
        // Skip disabled shortcuts
        if (shortcut.enabled === false) {
          continue;
        }

        // Check scope
        if (shortcut.scope && shortcut.scope !== scope) {
          continue;
        }

        // Normalize shortcut keys
        const normalizedKeys = shortcut.keys.map(normalizeKey);

        // Check for exact match
        if (sequenceMatches(sequenceRef.current, normalizedKeys)) {
          matched = true;

          if (shortcut.preventDefault !== false) {
            event.preventDefault();
          }

          shortcut.handler(event);
          break;
        }

        // Check for prefix (potential match)
        if (isPrefix(sequenceRef.current, normalizedKeys)) {
          hasPrefix = true;
        }
      }

      // Clear sequence if matched or no potential matches
      if (matched || !hasPrefix) {
        clearSequence();
      } else {
        // Set timeout to clear sequence
        sequenceTimeoutRef.current = setTimeout(clearSequence, sequenceTimeout);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, scope, sequenceTimeout, clearSequence]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sequenceTimeoutRef.current) {
        clearTimeout(sequenceTimeoutRef.current);
      }
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

// ============================================
// Exports
// ============================================

export default useKeyboardShortcuts;
