//! Application Layer
//!
//! The application layer orchestrates domain logic through use cases.
//! It defines:
//!
//! - **Ports**: Interfaces for interacting with external systems
//! - **Use Cases**: Application-specific business rules
//! - **DTOs**: Data transfer objects for API boundaries

pub mod dto;
pub mod ports;
pub mod use_cases;

pub use dto::*;
pub use ports::*;
pub use use_cases::*;
