/**
 * UI State Store
 *
 * Zustand store for UI preferences and panel visibility.
 * Persisted to localStorage for consistent experience across sessions.
 *
 * @see docs/plans/ui/07-state-management.md lines 71-91
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

// ============================================
// Types
// ============================================

export type Theme = "light" | "dark" | "system";
export type ChartTimeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

/**
 * Real-time feed filter options.
 */
export type FeedFilter = "all" | "quotes" | "orders" | "decisions" | "agents" | "alerts" | "system";

/**
 * UI store state.
 */
export interface UIState {
  // Panel visibility
  sidebarCollapsed: boolean;
  realTimeFeedVisible: boolean;
  alertsPanelVisible: boolean;

  // User preferences
  theme: Theme;
  chartTimeframe: ChartTimeframe;
  realTimeFeedFilters: FeedFilter[];

  // Table preferences
  tablePageSize: number;
  tableDensity: "compact" | "normal" | "comfortable";

  // Chart preferences
  chartShowVolume: boolean;
  chartShowIndicators: string[];
}

/**
 * UI store actions.
 */
export interface UIActions {
  // Panel toggles
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleRealTimeFeed: () => void;
  setRealTimeFeedVisible: (visible: boolean) => void;
  toggleAlertsPanel: () => void;
  setAlertsPanelVisible: (visible: boolean) => void;

  // Preferences
  setTheme: (theme: Theme) => void;
  setChartTimeframe: (timeframe: ChartTimeframe) => void;
  setFeedFilters: (filters: FeedFilter[]) => void;
  toggleFeedFilter: (filter: FeedFilter) => void;

  // Table preferences
  setTablePageSize: (size: number) => void;
  setTableDensity: (density: "compact" | "normal" | "comfortable") => void;

  // Chart preferences
  setChartShowVolume: (show: boolean) => void;
  setChartIndicators: (indicators: string[]) => void;
  toggleChartIndicator: (indicator: string) => void;

  // Reset
  reset: () => void;
}

/**
 * Combined store type.
 */
export type UIStore = UIState & UIActions;

// ============================================
// Initial State
// ============================================

const initialState: UIState = {
  // Panel visibility
  sidebarCollapsed: false,
  realTimeFeedVisible: true,
  alertsPanelVisible: false,

  // User preferences
  theme: "system",
  chartTimeframe: "1h",
  realTimeFeedFilters: ["all"],

  // Table preferences
  tablePageSize: 25,
  tableDensity: "normal",

  // Chart preferences
  chartShowVolume: true,
  chartShowIndicators: ["SMA_20", "SMA_50"],
};

// ============================================
// Store Implementation
// ============================================

/**
 * UI state store with localStorage persistence.
 *
 * @example
 * ```tsx
 * const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
 * const toggleSidebar = useUIStore((s) => s.toggleSidebar);
 *
 * return (
 *   <button onClick={toggleSidebar}>
 *     {sidebarCollapsed ? 'Expand' : 'Collapse'}
 *   </button>
 * );
 * ```
 */
export const useUIStore = create<UIStore>()(
  persist(
    (set, get) => ({
      // Initial state
      ...initialState,

      // Panel toggles
      toggleSidebar: () => {
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }));
      },

      setSidebarCollapsed: (collapsed) => {
        set({ sidebarCollapsed: collapsed });
      },

      toggleRealTimeFeed: () => {
        set((state) => ({ realTimeFeedVisible: !state.realTimeFeedVisible }));
      },

      setRealTimeFeedVisible: (visible) => {
        set({ realTimeFeedVisible: visible });
      },

      toggleAlertsPanel: () => {
        set((state) => ({ alertsPanelVisible: !state.alertsPanelVisible }));
      },

      setAlertsPanelVisible: (visible) => {
        set({ alertsPanelVisible: visible });
      },

      // Preferences
      setTheme: (theme) => {
        set({ theme });
      },

      setChartTimeframe: (timeframe) => {
        set({ chartTimeframe: timeframe });
      },

      setFeedFilters: (filters) => {
        set({ realTimeFeedFilters: filters });
      },

      toggleFeedFilter: (filter) => {
        const current = get().realTimeFeedFilters;
        if (filter === "all") {
          set({ realTimeFeedFilters: ["all"] });
        } else {
          // Remove 'all' when selecting specific filters
          const withoutAll = current.filter((f) => f !== "all");
          if (current.includes(filter)) {
            const newFilters = withoutAll.filter((f) => f !== filter);
            set({
              realTimeFeedFilters: newFilters.length > 0 ? newFilters : ["all"],
            });
          } else {
            set({ realTimeFeedFilters: [...withoutAll, filter] });
          }
        }
      },

      // Table preferences
      setTablePageSize: (size) => {
        set({ tablePageSize: size });
      },

      setTableDensity: (density) => {
        set({ tableDensity: density });
      },

      // Chart preferences
      setChartShowVolume: (show) => {
        set({ chartShowVolume: show });
      },

      setChartIndicators: (indicators) => {
        set({ chartShowIndicators: indicators });
      },

      toggleChartIndicator: (indicator) => {
        const current = get().chartShowIndicators;
        if (current.includes(indicator)) {
          set({
            chartShowIndicators: current.filter((i) => i !== indicator),
          });
        } else {
          set({ chartShowIndicators: [...current, indicator] });
        }
      },

      // Reset
      reset: () => {
        set(initialState);
      },
    }),
    {
      name: "cream-ui-preferences",
      storage: createJSONStorage(() => localStorage),
    }
  )
);

// ============================================
// Selectors
// ============================================

export const selectTheme = (state: UIStore) => state.theme;
export const selectSidebarCollapsed = (state: UIStore) => state.sidebarCollapsed;
export const selectRealTimeFeedVisible = (state: UIStore) => state.realTimeFeedVisible;
export const selectChartTimeframe = (state: UIStore) => state.chartTimeframe;
export const selectFeedFilters = (state: UIStore) => state.realTimeFeedFilters;

// ============================================
// Convenience Hooks
// ============================================

/**
 * Hook for sidebar state and toggle.
 */
export function useSidebar() {
  return useUIStore(
    useShallow((state) => ({
      collapsed: state.sidebarCollapsed,
      toggle: state.toggleSidebar,
      setCollapsed: state.setSidebarCollapsed,
    }))
  );
}

/**
 * Hook for real-time feed visibility.
 */
export function useRealTimeFeed() {
  return useUIStore(
    useShallow((state) => ({
      visible: state.realTimeFeedVisible,
      toggle: state.toggleRealTimeFeed,
      setVisible: state.setRealTimeFeedVisible,
      filters: state.realTimeFeedFilters,
      setFilters: state.setFeedFilters,
      toggleFilter: state.toggleFeedFilter,
    }))
  );
}

/**
 * Hook for chart preferences.
 */
export function useChartPreferences() {
  return useUIStore(
    useShallow((state) => ({
      timeframe: state.chartTimeframe,
      setTimeframe: state.setChartTimeframe,
      showVolume: state.chartShowVolume,
      setShowVolume: state.setChartShowVolume,
      indicators: state.chartShowIndicators,
      setIndicators: state.setChartIndicators,
      toggleIndicator: state.toggleChartIndicator,
    }))
  );
}

/**
 * Hook for table preferences.
 */
export function useTablePreferences() {
  return useUIStore(
    useShallow((state) => ({
      pageSize: state.tablePageSize,
      setPageSize: state.setTablePageSize,
      density: state.tableDensity,
      setDensity: state.setTableDensity,
    }))
  );
}

export default useUIStore;
