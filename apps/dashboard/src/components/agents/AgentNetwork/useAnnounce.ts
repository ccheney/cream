"use client";

/**
 * Screen Reader Announcement Hook
 *
 * Announces status changes for screen reader users.
 *
 * @see docs/plans/43-agent-network-visualization.md
 */

import { useCallback, useEffect, useRef } from "react";
import type { NetworkAgentType, OODAPhase, PhaseStatus } from "./types";
import { AGENT_METADATA, PHASE_CONFIG } from "./types";

// ============================================
// Types
// ============================================

export interface UseAnnounceOptions {
  currentPhase: OODAPhase | null;
  phaseStatus: Record<OODAPhase, PhaseStatus>;
  selectedAgent: NetworkAgentType | null;
  agentStatus?: string;
}

// ============================================
// Hook
// ============================================

export function useAnnounce({
  currentPhase,
  phaseStatus: _phaseStatus,
  selectedAgent,
  agentStatus,
}: UseAnnounceOptions) {
  const announcerRef = useRef<HTMLDivElement | null>(null);
  const previousPhaseRef = useRef<OODAPhase | null>(null);
  const previousAgentStatusRef = useRef<string | undefined>(undefined);

  /** Announce a message to screen readers */
  const announce = useCallback((message: string, priority: "polite" | "assertive" = "polite") => {
    if (!announcerRef.current) {
      // Create announcer element if it doesn't exist
      const announcer = document.createElement("div");
      announcer.id = "agent-network-announcer";
      announcer.setAttribute("role", "status");
      announcer.setAttribute("aria-live", priority);
      announcer.setAttribute("aria-atomic", "true");
      announcer.className = "sr-only";
      announcer.style.cssText = `
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      `;
      document.body.appendChild(announcer);
      announcerRef.current = announcer;
    }

    // Clear and set new message (triggers screen reader)
    announcerRef.current.textContent = "";
    // Use setTimeout to ensure the DOM update is picked up
    setTimeout(() => {
      if (announcerRef.current) {
        announcerRef.current.textContent = message;
      }
    }, 100);
  }, []);

  // Announce phase transitions
  useEffect(() => {
    if (currentPhase !== previousPhaseRef.current) {
      if (currentPhase) {
        const config = PHASE_CONFIG.find((p) => p.phase === currentPhase);
        if (config) {
          announce(`${config.displayName} phase started`, "assertive");
        }
      }
      previousPhaseRef.current = currentPhase;
    }
  }, [currentPhase, announce]);

  // Announce agent status changes
  useEffect(() => {
    if (selectedAgent && agentStatus !== previousAgentStatusRef.current) {
      const metadata = AGENT_METADATA[selectedAgent];
      if (agentStatus === "complete") {
        announce(`${metadata.displayName} completed`);
      } else if (agentStatus === "error") {
        announce(`${metadata.displayName} encountered an error`, "assertive");
      }
      previousAgentStatusRef.current = agentStatus;
    }
  }, [selectedAgent, agentStatus, announce]);

  // Cleanup announcer on unmount
  useEffect(() => {
    return () => {
      if (announcerRef.current) {
        announcerRef.current.remove();
        announcerRef.current = null;
      }
    };
  }, []);

  return { announce };
}

export default useAnnounce;
