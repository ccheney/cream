//! Caching for Alpaca API responses.
//!
//! Provides time-based caching for account state and positions
//! to reduce API calls and improve response times.

use std::time::{Duration, Instant};

use crate::execution::{AccountInfo, AlpacaPosition};

/// Cache TTL for account state (30 seconds - balance can change frequently).
pub const ACCOUNT_CACHE_TTL: Duration = Duration::from_secs(30);

/// Cache TTL for positions (60 seconds - positions don't change frequently).
pub const POSITIONS_CACHE_TTL: Duration = Duration::from_secs(60);

/// Cached account state.
#[derive(Clone)]
pub struct CachedAccountState {
    pub state: AccountInfo,
    pub fetched_at: Instant,
}

/// Cached positions.
#[derive(Clone)]
pub struct CachedPositions {
    pub positions: Vec<AlpacaPosition>,
    pub fetched_at: Instant,
}

/// Cache for Alpaca API responses.
#[derive(Default)]
pub struct AlpacaCache {
    pub account: Option<CachedAccountState>,
    pub positions: Option<CachedPositions>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal::Decimal;

    #[test]
    fn test_cache_ttl_values() {
        assert_eq!(ACCOUNT_CACHE_TTL, Duration::from_secs(30));
        assert_eq!(POSITIONS_CACHE_TTL, Duration::from_secs(60));
    }

    #[test]
    fn test_alpaca_cache_default() {
        let cache = AlpacaCache::default();
        assert!(cache.account.is_none());
        assert!(cache.positions.is_none());
    }

    #[test]
    fn test_cached_account_state_clone() {
        let cached = CachedAccountState {
            state: AccountInfo {
                account_id: "test".to_string(),
                equity: Decimal::ZERO,
                buying_power: Decimal::ZERO,
                cash: Decimal::ZERO,
                margin_used: Decimal::ZERO,
                daytrade_count: 0,
                pattern_day_trader: false,
            },
            fetched_at: Instant::now(),
        };
        let cloned = cached.clone();
        assert_eq!(cloned.state.account_id, "test");
    }

    #[test]
    fn test_cached_positions_clone() {
        let cached = CachedPositions {
            positions: vec![],
            fetched_at: Instant::now(),
        };
        let cloned = cached.clone();
        assert!(cloned.positions.is_empty());
    }
}
