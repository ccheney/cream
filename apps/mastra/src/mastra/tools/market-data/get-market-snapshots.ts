/**
 * Get Market Snapshots Tool
 *
 * Fetches comprehensive market snapshots including quotes and bars.
 * Re-exports the existing tool from @cream/agents.
 */

import { getMarketSnapshotsTool as existingTool } from "@cream/agents";

export const getMarketSnapshots = existingTool;
