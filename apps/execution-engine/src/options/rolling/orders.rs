//! Roll order building and specification.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::error::RollError;
use super::triggers::RollReason;
use crate::options::OptionType;

/// Type of roll order.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RollOrderType {
    /// Single atomic order with close and open legs.
    Atomic,
    /// Sequential close then open.
    Sequential,
}

/// A roll order specification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RollOrder {
    /// Order type.
    pub order_type: RollOrderType,
    /// Position ID being rolled.
    pub position_id: String,
    /// Legs to close (existing position).
    pub close_legs: Vec<RollLeg>,
    /// Legs to open (new position).
    pub open_legs: Vec<RollLeg>,
    /// Net credit/debit for the roll.
    pub net_premium: Decimal,
    /// Whether the roll is for a credit (positive) or debit (negative).
    pub is_net_credit: bool,
    /// Roll reason.
    pub reason: RollReason,
}

/// A leg in a roll order.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RollLeg {
    /// Option ticker.
    pub ticker: String,
    /// Underlying ticker.
    pub underlying: String,
    /// Option type (call/put).
    pub option_type: OptionType,
    /// Strike price.
    pub strike: Decimal,
    /// Expiration date (YYYY-MM-DD).
    pub expiration: String,
    /// Quantity (positive = buy, negative = sell).
    pub quantity: i32,
    /// Side for order (buy or sell).
    pub side: String,
    /// Limit price.
    pub limit_price: Option<Decimal>,
}

/// Builder for roll orders.
#[derive(Debug, Default)]
pub struct RollOrderBuilder {
    position_id: Option<String>,
    close_legs: Vec<RollLeg>,
    open_legs: Vec<RollLeg>,
    reason: Option<RollReason>,
    prefer_atomic: bool,
    broker_supports_atomic: bool,
}

impl RollOrderBuilder {
    /// Create a new roll order builder.
    #[must_use]
    pub fn new() -> Self {
        Self {
            prefer_atomic: true,
            broker_supports_atomic: true,
            ..Default::default()
        }
    }

    /// Set the position ID.
    #[must_use]
    pub fn position_id(mut self, id: &str) -> Self {
        self.position_id = Some(id.to_string());
        self
    }

    /// Add a close leg.
    #[must_use]
    pub fn close_leg(mut self, leg: RollLeg) -> Self {
        self.close_legs.push(leg);
        self
    }

    /// Add an open leg.
    #[must_use]
    pub fn open_leg(mut self, leg: RollLeg) -> Self {
        self.open_legs.push(leg);
        self
    }

    /// Set the roll reason.
    #[must_use]
    pub const fn reason(mut self, reason: RollReason) -> Self {
        self.reason = Some(reason);
        self
    }

    /// Set whether to prefer atomic orders.
    #[must_use]
    pub const fn prefer_atomic(mut self, prefer: bool) -> Self {
        self.prefer_atomic = prefer;
        self
    }

    /// Set whether broker supports atomic orders.
    #[must_use]
    pub const fn broker_supports_atomic(mut self, supports: bool) -> Self {
        self.broker_supports_atomic = supports;
        self
    }

    /// Build the roll order.
    ///
    /// # Errors
    ///
    /// Returns an error if required fields are missing (position ID, close legs,
    /// open legs, or roll reason).
    pub fn build(self) -> Result<RollOrder, RollError> {
        let position_id = self
            .position_id
            .ok_or_else(|| RollError::InvalidOrder("Position ID required".to_string()))?;

        if self.close_legs.is_empty() {
            return Err(RollError::InvalidOrder(
                "No close legs specified".to_string(),
            ));
        }

        if self.open_legs.is_empty() {
            return Err(RollError::InvalidOrder(
                "No open legs specified".to_string(),
            ));
        }

        let reason = self
            .reason
            .ok_or_else(|| RollError::InvalidOrder("Roll reason required".to_string()))?;

        let net_premium = calculate_net_premium(&self.close_legs, &self.open_legs);

        let order_type = if self.prefer_atomic && self.broker_supports_atomic {
            RollOrderType::Atomic
        } else {
            RollOrderType::Sequential
        };

        Ok(RollOrder {
            order_type,
            position_id,
            close_legs: self.close_legs,
            open_legs: self.open_legs,
            net_premium,
            is_net_credit: net_premium > Decimal::ZERO,
            reason,
        })
    }
}

fn calculate_net_premium(close_legs: &[RollLeg], open_legs: &[RollLeg]) -> Decimal {
    let close_premium: Decimal = close_legs
        .iter()
        .filter_map(|l| l.limit_price.map(|p| p * Decimal::from(l.quantity.abs())))
        .sum();
    let open_premium: Decimal = open_legs
        .iter()
        .filter_map(|l| l.limit_price.map(|p| p * Decimal::from(l.quantity.abs())))
        .sum();
    close_premium - open_premium
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_roll_order_builder() {
        let order = match RollOrderBuilder::new()
            .position_id("pos-1")
            .close_leg(RollLeg {
                ticker: "AAPL260130C00150000".to_string(),
                underlying: "AAPL".to_string(),
                option_type: OptionType::Call,
                strike: Decimal::new(150, 0),
                expiration: "2026-01-30".to_string(),
                quantity: -1,
                side: "buy".to_string(),
                limit_price: Some(Decimal::new(100, 2)),
            })
            .open_leg(RollLeg {
                ticker: "AAPL260220C00155000".to_string(),
                underlying: "AAPL".to_string(),
                option_type: OptionType::Call,
                strike: Decimal::new(155, 0),
                expiration: "2026-02-20".to_string(),
                quantity: -1,
                side: "sell".to_string(),
                limit_price: Some(Decimal::new(150, 2)),
            })
            .reason(RollReason::CreditDteThreshold)
            .build()
        {
            Ok(o) => o,
            Err(e) => panic!("should build roll order: {e}"),
        };

        assert_eq!(order.position_id, "pos-1");
        assert_eq!(order.close_legs.len(), 1);
        assert_eq!(order.open_legs.len(), 1);
        assert_eq!(order.order_type, RollOrderType::Atomic);
    }

    #[test]
    #[allow(clippy::expect_used)]
    fn test_roll_order_builder_sequential() {
        let order = RollOrderBuilder::new()
            .position_id("pos-1")
            .close_leg(RollLeg {
                ticker: "AAPL260130C00150000".to_string(),
                underlying: "AAPL".to_string(),
                option_type: OptionType::Call,
                strike: Decimal::new(150, 0),
                expiration: "2026-01-30".to_string(),
                quantity: -1,
                side: "buy".to_string(),
                limit_price: None,
            })
            .open_leg(RollLeg {
                ticker: "AAPL260220C00155000".to_string(),
                underlying: "AAPL".to_string(),
                option_type: OptionType::Call,
                strike: Decimal::new(155, 0),
                expiration: "2026-02-20".to_string(),
                quantity: -1,
                side: "sell".to_string(),
                limit_price: None,
            })
            .reason(RollReason::UrgentDte)
            .broker_supports_atomic(false)
            .build()
            .expect("should build sequential roll order");

        assert_eq!(order.order_type, RollOrderType::Sequential);
    }

    #[test]
    fn test_roll_order_builder_missing_position() {
        let result = RollOrderBuilder::new()
            .close_leg(RollLeg {
                ticker: "AAPL260130C00150000".to_string(),
                underlying: "AAPL".to_string(),
                option_type: OptionType::Call,
                strike: Decimal::new(150, 0),
                expiration: "2026-01-30".to_string(),
                quantity: -1,
                side: "buy".to_string(),
                limit_price: None,
            })
            .open_leg(RollLeg {
                ticker: "AAPL260220C00155000".to_string(),
                underlying: "AAPL".to_string(),
                option_type: OptionType::Call,
                strike: Decimal::new(155, 0),
                expiration: "2026-02-20".to_string(),
                quantity: -1,
                side: "sell".to_string(),
                limit_price: None,
            })
            .reason(RollReason::UrgentDte)
            .build();

        assert!(result.is_err());
    }
}
