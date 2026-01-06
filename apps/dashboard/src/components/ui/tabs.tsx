/**
 * Tabs Component
 *
 * Section navigation tabs with keyboard support and accessibility.
 *
 * @see docs/plans/ui/24-components.md
 * @see docs/plans/ui/10-appendix.md
 */

"use client";

import {
  createContext,
  forwardRef,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useContext,
  useId,
  useState,
} from "react";

// Simple className merger utility
function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

// ============================================
// Types
// ============================================

export interface TabsContextValue {
  activeTab: string;
  setActiveTab: (value: string) => void;
  baseId: string;
  registerTab: (value: string) => void;
  tabs: string[];
}

export interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  /** Default active tab value (uncontrolled) */
  defaultValue?: string;
  /** Active tab value (controlled) */
  value?: string;
  /** Callback when tab changes */
  onValueChange?: (value: string) => void;
  /** Children (TabList and TabPanels) */
  children: ReactNode;
}

export interface TabListProps extends HTMLAttributes<HTMLDivElement> {
  /** Tab triggers */
  children: ReactNode;
}

export interface TabProps extends HTMLAttributes<HTMLButtonElement> {
  /** Tab value identifier */
  value: string;
  /** Whether the tab is disabled */
  disabled?: boolean;
  /** Tab content */
  children: ReactNode;
}

export interface TabPanelProps extends HTMLAttributes<HTMLDivElement> {
  /** Panel value (must match a Tab value) */
  value: string;
  /** Panel content */
  children: ReactNode;
  /** Force mount even when not active */
  forceMount?: boolean;
}

// ============================================
// Context
// ============================================

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error("Tabs components must be used within a Tabs provider");
  }
  return context;
}

// ============================================
// Tabs Root
// ============================================

/**
 * Tabs - Container for tab navigation.
 *
 * @example
 * ```tsx
 * // Uncontrolled
 * <Tabs defaultValue="tab1">
 *   <TabList>
 *     <Tab value="tab1">First</Tab>
 *     <Tab value="tab2">Second</Tab>
 *   </TabList>
 *   <TabPanel value="tab1">Content 1</TabPanel>
 *   <TabPanel value="tab2">Content 2</TabPanel>
 * </Tabs>
 *
 * // Controlled
 * const [tab, setTab] = useState("tab1");
 * <Tabs value={tab} onValueChange={setTab}>
 *   ...
 * </Tabs>
 * ```
 */
export const Tabs = forwardRef<HTMLDivElement, TabsProps>(
  ({ defaultValue, value, onValueChange, children, className, ...props }, ref) => {
    const baseId = useId();
    const [tabs, setTabs] = useState<string[]>([]);
    const [internalValue, setInternalValue] = useState(defaultValue ?? "");

    const isControlled = value !== undefined;
    const activeTab = isControlled ? value : internalValue;

    const setActiveTab = useCallback(
      (newValue: string) => {
        if (!isControlled) {
          setInternalValue(newValue);
        }
        onValueChange?.(newValue);
      },
      [isControlled, onValueChange]
    );

    const registerTab = useCallback((tabValue: string) => {
      setTabs((prev) => {
        if (prev.includes(tabValue)) {
          return prev;
        }
        return [...prev, tabValue];
      });
    }, []);

    return (
      <TabsContext.Provider value={{ activeTab, setActiveTab, baseId, registerTab, tabs }}>
        <div ref={ref} className={cn("w-full", className)} {...props}>
          {children}
        </div>
      </TabsContext.Provider>
    );
  }
);

Tabs.displayName = "Tabs";

// ============================================
// TabList
// ============================================

/**
 * TabList - Container for Tab triggers.
 */
export const TabList = forwardRef<HTMLDivElement, TabListProps>(
  ({ children, className, ...props }, ref) => {
    const { activeTab, setActiveTab, tabs } = useTabsContext();

    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
      const currentIndex = tabs.indexOf(activeTab);
      let nextIndex = currentIndex;

      switch (e.key) {
        case "ArrowLeft":
          nextIndex = currentIndex > 0 ? currentIndex - 1 : tabs.length - 1;
          break;
        case "ArrowRight":
          nextIndex = currentIndex < tabs.length - 1 ? currentIndex + 1 : 0;
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = tabs.length - 1;
          break;
        default:
          return;
      }

      e.preventDefault();
      const nextTab = tabs[nextIndex];
      if (nextTab) {
        setActiveTab(nextTab);
        // Focus the button
        const tabButton = document.getElementById(`${tabs}-tab-${nextTab}`);
        tabButton?.focus();
      }
    };

    return (
      <div
        ref={ref}
        role="tablist"
        aria-orientation="horizontal"
        onKeyDown={handleKeyDown}
        className={cn("flex gap-1 border-b border-stone-200 dark:border-stone-700", className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);

TabList.displayName = "TabList";

// ============================================
// Tab
// ============================================

/**
 * Tab - Individual tab trigger button.
 */
export const Tab = forwardRef<HTMLButtonElement, TabProps>(
  ({ value, disabled = false, children, className, ...props }, ref) => {
    const { activeTab, setActiveTab, baseId, registerTab } = useTabsContext();
    const isActive = activeTab === value;

    // Register this tab on mount
    useState(() => {
      registerTab(value);
    });

    return (
      <button
        ref={ref}
        type="button"
        role="tab"
        id={`${baseId}-tab-${value}`}
        aria-controls={`${baseId}-panel-${value}`}
        aria-selected={isActive}
        tabIndex={isActive ? 0 : -1}
        disabled={disabled}
        onClick={() => !disabled && setActiveTab(value)}
        className={cn(
          "relative px-4 py-2.5 text-sm font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          isActive
            ? "text-stone-900 dark:text-stone-100"
            : "text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300",
          className
        )}
        {...props}
      >
        {children}
        {/* Active indicator */}
        {isActive && (
          <span
            className="absolute bottom-0 left-0 right-0 h-0.5 bg-stone-900 dark:bg-stone-100"
            aria-hidden="true"
          />
        )}
      </button>
    );
  }
);

Tab.displayName = "Tab";

// ============================================
// TabPanel
// ============================================

/**
 * TabPanel - Content panel for a tab.
 */
export const TabPanel = forwardRef<HTMLDivElement, TabPanelProps>(
  ({ value, children, forceMount = false, className, ...props }, ref) => {
    const { activeTab, baseId } = useTabsContext();
    const isActive = activeTab === value;

    if (!isActive && !forceMount) {
      return null;
    }

    return (
      <div
        ref={ref}
        role="tabpanel"
        id={`${baseId}-panel-${value}`}
        aria-labelledby={`${baseId}-tab-${value}`}
        hidden={!isActive}
        className={cn("mt-4 focus-visible:outline-none", !isActive && "hidden", className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);

TabPanel.displayName = "TabPanel";

// ============================================
// Exports
// ============================================

export default Tabs;
