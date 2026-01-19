//! Domain Layer
//!
//! The innermost layer containing business logic with zero infrastructure dependencies.
//! This layer defines:
//!
//! - **Aggregates**: Consistency boundaries with invariants
//! - **Value Objects**: Immutable domain types with equality by value
//! - **Domain Events**: Records of state transitions
//! - **Domain Services**: Stateless business logic
//! - **Repository Traits**: Persistence abstractions (implemented in adapters)
//!
//! # Bounded Contexts
//!
//! - [`order_execution`]: Order lifecycle management (FIX protocol semantics)
//! - [`risk_management`]: Risk validation and constraint checking
//! - [`execution_tactics`]: Order routing strategies (TWAP, VWAP, Iceberg)
//! - [`stop_enforcement`]: Stop-loss and take-profit monitoring
//! - [`option_position`]: Multi-leg options tracking and Greeks

pub mod execution_tactics;
pub mod option_position;
pub mod order_execution;
pub mod risk_management;
pub mod shared;
pub mod stop_enforcement;
