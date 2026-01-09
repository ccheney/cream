//! Integration tests for execution tactics.
//!
//! These tests verify the behavior of different execution tactics in various
//! market conditions and order scenarios.

use chrono::{Duration, Utc};
use execution_engine::execution::{
    MarketState, OrderPurpose, PassiveLimitConfig, TacticConfig, TacticSelectionContext,
    TacticSelector, TacticType, TacticUrgency, TwapConfig, VwapConfig,
};
use rust_decimal::Decimal;

#[test]
fn test_passive_limit_with_offset() {
    let config = PassiveLimitConfig {
        offset_bps: 10, // 0.1% or 10 basis points
        decay_seconds: 60,
        max_wait_seconds: 300,
    };

    let bid = Decimal::new(100, 0);
    let ask = Decimal::new(101, 0);

    let buy_price = config.calculate_buy_price(bid, ask);
    let sell_price = config.calculate_sell_price(bid, ask);

    // Buy price should be slightly above bid (bid + 0.1% of mid)
    assert!(buy_price > bid);
    assert!(buy_price < ask);

    // Sell price should be slightly below ask (ask - 0.1% of mid)
    assert!(sell_price < ask);
    assert!(sell_price > bid);
}

#[test]
fn test_passive_limit_decay_timing() {
    let config = PassiveLimitConfig {
        offset_bps: 0,
        decay_seconds: 60,
        max_wait_seconds: 300,
    };

    let submitted_at = Utc::now() - Duration::seconds(70);

    // Should decay after 60 seconds
    assert!(config.should_decay(submitted_at));

    // Should not cancel yet (max is 300 seconds)
    assert!(!config.should_cancel(submitted_at));
}

#[test]
fn test_passive_limit_cancel_timeout() {
    let config = PassiveLimitConfig {
        offset_bps: 0,
        decay_seconds: 60,
        max_wait_seconds: 300,
    };

    let submitted_at = Utc::now() - Duration::seconds(350);

    // Should cancel after 300 seconds
    assert!(config.should_cancel(submitted_at));
}

#[test]
fn test_twap_even_distribution() {
    let config = TwapConfig {
        duration_minutes: 60,
        slice_interval_seconds: 60,
        slice_type: execution_engine::execution::SliceType::Limit,
        allow_past_end: false,
    };

    let total_quantity = Decimal::new(1000, 0);
    let slice_count = config.calculate_slice_count();
    let slice_quantity = config.calculate_slice_quantity(total_quantity);

    // 60 minutes / 60 seconds = 60 slices
    assert_eq!(slice_count, 60);

    // 1000 / 60 slices ≈ 16.67 per slice
    let expected = total_quantity / Decimal::from(slice_count);
    assert_eq!(slice_quantity, expected);

    // Total should equal original quantity
    let total_executed = slice_quantity * Decimal::from(slice_count);
    assert_eq!(total_executed, total_quantity);
}

#[test]
fn test_twap_schedule_generation() {
    let config = TwapConfig {
        duration_minutes: 5,
        slice_interval_seconds: 60,
        slice_type: execution_engine::execution::SliceType::Limit,
        allow_past_end: false,
    };

    let start_time = Utc::now();
    let schedule = config.calculate_schedule(start_time);

    // 5 minutes = 300 seconds, with 60-second intervals = 5 slices
    assert_eq!(schedule.len(), 5);

    // First slice is at start time
    assert_eq!(schedule[0], start_time);

    // Each subsequent slice is 60 seconds apart
    for i in 1..schedule.len() {
        // Wrapping acceptable: i is bounded by schedule.len() which is small
        #[allow(clippy::cast_possible_wrap)]
        let multiplier = i as i64;
        let expected = start_time + Duration::seconds(60 * multiplier);
        assert_eq!(schedule[i], expected);
    }
}

#[test]
fn test_vwap_participation_limits() {
    let config = VwapConfig {
        max_pct_volume: Decimal::new(10, 2), // 10% of volume
        start_time: None,
        end_time: None,
        no_take_liquidity: false,
    };

    // Scenario 1: Recent volume is high, we want to fill 500 shares
    let recent_volume = Decimal::new(10000, 0);
    let remaining_quantity = Decimal::new(500, 0);

    let participation = config.calculate_participation_quantity(recent_volume, remaining_quantity);

    // Should limit to min(10% of 10000, 500) = min(1000, 500) = 500
    assert_eq!(participation, Decimal::new(500, 0));

    // Scenario 2: Recent volume is low, we want to fill 500 shares
    let recent_volume_low = Decimal::new(1000, 0);
    let participation_low =
        config.calculate_participation_quantity(recent_volume_low, remaining_quantity);

    // Should limit to min(10% of 1000, 500) = min(100, 500) = 100
    assert_eq!(participation_low, Decimal::new(100, 0));
}

#[test]
fn test_tactic_selector_comprehensive() {
    let selector = TacticSelector::default();

    // Small order, low urgency, normal market -> PASSIVE_LIMIT
    let small_passive = TacticSelectionContext {
        size_pct_adv: Decimal::new(5, 3), // 0.005 (0.5% ADV)
        urgency: TacticUrgency::Low,
        market_state: MarketState::Normal,
        order_purpose: OrderPurpose::Entry,
    };
    assert_eq!(selector.select(&small_passive), TacticType::PassiveLimit);

    // Small order, high urgency, normal market -> AGGRESSIVE_LIMIT
    let small_aggressive = TacticSelectionContext {
        size_pct_adv: Decimal::new(5, 3), // 0.005 (0.5% ADV)
        urgency: TacticUrgency::High,
        market_state: MarketState::Normal,
        order_purpose: OrderPurpose::Entry,
    };
    assert_eq!(
        selector.select(&small_aggressive),
        TacticType::AggressiveLimit
    );

    // Medium order, low urgency, normal market -> TWAP
    let medium_twap = TacticSelectionContext {
        size_pct_adv: Decimal::new(3, 2), // 0.03 (3% ADV)
        urgency: TacticUrgency::Low,
        market_state: MarketState::Normal,
        order_purpose: OrderPurpose::Entry,
    };
    assert_eq!(selector.select(&medium_twap), TacticType::Twap);

    // Large order, low urgency, normal market -> VWAP
    let large_vwap = TacticSelectionContext {
        size_pct_adv: Decimal::new(7, 2), // 0.07 (7% ADV)
        urgency: TacticUrgency::Low,
        market_state: MarketState::Normal,
        order_purpose: OrderPurpose::Entry,
    };
    assert_eq!(selector.select(&large_vwap), TacticType::Vwap);

    // Any order in volatile market -> AGGRESSIVE_LIMIT
    let volatile = TacticSelectionContext {
        size_pct_adv: Decimal::new(1, 2), // 0.01 (1% ADV)
        urgency: TacticUrgency::Low,
        market_state: MarketState::Volatile,
        order_purpose: OrderPurpose::Entry,
    };
    assert_eq!(selector.select(&volatile), TacticType::AggressiveLimit);

    // Stop loss always -> AGGRESSIVE_LIMIT
    let stop_loss = TacticSelectionContext {
        size_pct_adv: Decimal::new(1, 2), // 0.01 (1% ADV)
        urgency: TacticUrgency::Low,
        market_state: MarketState::Normal,
        order_purpose: OrderPurpose::StopLoss,
    };
    assert_eq!(selector.select(&stop_loss), TacticType::AggressiveLimit);
}

#[test]
fn test_tactic_config_constructors() {
    // Test PASSIVE_LIMIT config
    let passive = TacticConfig::passive_limit(PassiveLimitConfig::default());
    assert_eq!(passive.tactic, TacticType::PassiveLimit);
    assert!(passive.passive_limit.is_some());
    assert!(passive.twap.is_none());
    assert!(passive.vwap.is_none());

    // Test TWAP config
    let twap = TacticConfig::twap(TwapConfig::default());
    assert_eq!(twap.tactic, TacticType::Twap);
    assert!(twap.twap.is_some());
    assert!(twap.passive_limit.is_none());
    assert!(twap.vwap.is_none());

    // Test VWAP config
    let vwap = TacticConfig::vwap(VwapConfig::default());
    assert_eq!(vwap.tactic, TacticType::Vwap);
    assert!(vwap.vwap.is_some());
    assert!(vwap.passive_limit.is_none());
    assert!(vwap.twap.is_none());
}

#[test]
fn test_twap_window_end_detection() {
    let config = TwapConfig {
        duration_minutes: 60,
        slice_interval_seconds: 60,
        slice_type: execution_engine::execution::SliceType::Limit,
        allow_past_end: false,
    };

    // Window started 70 minutes ago
    let start_time = Utc::now() - Duration::minutes(70);
    assert!(config.is_window_ended(start_time));

    // Window started 30 minutes ago
    let recent_start = Utc::now() - Duration::minutes(30);
    assert!(!config.is_window_ended(recent_start));
}

#[test]
fn test_vwap_realistic_scenario() {
    // Scenario: We want to buy 5000 shares over the day
    // Market typically trades 100,000 shares/day
    // We'll participate at 10% of volume

    let config = VwapConfig {
        max_pct_volume: Decimal::new(10, 2), // 10%
        start_time: None,
        end_time: None,
        no_take_liquidity: false,
    };

    let total_target = Decimal::new(5000, 0);
    let mut remaining = total_target;
    let mut filled = Decimal::ZERO;

    // Simulate 10 intervals with varying volume
    let volumes = vec![
        Decimal::new(1000, 0), // Low volume period
        Decimal::new(2000, 0), // Increasing
        Decimal::new(3000, 0), // Peak
        Decimal::new(2500, 0), // High
        Decimal::new(2000, 0), // Moderate
        Decimal::new(1500, 0), // Declining
        Decimal::new(1000, 0), // Low
        Decimal::new(1200, 0), // Recovering
        Decimal::new(1500, 0), // Moderate
        Decimal::new(800, 0),  // End of day low
    ];

    for volume in volumes {
        let participation = config.calculate_participation_quantity(volume, remaining);
        filled += participation;
        remaining -= participation;

        // Should never exceed 10% of interval volume
        assert!(participation <= volume * Decimal::new(10, 2));

        // Should never try to fill more than remaining
        assert!(participation <= total_target - (filled - participation));
    }

    // Should have made progress toward filling the order
    assert!(filled > Decimal::ZERO);
    assert!(filled <= total_target);
}

#[test]
fn test_aggressive_limit_crossing_spread() {
    let config = execution_engine::execution::AggressiveLimitConfig {
        cross_bps: 5, // 0.05% crossing
        timeout_seconds: 30,
    };

    let bid = Decimal::new(100, 0);
    let ask = Decimal::new(101, 0);

    let buy_price = config.calculate_buy_price(ask);
    let sell_price = config.calculate_sell_price(bid);

    // Buy price should cross the spread (above ask)
    assert!(buy_price > ask);

    // Sell price should cross the spread (below bid)
    assert!(sell_price < bid);
}

#[test]
fn test_wide_spread_prefers_passive() {
    let selector = TacticSelector::default();

    let context = TacticSelectionContext {
        size_pct_adv: Decimal::new(5, 3), // 0.005 (0.5% ADV)
        urgency: TacticUrgency::Normal,
        market_state: MarketState::WideSpread,
        order_purpose: OrderPurpose::Entry,
    };

    // Wide spread should prefer passive to avoid paying the spread
    assert_eq!(selector.select(&context), TacticType::PassiveLimit);
}

#[test]
fn test_large_order_uses_iceberg() {
    let selector = TacticSelector::default();

    let context = TacticSelectionContext {
        size_pct_adv: Decimal::new(10, 2), // 0.10 (10% ADV) - very large
        urgency: TacticUrgency::High,
        market_state: MarketState::Normal,
        order_purpose: OrderPurpose::Entry,
    };

    // Large orders should use ICEBERG to hide size
    assert_eq!(selector.select(&context), TacticType::Iceberg);
}

#[test]
fn test_serialization_roundtrip() {
    let config = TacticConfig::twap(TwapConfig {
        duration_minutes: 120,
        slice_interval_seconds: 30,
        slice_type: execution_engine::execution::SliceType::Market,
        allow_past_end: true,
    });

    // Serialize to JSON
    let json = match serde_json::to_string(&config) {
        Ok(j) => j,
        Err(e) => panic!("Failed to serialize: {e}"),
    };

    // Deserialize back
    let deserialized: TacticConfig = match serde_json::from_str(&json) {
        Ok(d) => d,
        Err(e) => panic!("Failed to deserialize: {e}"),
    };

    // Verify it matches
    assert_eq!(deserialized.tactic, TacticType::Twap);
    let Some(twap) = deserialized.twap else {
        panic!("TWAP config missing");
    };
    assert_eq!(twap.duration_minutes, 120);
    assert_eq!(twap.slice_interval_seconds, 30);
    assert_eq!(
        twap.slice_type,
        execution_engine::execution::SliceType::Market
    );
    assert!(twap.allow_past_end);
}
