/**
 * Thesis Detail Page Types
 *
 * TypeScript interfaces for thesis detail components.
 */

import type { ReactNode } from "react";

export type ThesisDirection = "BULLISH" | "BEARISH" | "NEUTRAL";
export type ThesisStatus = "ACTIVE" | "INVALIDATED" | "REALIZED" | "EXPIRED";
export type ThesisTimeHorizon = "INTRADAY" | "SWING" | "POSITION" | "LONG_TERM";
export type EvidenceType = "technical" | "fundamental" | "sentiment" | "macro";

export interface SupportingEvidence {
  type: EvidenceType;
  summary: string;
  weight: number;
}

export interface Thesis {
  id: string;
  symbol: string;
  direction: ThesisDirection;
  thesis: string;
  catalysts: string[];
  invalidationConditions: string[];
  targetPrice: number | null;
  stopPrice: number | null;
  timeHorizon: ThesisTimeHorizon;
  confidence: number;
  status: ThesisStatus;
  entryPrice: number | null;
  currentPrice: number | null;
  pnlPct: number | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  agentSource: string;
  supportingEvidence: SupportingEvidence[];
}

export interface ThesisHistoryEvent {
  id: string;
  thesisId: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  reason: string | null;
  timestamp: string;
}

export interface MetricCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  valueColor?: string;
}

export interface ModalProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
}

export interface ThesisHeaderProps {
  thesis: Thesis;
  onRealize: () => void;
  onInvalidate: () => void;
}

export interface ThesisDetailsProps {
  thesis: Thesis;
  history: ThesisHistoryEvent[] | undefined;
}

export interface InvalidateModalProps {
  reason: string;
  onReasonChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}

export interface RealizeModalProps {
  exitPrice: string;
  exitNotes: string;
  onExitPriceChange: (value: string) => void;
  onExitNotesChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}
