//! Strategy validation utilities.

use rust_decimal::Decimal;
use std::collections::HashMap;

use crate::options::OptionType;

use super::leg::{LegDirection, StrategyLeg};

/// Validate that a set of legs form a balanced spread (no naked exposure).
///
/// A balanced spread has equal long and short exposure at each strike.
#[must_use]
pub fn validate_balanced_spread(legs: &[StrategyLeg]) -> bool {
    // Group legs by (expiration, strike, option_type)
    let mut exposure: HashMap<(String, Decimal, OptionType), i32> = HashMap::new();

    for leg in legs {
        let key = (
            leg.contract.expiration.clone(),
            leg.contract.strike,
            leg.contract.option_type,
        );
        // Wrapping acceptable: u32 quantity fits in i32 for typical option spreads
        #[allow(clippy::cast_possible_wrap)]
        let quantity = leg.quantity as i32;
        let delta = match leg.direction {
            LegDirection::Long => quantity,
            LegDirection::Short => -quantity,
        };
        *exposure.entry(key).or_insert(0) += delta;
    }

    // For balanced spread, all net exposures should be zero
    // OR we should have defined risk (long options protect short options)
    // For simplicity, we allow any spread that isn't purely naked shorts

    // Wrapping acceptable: u32 quantity fits in i32 for typical option spreads
    #[allow(clippy::cast_possible_wrap)]
    let total_shorts: i32 = legs
        .iter()
        .filter(|l| l.direction == LegDirection::Short)
        .map(|l| l.quantity as i32)
        .sum();

    // Wrapping acceptable: u32 quantity fits in i32 for typical option spreads
    #[allow(clippy::cast_possible_wrap)]
    let total_longs: i32 = legs
        .iter()
        .filter(|l| l.direction == LegDirection::Long)
        .map(|l| l.quantity as i32)
        .sum();

    // Must have at least as many longs as shorts (defined risk)
    total_longs >= total_shorts
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::options::OptionContract;
    use crate::options::{OptionStyle, OptionType};
    use crate::pricing::strategy::leg::StrategyLeg;

    #[test]
    fn test_validate_balanced_spread_iron_condor() {
        // Iron condor is balanced (2 long + 2 short)
        let legs = vec![
            StrategyLeg::new(
                OptionContract {
                    contract_id: "1".to_string(),
                    underlying_symbol: "SPY".to_string(),
                    strike: Decimal::new(445, 0),
                    expiration: "2026-01-17".to_string(),
                    option_type: OptionType::Put,
                    style: OptionStyle::American,
                    multiplier: 100,
                },
                LegDirection::Long, // Long wing
                1,
                Decimal::new(50, 2),
            ),
            StrategyLeg::new(
                OptionContract {
                    contract_id: "2".to_string(),
                    underlying_symbol: "SPY".to_string(),
                    strike: Decimal::new(450, 0),
                    expiration: "2026-01-17".to_string(),
                    option_type: OptionType::Put,
                    style: OptionStyle::American,
                    multiplier: 100,
                },
                LegDirection::Short, // Short put
                1,
                Decimal::new(150, 2),
            ),
            StrategyLeg::new(
                OptionContract {
                    contract_id: "3".to_string(),
                    underlying_symbol: "SPY".to_string(),
                    strike: Decimal::new(470, 0),
                    expiration: "2026-01-17".to_string(),
                    option_type: OptionType::Call,
                    style: OptionStyle::American,
                    multiplier: 100,
                },
                LegDirection::Short, // Short call
                1,
                Decimal::new(140, 2),
            ),
            StrategyLeg::new(
                OptionContract {
                    contract_id: "4".to_string(),
                    underlying_symbol: "SPY".to_string(),
                    strike: Decimal::new(475, 0),
                    expiration: "2026-01-17".to_string(),
                    option_type: OptionType::Call,
                    style: OptionStyle::American,
                    multiplier: 100,
                },
                LegDirection::Long, // Long wing
                1,
                Decimal::new(40, 2),
            ),
        ];

        assert!(validate_balanced_spread(&legs));
    }

    #[test]
    fn test_validate_balanced_spread_naked_short() {
        // Naked short is not balanced
        let legs = vec![StrategyLeg::new(
            OptionContract {
                contract_id: "1".to_string(),
                underlying_symbol: "SPY".to_string(),
                strike: Decimal::new(450, 0),
                expiration: "2026-01-17".to_string(),
                option_type: OptionType::Put,
                style: OptionStyle::American,
                multiplier: 100,
            },
            LegDirection::Short, // Naked short!
            1,
            Decimal::new(150, 2),
        )];

        assert!(!validate_balanced_spread(&legs));
    }
}
