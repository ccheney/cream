//! Order execution and broker integration.
//!
//! This module handles order routing, state management, and broker adapters.

mod alpaca;
mod gateway;
mod state;

pub use alpaca::AlpacaAdapter;
pub use gateway::ExecutionGateway;
pub use state::OrderStateManager;
