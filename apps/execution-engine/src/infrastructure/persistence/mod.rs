//! Persistence Adapters
//!
//! Database implementations of repository traits.

pub mod in_memory;

pub use in_memory::InMemoryOrderRepository;

// Note: PostgreSQL adapter will be added in Phase 3 when full persistence is migrated.
// For now, in-memory repository is sufficient for testing and development.
