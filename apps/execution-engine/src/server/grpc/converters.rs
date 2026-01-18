//! Type conversion functions between proto and internal types.
//!
//! These functions handle the translation between gRPC protobuf types
//! and the internal domain models used by the execution engine.

use super::proto;
use crate::models::Environment;

/// Convert a Decimal to f64.
#[inline]
pub fn decimal_to_f64(d: rust_decimal::Decimal) -> f64 {
    use rust_decimal::prelude::ToPrimitive;
    d.to_f64().unwrap_or(0.0)
}

/// Convert a Decimal to i32.
#[inline]
pub fn decimal_to_i32(d: rust_decimal::Decimal) -> i32 {
    use rust_decimal::prelude::ToPrimitive;
    d.to_i32().unwrap_or(0)
}

/// Convert a Decimal to i64.
#[inline]
pub fn decimal_to_i64(d: rust_decimal::Decimal) -> i64 {
    use rust_decimal::prelude::ToPrimitive;
    d.to_i64().unwrap_or(0)
}

/// Convert proto `DecisionPlan` to internal format.
pub fn convert_decision_plan(
    proto: &proto::cream::v1::DecisionPlan,
) -> crate::models::DecisionPlan {
    use crate::models::{Action, Decision, Direction, Size, SizeUnit, StrategyFamily, TimeHorizon};
    use rust_decimal::Decimal;

    let decisions: Vec<Decision> = proto
        .decisions
        .iter()
        .enumerate()
        .map(|(idx, d)| {
            // Convert action from proto enum
            let action = match proto::cream::v1::Action::try_from(d.action) {
                Ok(proto::cream::v1::Action::Buy | proto::cream::v1::Action::Increase) => {
                    Action::Buy
                }
                Ok(proto::cream::v1::Action::Sell | proto::cream::v1::Action::Reduce) => {
                    Action::Sell
                }
                // Hold, NoTrade, and unknown actions default to Hold
                _ => Action::Hold,
            };

            // Derive direction from action (Buy = Long, Sell = Short)
            let direction = match action {
                Action::Buy => Direction::Long,
                Action::Sell => Direction::Short,
                Action::Hold | Action::Close | Action::NoTrade => Direction::Flat,
            };

            // Extract risk levels
            let (stop_loss, take_profit) =
                d.risk_levels
                    .as_ref()
                    .map_or((Decimal::ZERO, Decimal::ZERO), |r| {
                        (
                            Decimal::from_f64_retain(r.stop_loss_level).unwrap_or_default(),
                            Decimal::from_f64_retain(r.take_profit_level).unwrap_or_default(),
                        )
                    });

            // Extract size
            let (quantity, unit) = d
                .size
                .as_ref()
                .map_or((Decimal::ZERO, SizeUnit::Shares), |s| {
                    let unit = match proto::cream::v1::SizeUnit::try_from(s.unit) {
                        Ok(proto::cream::v1::SizeUnit::Contracts) => SizeUnit::Contracts,
                        // Shares and unknown units default to Shares
                        _ => SizeUnit::Shares,
                    };
                    (Decimal::from(s.quantity), unit)
                });

            // Extract strategy family
            // Proto: Unspecified, Trend, MeanReversion, EventDriven, Volatility, RelativeValue
            // Internal: Momentum, MeanReversion, TrendFollowing, Volatility, EventDriven, Fundamental
            let strategy_family =
                match proto::cream::v1::StrategyFamily::try_from(d.strategy_family) {
                    Ok(proto::cream::v1::StrategyFamily::Trend) => StrategyFamily::TrendFollowing,
                    Ok(proto::cream::v1::StrategyFamily::MeanReversion) => {
                        StrategyFamily::MeanReversion
                    }
                    Ok(proto::cream::v1::StrategyFamily::Volatility) => StrategyFamily::Volatility,
                    Ok(proto::cream::v1::StrategyFamily::EventDriven) => {
                        StrategyFamily::EventDriven
                    }
                    Ok(proto::cream::v1::StrategyFamily::RelativeValue) => {
                        StrategyFamily::Fundamental
                    }
                    _ => StrategyFamily::Momentum, // Default
                };

            // Extract limit price from order plan
            let limit_price = d.order_plan.as_ref().and_then(|op| {
                op.entry_limit_price
                    .map(|p| Decimal::from_f64_retain(p).unwrap_or_default())
            });

            Decision {
                decision_id: format!("{}-{}", proto.cycle_id, idx),
                instrument_id: d
                    .instrument
                    .as_ref()
                    .map_or(String::new(), |i| i.instrument_id.clone()),
                action,
                direction,
                size: Size { quantity, unit },
                stop_loss_level: stop_loss,
                take_profit_level: take_profit,
                limit_price,
                strategy_family,
                time_horizon: TimeHorizon::Swing, // Default
                bullish_factors: vec![],          // Not in proto
                bearish_factors: vec![],          // Not in proto
                rationale: d.rationale.clone(),
                confidence: Decimal::from_f64_retain(d.confidence).unwrap_or_default(),
            }
        })
        .collect();

    crate::models::DecisionPlan {
        plan_id: proto.cycle_id.clone(), // Use cycle_id as plan_id
        cycle_id: proto.cycle_id.clone(),
        timestamp: proto
            .as_of_timestamp
            .as_ref()
            .map(|t| {
                // Truncation acceptable: nanos value from proto is already within u32 range
                #[allow(clippy::cast_sign_loss)]
                let nanos = t.nanos as u32;
                chrono::DateTime::from_timestamp(t.seconds, nanos)
                    .map(|dt| dt.to_rfc3339())
                    .unwrap_or_default()
            })
            .unwrap_or_default(),
        decisions,
        risk_manager_approved: true, // Proto doesn't have this, default to requiring check
        critic_approved: true,
        plan_rationale: proto.portfolio_notes.clone().unwrap_or_default(),
    }
}

/// Convert internal `OrderStatus` to proto `OrderStatus`.
pub fn convert_order_status(status: crate::models::OrderStatus) -> i32 {
    use crate::models::OrderStatus;
    match status {
        OrderStatus::New => proto::cream::v1::OrderStatus::Pending.into(),
        OrderStatus::Accepted => proto::cream::v1::OrderStatus::Accepted.into(),
        OrderStatus::PartiallyFilled => proto::cream::v1::OrderStatus::PartialFill.into(),
        OrderStatus::Filled => proto::cream::v1::OrderStatus::Filled.into(),
        OrderStatus::Canceled => proto::cream::v1::OrderStatus::Cancelled.into(),
        OrderStatus::Rejected => proto::cream::v1::OrderStatus::Rejected.into(),
        OrderStatus::Expired => proto::cream::v1::OrderStatus::Expired.into(),
    }
}

/// Convert internal `OrderSide` to proto `OrderSide`.
pub fn convert_order_side(side: crate::models::OrderSide) -> i32 {
    use crate::models::OrderSide;
    match side {
        OrderSide::Buy => proto::cream::v1::OrderSide::Buy.into(),
        OrderSide::Sell => proto::cream::v1::OrderSide::Sell.into(),
    }
}

/// Convert internal `OrderType` to proto `OrderType`.
pub fn convert_order_type(order_type: crate::models::OrderType) -> i32 {
    use crate::models::OrderType;
    match order_type {
        // Proto doesn't have Stop/StopLimit yet, map to Market/Limit for now
        OrderType::Market | OrderType::Stop => proto::cream::v1::OrderType::Market.into(),
        OrderType::Limit | OrderType::StopLimit => proto::cream::v1::OrderType::Limit.into(),
    }
}

/// Convert internal Environment to proto Environment i32.
pub const fn environment_to_proto(env: Environment) -> i32 {
    match env {
        Environment::Paper => 2, // ENVIRONMENT_PAPER
        Environment::Live => 3,  // ENVIRONMENT_LIVE
    }
}

/// Parse ISO 8601 timestamp string to protobuf Timestamp.
#[allow(clippy::cast_possible_wrap)]
pub fn parse_timestamp(timestamp_str: &str) -> Option<prost_types::Timestamp> {
    chrono::DateTime::parse_from_rfc3339(timestamp_str)
        .ok()
        .map(|dt| prost_types::Timestamp {
            seconds: dt.timestamp(),
            // Wrapping acceptable: subsec_nanos is always 0..999_999_999, fits in i32
            nanos: dt.timestamp_subsec_nanos() as i32,
        })
}

#[cfg(test)]
#[allow(clippy::expect_used)]
mod tests {
    use super::*;
    use rust_decimal::Decimal;

    #[test]
    fn test_decimal_to_f64() {
        let d = Decimal::new(12345, 2); // 123.45
        let f = decimal_to_f64(d);
        assert!((f - 123.45).abs() < 0.001);
    }

    #[test]
    fn test_decimal_to_i32() {
        let d = Decimal::new(12345, 0);
        let i = decimal_to_i32(d);
        assert_eq!(i, 12345);
    }

    #[test]
    fn test_decimal_to_i64() {
        let d = Decimal::new(123_456_789, 0);
        let i = decimal_to_i64(d);
        assert_eq!(i, 123_456_789);
    }

    #[test]
    fn test_environment_to_proto() {
        assert_eq!(environment_to_proto(Environment::Paper), 2);
        assert_eq!(environment_to_proto(Environment::Live), 3);
    }

    #[test]
    fn test_parse_timestamp_valid() {
        let ts = parse_timestamp("2024-01-15T10:30:00Z");
        let ts = ts.expect("valid ISO timestamp should parse");
        assert!(ts.seconds > 0);
    }

    #[test]
    fn test_parse_timestamp_invalid() {
        let ts = parse_timestamp("not-a-timestamp");
        assert!(ts.is_none());
    }

    #[test]
    fn test_convert_order_status() {
        use crate::models::OrderStatus;

        assert_eq!(
            convert_order_status(OrderStatus::New),
            proto::cream::v1::OrderStatus::Pending as i32
        );
        assert_eq!(
            convert_order_status(OrderStatus::Filled),
            proto::cream::v1::OrderStatus::Filled as i32
        );
        assert_eq!(
            convert_order_status(OrderStatus::Canceled),
            proto::cream::v1::OrderStatus::Cancelled as i32
        );
    }

    #[test]
    fn test_convert_order_side() {
        use crate::models::OrderSide;

        assert_eq!(
            convert_order_side(OrderSide::Buy),
            proto::cream::v1::OrderSide::Buy as i32
        );
        assert_eq!(
            convert_order_side(OrderSide::Sell),
            proto::cream::v1::OrderSide::Sell as i32
        );
    }

    #[test]
    fn test_convert_order_type() {
        use crate::models::OrderType;

        assert_eq!(
            convert_order_type(OrderType::Market),
            proto::cream::v1::OrderType::Market as i32
        );
        assert_eq!(
            convert_order_type(OrderType::Limit),
            proto::cream::v1::OrderType::Limit as i32
        );
        // Stop maps to Market in proto (proto doesn't have Stop yet)
        assert_eq!(
            convert_order_type(OrderType::Stop),
            proto::cream::v1::OrderType::Market as i32
        );
    }
}
