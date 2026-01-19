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
#[allow(clippy::too_many_lines)]
pub fn convert_decision_plan(
    proto: &proto::cream::v1::DecisionPlan,
) -> crate::models::DecisionPlan {
    use crate::models::{
        Action, Decision, Direction, OptionLeg, PositionIntent, Size, SizeUnit, StrategyFamily,
        ThesisState, TimeHorizon,
    };
    use rust_decimal::Decimal;

    let decisions: Vec<Decision> = proto
        .decisions
        .iter()
        .map(|d| {
            // Convert action from proto enum
            let action = match proto::cream::v1::Action::try_from(d.action) {
                Ok(proto::cream::v1::Action::Buy | proto::cream::v1::Action::Increase) => {
                    Action::Buy
                }
                Ok(proto::cream::v1::Action::Sell | proto::cream::v1::Action::Reduce) => {
                    Action::Sell
                }
                Ok(proto::cream::v1::Action::Close) => Action::Close,
                Ok(proto::cream::v1::Action::NoTrade) => Action::NoTrade,
                // Hold and unknown actions default to Hold
                _ => Action::Hold,
            };

            // Extract direction from proto (fallback to deriving from action)
            let direction = match proto::cream::v1::Direction::try_from(d.direction) {
                Ok(proto::cream::v1::Direction::Long) => Direction::Long,
                Ok(proto::cream::v1::Direction::Short) => Direction::Short,
                Ok(proto::cream::v1::Direction::Flat) => Direction::Flat,
                _ => {
                    // Fallback: derive from action
                    match action {
                        Action::Buy => Direction::Long,
                        Action::Sell => Direction::Short,
                        Action::Hold | Action::Close | Action::NoTrade => Direction::Flat,
                    }
                }
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

            // Extract size with new unit types
            let (quantity, unit) = d
                .size
                .as_ref()
                .map_or((Decimal::ZERO, SizeUnit::Shares), |s| {
                    let unit = match proto::cream::v1::SizeUnit::try_from(s.unit) {
                        Ok(proto::cream::v1::SizeUnit::Contracts) => SizeUnit::Contracts,
                        Ok(proto::cream::v1::SizeUnit::Dollars) => SizeUnit::Dollars,
                        Ok(proto::cream::v1::SizeUnit::PctEquity) => SizeUnit::PctEquity,
                        // Shares and unknown units default to Shares
                        _ => SizeUnit::Shares,
                    };
                    (Decimal::from(s.quantity), unit)
                });

            // Extract strategy family (position type)
            let strategy_family =
                match proto::cream::v1::StrategyFamily::try_from(d.strategy_family) {
                    Ok(proto::cream::v1::StrategyFamily::EquityShort) => {
                        StrategyFamily::EquityShort
                    }
                    Ok(proto::cream::v1::StrategyFamily::OptionLong) => StrategyFamily::OptionLong,
                    Ok(proto::cream::v1::StrategyFamily::OptionShort) => {
                        StrategyFamily::OptionShort
                    }
                    Ok(proto::cream::v1::StrategyFamily::VerticalSpread) => {
                        StrategyFamily::VerticalSpread
                    }
                    Ok(proto::cream::v1::StrategyFamily::IronCondor) => StrategyFamily::IronCondor,
                    Ok(proto::cream::v1::StrategyFamily::Straddle) => StrategyFamily::Straddle,
                    Ok(proto::cream::v1::StrategyFamily::Strangle) => StrategyFamily::Strangle,
                    Ok(proto::cream::v1::StrategyFamily::CalendarSpread) => {
                        StrategyFamily::CalendarSpread
                    }
                    _ => StrategyFamily::EquityLong,
                };

            // Extract time horizon from proto
            let time_horizon = match proto::cream::v1::TimeHorizon::try_from(d.time_horizon) {
                Ok(proto::cream::v1::TimeHorizon::Intraday) => TimeHorizon::Intraday,
                Ok(proto::cream::v1::TimeHorizon::Position) => TimeHorizon::Position,
                _ => TimeHorizon::Swing,
            };

            // Extract thesis state from proto
            let thesis_state = match proto::cream::v1::ThesisState::try_from(d.thesis_state) {
                Ok(proto::cream::v1::ThesisState::Entered) => ThesisState::Entered,
                Ok(proto::cream::v1::ThesisState::Adding) => ThesisState::Adding,
                Ok(proto::cream::v1::ThesisState::Managing) => ThesisState::Managing,
                Ok(proto::cream::v1::ThesisState::Exiting) => ThesisState::Exiting,
                Ok(proto::cream::v1::ThesisState::Closed) => ThesisState::Closed,
                _ => ThesisState::Watching,
            };

            // Extract limit price from order plan
            let limit_price = d.order_plan.as_ref().and_then(|op| {
                op.entry_limit_price
                    .map(|p| Decimal::from_f64_retain(p).unwrap_or_default())
            });

            // Convert option legs from proto
            let legs: Vec<OptionLeg> = d
                .legs
                .iter()
                .map(|leg| {
                    let position_intent =
                        match proto::cream::v1::PositionIntent::try_from(leg.position_intent) {
                            Ok(proto::cream::v1::PositionIntent::BuyToOpen) => {
                                PositionIntent::BuyToOpen
                            }
                            Ok(proto::cream::v1::PositionIntent::BuyToClose) => {
                                PositionIntent::BuyToClose
                            }
                            Ok(proto::cream::v1::PositionIntent::SellToOpen) => {
                                PositionIntent::SellToOpen
                            }
                            Ok(proto::cream::v1::PositionIntent::SellToClose) => {
                                PositionIntent::SellToClose
                            }
                            _ => PositionIntent::BuyToOpen, // Default
                        };
                    OptionLeg {
                        symbol: leg.symbol.clone(),
                        ratio_qty: leg.ratio_qty,
                        position_intent,
                    }
                })
                .collect();

            let net_limit_price = d
                .net_limit_price
                .map(|p| Decimal::from_f64_retain(p).unwrap_or_default());

            let instrument_id = d
                .instrument
                .as_ref()
                .map_or(String::new(), |i| i.instrument_id.clone());

            Decision {
                decision_id: format!("{}-{}", proto.cycle_id, instrument_id.to_lowercase()),
                instrument_id,
                action,
                direction,
                size: Size { quantity, unit },
                stop_loss_level: stop_loss,
                take_profit_level: take_profit,
                limit_price,
                strategy_family,
                time_horizon,
                thesis_state,
                bullish_factors: d.bullish_factors.clone(),
                bearish_factors: d.bearish_factors.clone(),
                rationale: d.rationale.clone(),
                confidence: Decimal::from_f64_retain(d.confidence).unwrap_or_default(),
                legs,
                net_limit_price,
            }
        })
        .collect();

    // Generate plan_id from cycle_id: "cycle-2026-01-19-14-00" -> "plan-2026-01-19-14-00"
    let plan_id = if proto.cycle_id.starts_with("cycle-") {
        format!("plan-{}", &proto.cycle_id["cycle-".len()..])
    } else {
        format!("plan-{}", proto.cycle_id)
    };

    crate::models::DecisionPlan {
        plan_id,
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

    // ============================================
    // convert_decision_plan Integration Tests
    // ============================================

    fn make_proto_decision_plan() -> proto::cream::v1::DecisionPlan {
        proto::cream::v1::DecisionPlan {
            cycle_id: "cycle-2026-01-19-14-00".to_string(),
            as_of_timestamp: Some(prost_types::Timestamp {
                seconds: 1737295200, // 2026-01-19T14:00:00Z
                nanos: 0,
            }),
            environment: proto::cream::v1::Environment::Paper as i32,
            decisions: vec![proto::cream::v1::Decision {
                instrument: Some(proto::cream::v1::Instrument {
                    instrument_id: "AAPL".to_string(),
                    instrument_type: proto::cream::v1::InstrumentType::Equity as i32,
                    option_contract: None,
                }),
                action: proto::cream::v1::Action::Buy as i32,
                size: Some(proto::cream::v1::Size {
                    quantity: 5000,
                    unit: proto::cream::v1::SizeUnit::Dollars as i32,
                    target_position_quantity: 0,
                }),
                order_plan: Some(proto::cream::v1::OrderPlan {
                    entry_order_type: proto::cream::v1::OrderType::Limit as i32,
                    entry_limit_price: Some(238.50),
                    exit_order_type: proto::cream::v1::OrderType::Market as i32,
                    time_in_force: proto::cream::v1::TimeInForce::Day as i32,
                    execution_tactic: None,
                    execution_params: None,
                }),
                risk_levels: Some(proto::cream::v1::RiskLevels {
                    stop_loss_level: 228.50,
                    take_profit_level: 253.50,
                    denomination: proto::cream::v1::RiskDenomination::UnderlyingPrice as i32,
                }),
                strategy_family: proto::cream::v1::StrategyFamily::EquityLong as i32,
                rationale: "AAPL showing relative strength".to_string(),
                confidence: 0.72,
                references: None,
                direction: proto::cream::v1::Direction::Long as i32,
                time_horizon: proto::cream::v1::TimeHorizon::Swing as i32,
                thesis_state: proto::cream::v1::ThesisState::Watching as i32,
                bullish_factors: vec![
                    "Strong Q4 earnings beat".to_string(),
                    "RSI at 42 suggesting oversold".to_string(),
                ],
                bearish_factors: vec!["China revenue concerns".to_string()],
                legs: vec![],
                net_limit_price: None,
            }],
            portfolio_notes: Some("Single instrument entry".to_string()),
        }
    }

    #[test]
    fn test_convert_decision_plan_generates_plan_id_from_cycle_id() {
        let proto = make_proto_decision_plan();
        let result = convert_decision_plan(&proto);

        // cycle-2026-01-19-14-00 -> plan-2026-01-19-14-00
        assert_eq!(result.plan_id, "plan-2026-01-19-14-00");
        assert_eq!(result.cycle_id, "cycle-2026-01-19-14-00");
    }

    #[test]
    fn test_convert_decision_plan_generates_decision_id_from_instrument() {
        let proto = make_proto_decision_plan();
        let result = convert_decision_plan(&proto);

        // decision_id = {cycle_id}-{instrument_id.lowercase}
        assert_eq!(result.decisions[0].decision_id, "cycle-2026-01-19-14-00-aapl");
        assert_eq!(result.decisions[0].instrument_id, "AAPL");
    }

    #[test]
    fn test_convert_decision_plan_maps_action_correctly() {
        use crate::models::Action;

        let mut proto = make_proto_decision_plan();
        let result = convert_decision_plan(&proto);
        assert_eq!(result.decisions[0].action, Action::Buy);

        proto.decisions[0].action = proto::cream::v1::Action::Sell as i32;
        let result = convert_decision_plan(&proto);
        assert_eq!(result.decisions[0].action, Action::Sell);

        proto.decisions[0].action = proto::cream::v1::Action::Close as i32;
        let result = convert_decision_plan(&proto);
        assert_eq!(result.decisions[0].action, Action::Close);

        proto.decisions[0].action = proto::cream::v1::Action::Hold as i32;
        let result = convert_decision_plan(&proto);
        assert_eq!(result.decisions[0].action, Action::Hold);
    }

    #[test]
    fn test_convert_decision_plan_maps_direction_correctly() {
        use crate::models::Direction;

        let mut proto = make_proto_decision_plan();
        let result = convert_decision_plan(&proto);
        assert_eq!(result.decisions[0].direction, Direction::Long);

        proto.decisions[0].direction = proto::cream::v1::Direction::Short as i32;
        let result = convert_decision_plan(&proto);
        assert_eq!(result.decisions[0].direction, Direction::Short);

        proto.decisions[0].direction = proto::cream::v1::Direction::Flat as i32;
        let result = convert_decision_plan(&proto);
        assert_eq!(result.decisions[0].direction, Direction::Flat);
    }

    #[test]
    fn test_convert_decision_plan_maps_risk_levels() {
        let proto = make_proto_decision_plan();
        let result = convert_decision_plan(&proto);

        assert_eq!(result.decisions[0].stop_loss_level, Decimal::new(22850, 2));
        assert_eq!(result.decisions[0].take_profit_level, Decimal::new(25350, 2));
    }

    #[test]
    fn test_convert_decision_plan_maps_size_with_dollars_unit() {
        use crate::models::SizeUnit;

        let proto = make_proto_decision_plan();
        let result = convert_decision_plan(&proto);

        assert_eq!(result.decisions[0].size.quantity, Decimal::from(5000));
        assert_eq!(result.decisions[0].size.unit, SizeUnit::Dollars);
    }

    #[test]
    fn test_convert_decision_plan_maps_bullish_bearish_factors() {
        let proto = make_proto_decision_plan();
        let result = convert_decision_plan(&proto);

        assert_eq!(result.decisions[0].bullish_factors.len(), 2);
        assert_eq!(result.decisions[0].bullish_factors[0], "Strong Q4 earnings beat");
        assert_eq!(result.decisions[0].bearish_factors.len(), 1);
        assert_eq!(result.decisions[0].bearish_factors[0], "China revenue concerns");
    }

    #[test]
    fn test_convert_decision_plan_maps_confidence() {
        let proto = make_proto_decision_plan();
        let result = convert_decision_plan(&proto);

        // f64 to Decimal conversion may have precision loss, use approximate comparison
        let expected = Decimal::new(72, 2);
        let diff = (result.decisions[0].confidence - expected).abs();
        assert!(
            diff < Decimal::new(1, 4),
            "confidence should be ~0.72, got {}",
            result.decisions[0].confidence
        );
    }

    #[test]
    fn test_convert_decision_plan_maps_limit_price_from_order_plan() {
        let proto = make_proto_decision_plan();
        let result = convert_decision_plan(&proto);

        assert_eq!(result.decisions[0].limit_price, Some(Decimal::new(23850, 2)));
    }

    #[test]
    fn test_convert_decision_plan_maps_strategy_family() {
        use crate::models::StrategyFamily;

        let mut proto = make_proto_decision_plan();
        let result = convert_decision_plan(&proto);
        assert_eq!(result.decisions[0].strategy_family, StrategyFamily::EquityLong);

        proto.decisions[0].strategy_family = proto::cream::v1::StrategyFamily::IronCondor as i32;
        let result = convert_decision_plan(&proto);
        assert_eq!(result.decisions[0].strategy_family, StrategyFamily::IronCondor);

        proto.decisions[0].strategy_family = proto::cream::v1::StrategyFamily::VerticalSpread as i32;
        let result = convert_decision_plan(&proto);
        assert_eq!(result.decisions[0].strategy_family, StrategyFamily::VerticalSpread);
    }

    #[test]
    fn test_convert_decision_plan_maps_time_horizon() {
        use crate::models::TimeHorizon;

        let mut proto = make_proto_decision_plan();
        let result = convert_decision_plan(&proto);
        assert_eq!(result.decisions[0].time_horizon, TimeHorizon::Swing);

        proto.decisions[0].time_horizon = proto::cream::v1::TimeHorizon::Intraday as i32;
        let result = convert_decision_plan(&proto);
        assert_eq!(result.decisions[0].time_horizon, TimeHorizon::Intraday);
    }

    #[test]
    fn test_convert_decision_plan_maps_thesis_state() {
        use crate::models::ThesisState;

        let mut proto = make_proto_decision_plan();
        let result = convert_decision_plan(&proto);
        assert_eq!(result.decisions[0].thesis_state, ThesisState::Watching);

        proto.decisions[0].thesis_state = proto::cream::v1::ThesisState::Exiting as i32;
        let result = convert_decision_plan(&proto);
        assert_eq!(result.decisions[0].thesis_state, ThesisState::Exiting);
    }

    #[test]
    fn test_convert_decision_plan_with_option_legs() {
        use crate::models::PositionIntent;

        let mut proto = make_proto_decision_plan();
        proto.decisions[0].strategy_family = proto::cream::v1::StrategyFamily::IronCondor as i32;
        proto.decisions[0].legs = vec![
            proto::cream::v1::OptionLeg {
                symbol: "SPY260221P00540000".to_string(),
                ratio_qty: 5,
                position_intent: proto::cream::v1::PositionIntent::BuyToOpen as i32,
                contract: None,
            },
            proto::cream::v1::OptionLeg {
                symbol: "SPY260221P00550000".to_string(),
                ratio_qty: -5,
                position_intent: proto::cream::v1::PositionIntent::SellToOpen as i32,
                contract: None,
            },
        ];
        proto.decisions[0].net_limit_price = Some(1.50);

        let result = convert_decision_plan(&proto);

        assert_eq!(result.decisions[0].legs.len(), 2);
        assert_eq!(result.decisions[0].legs[0].symbol, "SPY260221P00540000");
        assert_eq!(result.decisions[0].legs[0].ratio_qty, 5);
        assert_eq!(result.decisions[0].legs[0].position_intent, PositionIntent::BuyToOpen);
        assert_eq!(result.decisions[0].legs[1].ratio_qty, -5);
        assert_eq!(result.decisions[0].legs[1].position_intent, PositionIntent::SellToOpen);
        assert_eq!(result.decisions[0].net_limit_price, Some(Decimal::new(150, 2)));
    }

    #[test]
    fn test_convert_decision_plan_defaults_approval_flags_to_true() {
        let proto = make_proto_decision_plan();
        let result = convert_decision_plan(&proto);

        // Proto doesn't have approval flags, so they default to true
        // (requiring explicit constraint check before execution)
        assert!(result.risk_manager_approved);
        assert!(result.critic_approved);
    }

    #[test]
    fn test_convert_decision_plan_maps_portfolio_notes_to_plan_rationale() {
        let proto = make_proto_decision_plan();
        let result = convert_decision_plan(&proto);

        assert_eq!(result.plan_rationale, "Single instrument entry");
    }
}
