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

export function KeyboardShortcutsProvider({
  children,
  initialScope,
}: KeyboardShortcutsProviderProps): ReactNode {
  const router = useRouter();
  const [scope, setScope] = useState<string | undefined>(initialScope);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const { register, unregister, getShortcuts, clearSequence } = useKeyboardShortcuts({
    scope,
    enabled: true,
  });

  const openHelp = useCallback(() => {
    setIsHelpOpen(true);
  }, []);

  const closeHelp = useCallback(() => {
    setIsHelpOpen(false);
    clearSequence();
  }, [clearSequence]);

  useEffect(() => {
    register({
      id: "show-help",
      name: "Show keyboard shortcuts",
      keys: ["?"],
      group: "General",
      description: "Show this help dialog",
      handler: () => openHelp(),
    });

    register({
      id: "close-modal",
      name: "Close",
      keys: ["esc"],
      group: "General",
      description: "Close modal or drawer",
      handler: () => {
        if (isHelpOpen) {
          closeHelp();
        }
      },
    });

    register({
      id: "go-dashboard",
      name: "Go to Dashboard",
      keys: ["g", "d"],
      group: "Navigation",
      description: "Go to Dashboard",
      handler: () => router.push("/dashboard"),
    });

    register({
      id: "go-portfolio",
      name: "Go to Portfolio",
      keys: ["g", "p"],
      group: "Navigation",
      description: "Go to Portfolio",
      handler: () => router.push("/dashboard/portfolio"),
    });

    register({
      id: "go-decisions",
      name: "Go to Decisions",
      keys: ["g", "t"],
      group: "Navigation",
      description: "Go to Decisions",
      handler: () => router.push("/dashboard/decisions"),
    });

    register({
      id: "go-theses",
      name: "Go to Theses",
      keys: ["g", "h"],
      group: "Navigation",
      description: "Go to Theses",
      handler: () => router.push("/dashboard/theses"),
    });

    register({
      id: "go-settings",
      name: "Go to Settings",
      keys: ["g", "s"],
      group: "Navigation",
      description: "Go to Settings",
      handler: () => router.push("/dashboard/settings"),
    });

    // List navigation uses CustomEvents so list components can handle their own selection state
    register({
      id: "prev-item",
      name: "Previous item",
      keys: ["k"],
      group: "Lists",
      description: "Move to previous item in list",
      handler: () => {
        window.dispatchEvent(new CustomEvent("keyboard-nav", { detail: { direction: "prev" } }));
      },
    });

    register({
      id: "prev-item-arrow",
      name: "Previous item (arrow)",
      keys: ["up"],
      group: "Lists",
      description: "Move to previous item in list",
      handler: () => {
        window.dispatchEvent(new CustomEvent("keyboard-nav", { detail: { direction: "prev" } }));
      },
    });

    register({
      id: "next-item",
      name: "Next item",
      keys: ["j"],
      group: "Lists",
      description: "Move to next item in list",
      handler: () => {
        window.dispatchEvent(new CustomEvent("keyboard-nav", { detail: { direction: "next" } }));
      },
    });

    register({
      id: "next-item-arrow",
      name: "Next item (arrow)",
      keys: ["down"],
      group: "Lists",
      description: "Move to next item in list",
      handler: () => {
        window.dispatchEvent(new CustomEvent("keyboard-nav", { detail: { direction: "next" } }));
      },
    });

    register({
      id: "select-item",
      name: "Select item",
      keys: ["enter"],
      group: "Lists",
      description: "Select or open current item",
      handler: () => {
        window.dispatchEvent(new CustomEvent("keyboard-nav", { detail: { action: "select" } }));
      },
    });

    return () => {
      unregister("show-help");
      unregister("close-modal");
      unregister("go-dashboard");
      unregister("go-portfolio");
      unregister("go-decisions");
      unregister("go-theses");
      unregister("go-settings");
      unregister("prev-item");
      unregister("prev-item-arrow");
      unregister("next-item");
      unregister("next-item-arrow");
      unregister("select-item");
    };
  }, [register, unregister, router, openHelp, closeHelp, isHelpOpen]);

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
    [register, unregister, getShortcuts, openHelp, closeHelp, isHelpOpen, scope]
  );

  return (
    <KeyboardShortcutsContext.Provider value={value}>
      {children}
      <ShortcutsHelpDialog
        open={isHelpOpen}
        onOpenChange={setIsHelpOpen}
        shortcuts={getShortcuts()}
      />
    </KeyboardShortcutsContext.Provider>
  );
}

export default KeyboardShortcutsProvider;
