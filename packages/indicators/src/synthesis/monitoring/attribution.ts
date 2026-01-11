/**
 * Decision Attribution Management
 *
 * Functions for recording and retrieving decision attributions.
 */

import type { TursoClient } from "@cream/storage";
import { generateId } from "./helpers.js";
import type { DecisionAttribution } from "./types.js";

/**
 * Record a decision attribution.
 *
 * @param db - Database client
 * @param attribution - The attribution to record
 */
export async function recordDecisionAttribution(
  db: TursoClient,
  attribution: Omit<DecisionAttribution, "id" | "createdAt">
): Promise<void> {
  await db.run(
    `INSERT INTO decision_attributions (
      id, decision_id, indicator_id, signal_value,
      contribution_weight, was_correct
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      generateId(),
      attribution.decisionId,
      attribution.indicatorId,
      attribution.signalValue,
      attribution.contributionWeight,
      attribution.wasCorrect,
    ]
  );
}

/**
 * Get decision attributions for an indicator on a specific date.
 *
 * @param db - Database client
 * @param indicatorId - The indicator ID
 * @param date - The date to query
 * @returns Array of decision attributions
 */
export async function getDecisionAttributions(
  db: TursoClient,
  indicatorId: string,
  date: string
): Promise<DecisionAttribution[]> {
  try {
    const rows = await db.execute<{
      id: string;
      decision_id: string;
      indicator_id: string;
      signal_value: number;
      contribution_weight: number;
      was_correct: number | null;
      created_at: string;
    }>(
      `SELECT id, decision_id, indicator_id, signal_value, contribution_weight, was_correct, created_at
       FROM decision_attributions
       WHERE indicator_id = ? AND DATE(created_at) = ?`,
      [indicatorId, date]
    );

    return rows.map((row) => ({
      id: row.id,
      decisionId: row.decision_id,
      indicatorId: row.indicator_id,
      signalValue: row.signal_value,
      contributionWeight: row.contribution_weight,
      wasCorrect: row.was_correct === null ? null : row.was_correct === 1,
      createdAt: row.created_at,
    }));
  } catch {
    return [];
  }
}

/**
 * Update decision outcome (mark as correct or incorrect).
 *
 * @param db - Database client
 * @param decisionId - The decision ID
 * @param wasCorrect - Whether the decision was correct
 */
export async function updateDecisionOutcome(
  db: TursoClient,
  decisionId: string,
  wasCorrect: boolean
): Promise<void> {
  await db.run(`UPDATE decision_attributions SET was_correct = ? WHERE decision_id = ?`, [
    wasCorrect ? 1 : 0,
    decisionId,
  ]);
}
