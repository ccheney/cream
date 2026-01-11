//! Position tracking and limits enforcement.
//!
//! Tracks multi-leg options positions and enforces various limits
//! including contract counts, position counts, and Greeks exposure.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::greeks::Greeks;
use super::leg::OptionLeg;

/// A multi-leg options position.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MultiLegPosition {
    /// Position ID.
    pub position_id: String,
    /// Strategy name.
    pub strategy_name: String,
    /// Underlying symbol.
    pub underlying_symbol: String,
    /// Position legs.
    pub legs: Vec<OptionLeg>,
    /// Net entry premium (debit positive, credit negative).
    pub entry_premium: Decimal,
    /// Current market value.
    pub current_value: Decimal,
    /// Unrealized P&L.
    pub unrealized_pnl: Decimal,
    /// Aggregate Greeks.
    pub greeks: Greeks,
    /// Maximum profit (if defined).
    pub max_profit: Option<Decimal>,
    /// Maximum loss (if defined).
    pub max_loss: Option<Decimal>,
    /// Breakeven prices.
    pub breakeven_prices: Vec<Decimal>,
}

/// Position limits configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PositionLimits {
    /// Maximum contracts per underlying.
    pub max_contracts_per_underlying: u32,
    /// Maximum multi-leg positions per underlying.
    pub max_positions_per_underlying: u32,
    /// Maximum total open contracts.
    pub max_total_contracts: u32,
    /// Maximum total multi-leg positions.
    pub max_total_positions: u32,
    /// Maximum delta exposure (absolute).
    pub max_delta: Decimal,
    /// Maximum gamma exposure (absolute).
    pub max_gamma: Decimal,
    /// Maximum vega exposure (absolute).
    pub max_vega: Decimal,
    /// Maximum negative theta (time decay).
    pub max_theta: Decimal,
}

impl Default for PositionLimits {
    fn default() -> Self {
        Self {
            max_contracts_per_underlying: 100,
            max_positions_per_underlying: 10,
            max_total_contracts: 500,
            max_total_positions: 50,
            max_delta: Decimal::new(100, 0),  // +/-100 delta
            max_gamma: Decimal::new(50, 0),   // +/-50 gamma
            max_vega: Decimal::new(5000, 0),  // +/-$5000 vega
            max_theta: Decimal::new(-500, 0), // Max -$500/day theta
        }
    }
}

/// Tracks multi-leg positions and enforces limits.
#[derive(Debug, Clone)]
pub struct PositionTracker {
    /// Active positions by ID.
    positions: HashMap<String, MultiLegPosition>,
    /// Position limits.
    limits: PositionLimits,
}

impl PositionTracker {
    /// Create a new position tracker with given limits.
    #[must_use]
    pub fn new(limits: PositionLimits) -> Self {
        Self {
            positions: HashMap::new(),
            limits,
        }
    }

    /// Create a tracker with default limits.
    #[must_use]
    pub fn with_defaults() -> Self {
        Self::new(PositionLimits::default())
    }

    /// Add a position to the tracker.
    ///
    /// # Returns
    /// Error message if limits would be exceeded, None if successful.
    pub fn add_position(&mut self, position: MultiLegPosition) -> Option<String> {
        // Check contract limits per underlying
        let contracts_for_underlying: u32 = self
            .positions
            .values()
            .filter(|p| p.underlying_symbol == position.underlying_symbol)
            .flat_map(|p| &p.legs)
            .map(|l| l.quantity)
            .sum();

        let new_contracts: u32 = position.legs.iter().map(|l| l.quantity).sum();

        if contracts_for_underlying + new_contracts > self.limits.max_contracts_per_underlying {
            return Some(format!(
                "Would exceed max contracts per underlying ({} + {} > {})",
                contracts_for_underlying, new_contracts, self.limits.max_contracts_per_underlying
            ));
        }

        // Check position count per underlying
        // Truncation acceptable: position count is bounded by practical limits
        #[allow(clippy::cast_possible_truncation)]
        let positions_for_underlying = self
            .positions
            .values()
            .filter(|p| p.underlying_symbol == position.underlying_symbol)
            .count() as u32;

        if positions_for_underlying + 1 > self.limits.max_positions_per_underlying {
            return Some(format!(
                "Would exceed max positions per underlying ({} + 1 > {})",
                positions_for_underlying, self.limits.max_positions_per_underlying
            ));
        }

        // Check total limits
        let total_contracts: u32 = self
            .positions
            .values()
            .flat_map(|p| &p.legs)
            .map(|l| l.quantity)
            .sum();

        if total_contracts + new_contracts > self.limits.max_total_contracts {
            return Some(format!(
                "Would exceed max total contracts ({} + {} > {})",
                total_contracts, new_contracts, self.limits.max_total_contracts
            ));
        }

        // Truncation acceptable: position count is bounded by practical limits
        #[allow(clippy::cast_possible_truncation)]
        if self.positions.len() as u32 + 1 > self.limits.max_total_positions {
            return Some(format!(
                "Would exceed max total positions ({} + 1 > {})",
                self.positions.len(),
                self.limits.max_total_positions
            ));
        }

        // Check Greeks limits
        let current_greeks = self.portfolio_greeks();
        let new_greeks = current_greeks.add(&position.greeks);

        if new_greeks.delta.abs() > self.limits.max_delta {
            return Some(format!(
                "Would exceed max delta ({} > {})",
                new_greeks.delta.abs(),
                self.limits.max_delta
            ));
        }

        if new_greeks.gamma.abs() > self.limits.max_gamma {
            return Some(format!(
                "Would exceed max gamma ({} > {})",
                new_greeks.gamma.abs(),
                self.limits.max_gamma
            ));
        }

        if new_greeks.vega.abs() > self.limits.max_vega {
            return Some(format!(
                "Would exceed max vega ({} > {})",
                new_greeks.vega.abs(),
                self.limits.max_vega
            ));
        }

        if new_greeks.theta < self.limits.max_theta {
            return Some(format!(
                "Would exceed max theta decay ({} < {})",
                new_greeks.theta, self.limits.max_theta
            ));
        }

        // All checks passed
        self.positions
            .insert(position.position_id.clone(), position);
        None
    }

    /// Remove a position from the tracker.
    pub fn remove_position(&mut self, position_id: &str) -> Option<MultiLegPosition> {
        self.positions.remove(position_id)
    }

    /// Get a position by ID.
    #[must_use]
    pub fn get_position(&self, position_id: &str) -> Option<&MultiLegPosition> {
        self.positions.get(position_id)
    }

    /// Get all positions.
    #[must_use]
    pub fn all_positions(&self) -> Vec<&MultiLegPosition> {
        self.positions.values().collect()
    }

    /// Get positions for a specific underlying.
    #[must_use]
    pub fn positions_for_underlying(&self, underlying: &str) -> Vec<&MultiLegPosition> {
        self.positions
            .values()
            .filter(|p| p.underlying_symbol == underlying)
            .collect()
    }

    /// Calculate aggregate portfolio Greeks.
    #[must_use]
    pub fn portfolio_greeks(&self) -> Greeks {
        self.positions
            .values()
            .fold(Greeks::zero(), |acc, pos| acc.add(&pos.greeks))
    }

    /// Get total contract count.
    #[must_use]
    pub fn total_contracts(&self) -> u32 {
        self.positions
            .values()
            .flat_map(|p| &p.legs)
            .map(|l| l.quantity)
            .sum()
    }

    /// Get total position count.
    #[must_use]
    pub fn total_positions(&self) -> usize {
        self.positions.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::options::multileg::{OptionContract, OptionStyle, OptionType};

    #[test]
    fn test_position_tracker_add_position() {
        let mut tracker = PositionTracker::with_defaults();
        let position = make_test_position("P1", "AAPL");

        let result = tracker.add_position(position);
        assert!(result.is_none());
        assert_eq!(tracker.total_positions(), 1);
    }

    #[test]
    fn test_position_tracker_contract_limit() {
        let limits = PositionLimits {
            max_contracts_per_underlying: 3, // Low limit for testing
            ..Default::default()
        };
        let mut tracker = PositionTracker::new(limits);

        // Add position with 2 contracts (2 legs x 1 qty each)
        let position = make_test_position("P1", "AAPL");
        let _ = tracker.add_position(position);

        // Try to add another with 2 contracts (total 4 > 3 limit)
        let position2 = make_test_position("P2", "AAPL");
        let result = tracker.add_position(position2);
        let Some(error_msg) = result else {
            panic!("should have error message");
        };
        assert!(error_msg.contains("max contracts per underlying"));
    }

    #[test]
    fn test_position_tracker_delta_limit() {
        let limits = PositionLimits {
            max_delta: Decimal::new(10, 0), // Low limit for testing
            ..Default::default()
        };
        let mut tracker = PositionTracker::new(limits);

        // Add position with high delta
        let mut position = make_test_position("P1", "AAPL");
        position.greeks.delta = Decimal::new(15, 0); // Exceeds limit

        let result = tracker.add_position(position);
        let Some(error_msg) = result else {
            panic!("should have error message");
        };
        assert!(error_msg.contains("max delta"));
    }

    fn make_test_position(id: &str, underlying: &str) -> MultiLegPosition {
        MultiLegPosition {
            position_id: id.to_string(),
            strategy_name: "vertical_spread".to_string(),
            underlying_symbol: underlying.to_string(),
            legs: vec![
                OptionLeg {
                    leg_index: 0,
                    contract: OptionContract {
                        contract_id: format!("{underlying}240119C00150000"),
                        underlying_symbol: underlying.to_string(),
                        strike: Decimal::new(150, 0),
                        expiration: "2024-01-19".to_string(),
                        option_type: OptionType::Call,
                        style: OptionStyle::American,
                        multiplier: 100,
                    },
                    quantity: 1,
                    ratio: 1,
                    is_long: true,
                    greeks: Greeks::zero(),
                },
                OptionLeg {
                    leg_index: 1,
                    contract: OptionContract {
                        contract_id: format!("{underlying}240119C00155000"),
                        underlying_symbol: underlying.to_string(),
                        strike: Decimal::new(155, 0),
                        expiration: "2024-01-19".to_string(),
                        option_type: OptionType::Call,
                        style: OptionStyle::American,
                        multiplier: 100,
                    },
                    quantity: 1,
                    ratio: 1,
                    is_long: false,
                    greeks: Greeks::zero(),
                },
            ],
            entry_premium: Decimal::new(200, 0),
            current_value: Decimal::new(250, 0),
            unrealized_pnl: Decimal::new(50, 0),
            greeks: Greeks::new(
                Decimal::new(2, 1), // 0.2 delta
                Decimal::ZERO,
                Decimal::new(-5, 0),
                Decimal::new(3, 0),
                Decimal::ZERO,
            ),
            max_profit: Some(Decimal::new(300, 0)),
            max_loss: Some(Decimal::new(-200, 0)),
            breakeven_prices: vec![Decimal::new(152, 0)],
        }
    }
}
