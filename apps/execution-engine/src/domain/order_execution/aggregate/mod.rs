//! Order Aggregate
//!
//! The Order aggregate is the root entity for order lifecycle management.

mod order;
mod order_line;

pub use order::{CreateOrderCommand, Order, ReconstitutedOrderParams};
pub use order_line::OrderLine;
