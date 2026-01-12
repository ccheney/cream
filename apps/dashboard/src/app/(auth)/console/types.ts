/**
 * Dashboard types and props interfaces.
 */

import type { FeedEvent as EventFeedEvent } from "@/components/ui/event-feed";
import type { Decision } from "@/lib/api/types/trading";
import type { CyclePhase as StoreCyclePhase } from "@/stores/cycle-store";
import type { FeedEvent as StoreFeedEvent } from "@/stores/event-feed-store";

export type { Decision, StoreCyclePhase, StoreFeedEvent };

export interface SystemStatusData {
  environment: string;
  status: string;
  lastCycleTime: string | null;
  nextCycleTime: string | null;
  alerts?: Alert[];
  runningCycle?: RunningCycle | null;
}

export interface Alert {
  id: string;
  severity: "critical" | "warning" | "info";
  message: string;
}

export interface RunningCycle {
  cycleId: string;
  phase: string | null;
  startedAt: string;
}

export interface PortfolioData {
  nav: number;
  todayPnl: number;
  todayPnlPct: number;
  positionCount: number;
}

export interface SystemStatusBannerProps {
  status?: Pick<SystemStatusData, "environment" | "status" | "lastCycleTime">;
  isLoading: boolean;
}

export interface TradingCycleControlProps {
  status: SystemStatusData | undefined;
  activeCycleId: string | null;
  cycleInProgress: boolean;
  useDraftConfig: boolean;
  onUseDraftConfigChange: (checked: boolean) => void;
  onTriggerCycle: () => void;
  onCycleComplete: () => void;
  onCycleError: () => void;
}

export interface OODAPhaseCardProps {
  phase: string;
  currentPhase: StoreCyclePhase | undefined;
  isRunning: boolean;
  isLoading: boolean;
}

export interface MetricCardProps {
  label: string;
  value: string;
  subValue?: string;
  valueColor?: string;
  isLoading: boolean;
  tooltip?: string;
}

export interface AlertsBannerProps {
  alerts: Alert[];
}

export interface RecentDecisionsProps {
  decisions: Decision[] | undefined;
  isLoading: boolean;
  isFetching: boolean;
}

export interface EventFeedSectionProps {
  events: EventFeedEvent[];
}

export interface SystemControlsProps {
  status: SystemStatusData | undefined;
  isLoading: boolean;
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  isStarting: boolean;
  isStopping: boolean;
  isPausing: boolean;
}

export interface DashboardHeaderProps {
  connected: boolean;
  statusFetching: boolean;
  nextCycleDisplay: string;
  systemControls: SystemControlsProps;
}
