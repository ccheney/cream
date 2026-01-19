//! HTTP/REST API adapter.
//!
//! Inbound adapter implementing REST endpoints that delegate to application use cases.

mod controller;
mod request;
mod response;

pub use controller::{AppState, create_router};
pub use request::*;
pub use response::*;
