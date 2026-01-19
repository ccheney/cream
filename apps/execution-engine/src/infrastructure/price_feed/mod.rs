//! Price Feed Adapters
//!
//! Implementations of `PriceFeedPort` for various market data providers.

pub mod alpaca;
pub mod mock;

pub use alpaca::AlpacaPriceFeedAdapter;
pub use mock::MockPriceFeed;
