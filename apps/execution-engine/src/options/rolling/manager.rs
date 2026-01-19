//! Rolling manager for options position management.
//!
//! Periodically evaluates positions for rolling opportunities based on
//! time, profit, and loss triggers. Submits roll orders to the execution gateway.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use chrono::{Datelike, Timelike};
use rust_decimal::Decimal;
use tokio::sync::RwLock;
use tokio::sync::broadcast;
use tracing::{debug, info};

use super::{
    PositionForRoll, RollConfig, RollTimingRecommendation, check_roll_timing, check_roll_trigger,
};
use crate::execution::AlpacaAdapter;
use crate::options::AssignmentRiskLevel;

/// Options position being tracked for rolling.
#[derive(Debug, Clone)]
pub struct TrackedPosition {
    /// Position ID.
    pub position_id: String,
    /// Symbol (OCC format).
    pub symbol: String,
    /// Option type (Call/Put).
    pub option_type: crate::options::OptionType,
    /// Strike price.
    pub strike: Decimal,
    /// Expiration date (YYYY-MM-DD).
    pub expiration: String,
    /// Current position quantity (negative for short).
    pub quantity: i32,
    /// Entry price.
    pub entry_price: Decimal,
    /// Credit received (for credit spreads).
    pub credit_received: Decimal,
    /// Underlying price at entry.
    pub underlying_entry_price: Decimal,
    /// Whether this is a credit position.
    pub is_credit: bool,
}

impl TrackedPosition {
    /// Days to expiration.
    #[must_use]
    pub fn dte(&self) -> u32 {
        use chrono::{NaiveDate, Utc};

        let today = Utc::now().date_naive();
        NaiveDate::parse_from_str(&self.expiration, "%Y-%m-%d").map_or(0, |exp_date| {
            let days = (exp_date - today).num_days();
            #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
            if days > 0 { days as u32 } else { 0 }
        })
    }

    /// Check if position is in-the-money given current underlying price.
    #[must_use]
    pub fn is_itm(&self, underlying_price: Decimal) -> bool {
        match self.option_type {
            crate::options::OptionType::Call => underlying_price > self.strike,
            crate::options::OptionType::Put => underlying_price < self.strike,
        }
    }

    /// Convert to `PositionForRoll` for trigger evaluation.
    #[must_use]
    pub fn to_position_for_roll(&self, current_value: Decimal) -> PositionForRoll {
        PositionForRoll {
            position_id: self.position_id.clone(),
            dte: self.dte(),
            is_credit: self.is_credit,
            credit_received: self.credit_received,
            current_value,
            max_profit: self.credit_received,
            has_itm_leg: false, // Would need market data
            assignment_risk: AssignmentRiskLevel::Low,
            earnings_approaching: false,
            dividend_approaching: false,
        }
    }
}

/// Rolling manager for periodic position evaluation.
///
/// Monitors options positions and triggers rolls based on:
/// - Time (DTE thresholds)
/// - Profit targets
/// - Loss limits
pub struct RollingManager {
    /// Rolling configuration.
    config: RollConfig,
    /// Tracked positions (`position_id` -> position).
    positions: Arc<RwLock<HashMap<String, TrackedPosition>>>,
    /// Broker adapter for position queries.
    #[allow(dead_code)]
    adapter: Arc<AlpacaAdapter>,
    /// Evaluation interval.
    evaluation_interval: Duration,
}

impl RollingManager {
    /// Create a new rolling manager.
    #[must_use]
    pub fn new(config: RollConfig, adapter: Arc<AlpacaAdapter>) -> Self {
        Self {
            evaluation_interval: Duration::from_secs(60),
            config,
            positions: Arc::new(RwLock::new(HashMap::new())),
            adapter,
        }
    }

    /// Set the evaluation interval.
    #[must_use]
    pub const fn with_interval(mut self, interval: Duration) -> Self {
        self.evaluation_interval = interval;
        self
    }

    /// Register a position for rolling evaluation.
    pub async fn register_position(&self, position: TrackedPosition) {
        let mut positions = self.positions.write().await;
        info!(
            position_id = %position.position_id,
            symbol = %position.symbol,
            dte = position.dte(),
            "Registered position for rolling evaluation"
        );
        positions.insert(position.position_id.clone(), position);
    }

    /// Remove a position from rolling evaluation.
    pub async fn unregister_position(&self, position_id: &str) {
        let mut positions = self.positions.write().await;
        if positions.remove(position_id).is_some() {
            info!(position_id = %position_id, "Unregistered position from rolling evaluation");
        }
    }

    /// Run the rolling manager loop.
    pub async fn run(&self, mut shutdown_rx: broadcast::Receiver<()>) {
        info!(
            interval_secs = self.evaluation_interval.as_secs(),
            "Starting rolling manager"
        );

        let mut interval = tokio::time::interval(self.evaluation_interval);
        interval.tick().await;

        loop {
            tokio::select! {
                _ = interval.tick() => {
                    self.evaluate_positions().await;
                }
                _ = shutdown_rx.recv() => {
                    info!("Rolling manager shutting down");
                    break;
                }
            }
        }
    }

    /// Evaluate all tracked positions for rolling opportunities.
    async fn evaluate_positions(&self) {
        let positions = self.positions.read().await;

        if positions.is_empty() {
            debug!("No positions to evaluate for rolling");
            return;
        }

        debug!(
            position_count = positions.len(),
            "Evaluating positions for rolling"
        );

        for (position_id, position) in positions.iter() {
            // Current value would come from market data in production
            let current_value = position.credit_received;
            let position_for_roll = position.to_position_for_roll(current_value);

            let trigger_result = check_roll_trigger(&position_for_roll, &self.config);

            if !trigger_result.should_roll {
                debug!(position_id = %position_id, "No roll action needed");
                continue;
            }

            // Check timing
            #[allow(clippy::cast_possible_truncation)]
            let current_hour = chrono::Utc::now().hour() as u8;
            let is_market_hours = (14..21).contains(&current_hour); // Rough EST market hours in UTC
            let is_friday = chrono::Utc::now().weekday() == chrono::Weekday::Fri;
            let has_itm_leg = position_for_roll.has_itm_leg;

            let timing = check_roll_timing(
                current_hour,
                is_market_hours,
                has_itm_leg,
                is_friday,
                &self.config,
            );

            match timing.recommendation {
                RollTimingRecommendation::RollNow | RollTimingRecommendation::Urgent => {
                    info!(
                        position_id = %position_id,
                        symbol = %position.symbol,
                        reason = ?trigger_result.reason,
                        urgency = trigger_result.urgency,
                        timing = ?timing.recommendation,
                        "Roll triggered"
                    );
                    self.execute_roll(position);
                }
                RollTimingRecommendation::Wait => {
                    info!(
                        position_id = %position_id,
                        reason = ?trigger_result.reason,
                        timing_reasons = ?timing.reasons,
                        "Roll triggered but waiting for better timing"
                    );
                }
            }
        }
    }

    /// Execute a roll for a position.
    #[allow(clippy::unused_self)]
    fn execute_roll(&self, position: &TrackedPosition) {
        info!(
            position_id = %position.position_id,
            symbol = %position.symbol,
            "Roll execution triggered (gateway integration pending)"
        );

        // In production, this would:
        // 1. Build roll order with RollOrderBuilder
        // 2. Submit close leg via gateway
        // 3. Submit open leg via gateway
        // 4. Monitor partial fills
        // 5. Handle assignment risk during roll
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Environment;

    fn make_test_position() -> TrackedPosition {
        TrackedPosition {
            position_id: "pos-1".to_string(),
            symbol: "AAPL  260117C00150000".to_string(),
            option_type: crate::options::OptionType::Call,
            strike: Decimal::new(150, 0),
            expiration: "2026-01-17".to_string(),
            quantity: -1,
            entry_price: Decimal::new(250, 2),
            credit_received: Decimal::new(250, 2),
            underlying_entry_price: Decimal::new(150, 0),
            is_credit: true,
        }
    }

    #[test]
    fn test_tracked_position_dte() {
        let position = make_test_position();
        let _ = position.dte();
    }

    #[test]
    fn test_tracked_position_itm() {
        let position = make_test_position();
        assert!(position.is_itm(Decimal::new(160, 0)));
        assert!(!position.is_itm(Decimal::new(140, 0)));
    }

    #[tokio::test]
    async fn test_register_unregister_position() {
        let adapter =
            match AlpacaAdapter::new("test".to_string(), "test".to_string(), Environment::Paper) {
                Ok(a) => Arc::new(a),
                Err(e) => panic!("should create adapter: {e}"),
            };
        let manager = RollingManager::new(RollConfig::default(), adapter);

        let position = make_test_position();
        manager.register_position(position.clone()).await;

        assert!(manager.positions.read().await.contains_key("pos-1"));

        manager.unregister_position("pos-1").await;

        assert!(!manager.positions.read().await.contains_key("pos-1"));
    }
}
