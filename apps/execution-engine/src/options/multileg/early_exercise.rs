//! Early exercise risk monitoring for American options.
//!
//! Monitors short option positions for early exercise risk based on:
//! - Moneyness (in-the-money percentage)
//! - Days to expiration
//! - Ex-dividend dates (for calls)

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::types::{OptionContract, OptionStyle, OptionType};

/// Early exercise risk level.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum EarlyExerciseRisk {
    /// No risk (European style or not exercisable).
    None,
    /// Low risk (out-of-the-money or far from expiration).
    Low,
    /// Medium risk (slightly in-the-money).
    Medium,
    /// High risk (deep in-the-money, near expiration, or dividend date).
    High,
    /// Critical risk (should expect assignment soon).
    Critical,
}

/// Alert for early exercise risk.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EarlyExerciseAlert {
    /// Contract ID.
    pub contract_id: String,
    /// Underlying symbol.
    pub underlying_symbol: String,
    /// Risk level.
    pub risk_level: EarlyExerciseRisk,
    /// Description of the risk.
    pub description: String,
    /// Days to expiration.
    pub days_to_expiration: i32,
    /// How far in-the-money (as percentage of underlying price).
    pub itm_percentage: Decimal,
    /// Recommended action.
    pub recommended_action: String,
}

/// Assess early exercise risk for a short option position.
///
/// # Arguments
/// * `contract` - The option contract
/// * `underlying_price` - Current underlying price
/// * `current_time` - Current time
/// * `ex_dividend_date` - Next ex-dividend date (if any)
///
/// # Returns
/// Early exercise risk assessment
#[must_use]
pub fn assess_early_exercise_risk(
    contract: &OptionContract,
    underlying_price: Decimal,
    current_time: DateTime<Utc>,
    ex_dividend_date: Option<DateTime<Utc>>,
) -> EarlyExerciseAlert {
    // European options have no early exercise risk
    if contract.style == OptionStyle::European {
        return EarlyExerciseAlert {
            contract_id: contract.contract_id.clone(),
            underlying_symbol: contract.underlying_symbol.clone(),
            risk_level: EarlyExerciseRisk::None,
            description: "European-style option cannot be exercised early".to_string(),
            days_to_expiration: 0,
            itm_percentage: Decimal::ZERO,
            recommended_action: "No action needed".to_string(),
        };
    }

    // Parse expiration date
    let expiration = chrono::NaiveDate::parse_from_str(&contract.expiration, "%Y-%m-%d")
        .map(|d| {
            d.and_hms_opt(16, 0, 0)
                .map(|t| DateTime::<Utc>::from_naive_utc_and_offset(t, Utc))
        })
        .ok()
        .flatten();

    // Truncation acceptable: days to expiration typically < 365*10, fits in i32
    #[allow(clippy::cast_possible_truncation)]
    let days_to_expiration = expiration.map_or(365, |exp| (exp - current_time).num_days() as i32);

    // Calculate ITM percentage
    let intrinsic_value = match contract.option_type {
        OptionType::Call => (underlying_price - contract.strike).max(Decimal::ZERO),
        OptionType::Put => (contract.strike - underlying_price).max(Decimal::ZERO),
    };

    let itm_percentage = if underlying_price > Decimal::ZERO {
        intrinsic_value / underlying_price * Decimal::new(100, 0)
    } else {
        Decimal::ZERO
    };

    let is_itm = intrinsic_value > Decimal::ZERO;

    // Check for dividend risk (calls near ex-dividend date)
    let dividend_risk = if contract.option_type == OptionType::Call {
        ex_dividend_date.is_some_and(|ex_div| {
            let days_to_ex_div = (ex_div - current_time).num_days();
            (0..=2).contains(&days_to_ex_div)
        })
    } else {
        false
    };

    // Determine risk level
    let (risk_level, description, recommended_action) = if !is_itm {
        (
            EarlyExerciseRisk::Low,
            "Option is out-of-the-money".to_string(),
            "Monitor for price movement".to_string(),
        )
    } else if dividend_risk && itm_percentage > Decimal::new(2, 0) {
        (
            EarlyExerciseRisk::Critical,
            format!(
                "Deep ITM call ({itm_percentage:.1}%) near ex-dividend date - high assignment probability"
            ),
            "Consider closing position before ex-dividend".to_string(),
        )
    } else if days_to_expiration <= 1 && itm_percentage > Decimal::new(1, 0) {
        (
            EarlyExerciseRisk::Critical,
            format!(
                "Option expiring soon ({days_to_expiration} days) and ITM by {itm_percentage:.1}%"
            ),
            "Close position or prepare for assignment".to_string(),
        )
    } else if itm_percentage > Decimal::new(10, 0) {
        (
            EarlyExerciseRisk::High,
            format!("Deep in-the-money ({itm_percentage:.1}%)"),
            "High assignment risk - consider closing or rolling".to_string(),
        )
    } else if itm_percentage > Decimal::new(3, 0) {
        (
            EarlyExerciseRisk::Medium,
            format!("In-the-money by {itm_percentage:.1}%"),
            "Monitor for potential assignment".to_string(),
        )
    } else if is_itm {
        (
            EarlyExerciseRisk::Low,
            format!("Slightly in-the-money ({itm_percentage:.1}%)"),
            "Low assignment risk - continue monitoring".to_string(),
        )
    } else {
        (
            EarlyExerciseRisk::Low,
            "Near the money".to_string(),
            "Monitor for price movement".to_string(),
        )
    };

    EarlyExerciseAlert {
        contract_id: contract.contract_id.clone(),
        underlying_symbol: contract.underlying_symbol.clone(),
        risk_level,
        description,
        days_to_expiration,
        itm_percentage,
        recommended_action,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_assess_early_exercise_risk_european() {
        let contract = OptionContract {
            contract_id: "SPX240119C04500000".to_string(),
            underlying_symbol: "SPX".to_string(),
            strike: Decimal::new(4500, 0),
            expiration: "2024-01-19".to_string(),
            option_type: OptionType::Call,
            style: OptionStyle::European,
            multiplier: 100,
        };

        let alert = assess_early_exercise_risk(&contract, Decimal::new(4600, 0), Utc::now(), None);

        assert_eq!(alert.risk_level, EarlyExerciseRisk::None);
    }

    #[test]
    fn test_assess_early_exercise_risk_deep_itm() {
        let contract = OptionContract {
            contract_id: "AAPL240119C00100000".to_string(),
            underlying_symbol: "AAPL".to_string(),
            strike: Decimal::new(100, 0),
            expiration: "2025-01-19".to_string(), // Far out
            option_type: OptionType::Call,
            style: OptionStyle::American,
            multiplier: 100,
        };

        let alert = assess_early_exercise_risk(
            &contract,
            Decimal::new(150, 0), // 50% ITM
            Utc::now(),
            None,
        );

        assert!(matches!(
            alert.risk_level,
            EarlyExerciseRisk::High | EarlyExerciseRisk::Critical
        ));
    }

    #[test]
    fn test_assess_early_exercise_risk_otm() {
        let contract = OptionContract {
            contract_id: "AAPL240119C00200000".to_string(),
            underlying_symbol: "AAPL".to_string(),
            strike: Decimal::new(200, 0),
            expiration: "2024-06-21".to_string(),
            option_type: OptionType::Call,
            style: OptionStyle::American,
            multiplier: 100,
        };

        let alert = assess_early_exercise_risk(
            &contract,
            Decimal::new(150, 0), // OTM
            Utc::now(),
            None,
        );

        assert_eq!(alert.risk_level, EarlyExerciseRisk::Low);
    }
}
