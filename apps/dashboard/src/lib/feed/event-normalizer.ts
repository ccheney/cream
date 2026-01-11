/**
 * Event Normalizer - Backward Compatibility Re-export
 *
 * This module re-exports from the refactored module structure for backward compatibility.
 * New code should import directly from './index.js' or specific modules.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 3.1
 * @deprecated Import from './index.js' instead
 */

export { normalizeEvent } from "./normalizer.js";
export { formatContractDescription, parseContractSymbol } from "./parsers/options.js";
export type { EventType, NormalizedEvent, WebSocketMessage } from "./types.js";
export { EVENT_TYPE_COLORS, VALUE_COLORS } from "./types.js";
