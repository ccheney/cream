/**
 * Event Publisher Module
 *
 * Central event sourcing infrastructure for WebSocket broadcasting.
 *
 * @see docs/plans/ui/08-realtime.md
 */

// Types
export * from "./types.js";

// Mappers
export * from "./mappers.js";

// Publisher
export {
  createEventPublisher,
  getEventPublisher,
  resetEventPublisher,
  type EventPublisher,
} from "./publisher.js";
export { default } from "./publisher.js";
