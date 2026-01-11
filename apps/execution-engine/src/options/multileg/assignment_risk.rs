//! Assignment risk tracking for short option positions.
//!
//! Calculates assignment probability and potential impact for
//! short options based on moneyness and time to expiration.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::types::{OptionContract, OptionType};

/// Assignment risk level.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AssignmentRiskLevel {
    /// No assignment risk.
    None = 0,
    /// Low risk.
    Low = 1,
    /// Medium risk.
    Medium = 2,
    /// High risk.
    High = 3,
    /// Critical - assignment likely.
    Critical = 4,
}

/// Assignment risk details for a position.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssignmentRisk {
    /// Position ID.
    pub position_id: String,
    /// Contract ID.
    pub contract_id: String,
    /// Risk level.
    pub risk_level: AssignmentRiskLevel,
    /// Probability of assignment (0.0 to 1.0).
    pub assignment_probability: Decimal,
    /// Potential assignment cost/impact.
    pub potential_impact: Decimal,
    /// Number of contracts at risk.
    pub contracts_at_risk: u32,
    /// Description.
    pub description: String,
}

/// Calculate assignment risk for a short option position.
///
/// # Arguments
/// * `position_id` - Position identifier
/// * `contract` - The option contract
/// * `quantity` - Number of short contracts
/// * `underlying_price` - Current underlying price
/// * `days_to_expiration` - Days until expiration
///
/// # Returns
/// Assignment risk assessment
#[must_use]
pub fn calculate_assignment_risk(
    position_id: &str,
    contract: &OptionContract,
    quantity: u32,
    underlying_price: Decimal,
    days_to_expiration: i32,
) -> AssignmentRisk {
    // Calculate how far in the money
    let intrinsic_value = match contract.option_type {
        OptionType::Call => (underlying_price - contract.strike).max(Decimal::ZERO),
        OptionType::Put => (contract.strike - underlying_price).max(Decimal::ZERO),
    };

    let itm_percentage = if underlying_price > Decimal::ZERO {
        intrinsic_value / underlying_price
    } else {
        Decimal::ZERO
    };

    // Calculate assignment probability heuristically
    // This is a simplified model - real assignment models are more complex
    let base_probability = if intrinsic_value <= Decimal::ZERO {
        Decimal::ZERO
    } else if days_to_expiration <= 0 {
        Decimal::ONE // At expiration, ITM options are exercised
    } else if itm_percentage > Decimal::new(15, 2) {
        // Deep ITM (>15%)
        Decimal::new(60, 2) // 60% base probability
    } else if itm_percentage > Decimal::new(5, 2) {
        // Moderately ITM (5-15%)
        Decimal::new(30, 2) // 30% base probability
    } else {
        // Slightly ITM (<5%)
        Decimal::new(10, 2) // 10% base probability
    };

    // Increase probability as expiration approaches
    let time_factor = if days_to_expiration <= 0 {
        Decimal::ONE
    } else if days_to_expiration <= 7 {
        Decimal::new(15, 1) // 1.5x
    } else if days_to_expiration <= 30 {
        Decimal::new(12, 1) // 1.2x
    } else {
        Decimal::ONE
    };

    let assignment_probability = (base_probability * time_factor).min(Decimal::ONE);

    // Determine risk level
    let risk_level = if assignment_probability >= Decimal::new(80, 2) {
        AssignmentRiskLevel::Critical
    } else if assignment_probability >= Decimal::new(50, 2) {
        AssignmentRiskLevel::High
    } else if assignment_probability >= Decimal::new(20, 2) {
        AssignmentRiskLevel::Medium
    } else if assignment_probability > Decimal::ZERO {
        AssignmentRiskLevel::Low
    } else {
        AssignmentRiskLevel::None
    };

    // Calculate potential impact (assignment cost)
    let contracts = Decimal::from(quantity);
    let multiplier = Decimal::from(contract.multiplier);
    let potential_impact = intrinsic_value * contracts * multiplier;

    let description = if risk_level == AssignmentRiskLevel::None {
        "Option is out-of-the-money - no assignment risk".to_string()
    } else {
        format!(
            "{} is {:.1}% in-the-money, {:.0}% assignment probability, potential impact: ${:.0}",
            contract.option_type.to_string().to_lowercase(),
            itm_percentage * Decimal::new(100, 0),
            assignment_probability * Decimal::new(100, 0),
            potential_impact
        )
    };

    AssignmentRisk {
        position_id: position_id.to_string(),
        contract_id: contract.contract_id.clone(),
        risk_level,
        assignment_probability,
        potential_impact,
        contracts_at_risk: quantity,
        description,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::options::multileg::OptionStyle;

    #[test]
    fn test_assignment_risk_otm() {
        let contract = make_test_contract("AAPL240119C00200000");
        let risk = calculate_assignment_risk(
            "P1",
            &contract,
            10,
            Decimal::new(150, 0), // OTM
            30,
        );

        assert_eq!(risk.risk_level, AssignmentRiskLevel::None);
        assert_eq!(risk.assignment_probability, Decimal::ZERO);
    }

    #[test]
    fn test_assignment_risk_deep_itm_expiring() {
        let contract = OptionContract {
            contract_id: "AAPL240119C00100000".to_string(),
            underlying_symbol: "AAPL".to_string(),
            strike: Decimal::new(100, 0),
            expiration: "2024-01-19".to_string(),
            option_type: OptionType::Call,
            style: OptionStyle::American,
            multiplier: 100,
        };

        let risk = calculate_assignment_risk(
            "P1",
            &contract,
            10,
            Decimal::new(150, 0), // 50% ITM
            0,                    // At expiration
        );

        assert_eq!(risk.risk_level, AssignmentRiskLevel::Critical);
        assert_eq!(risk.assignment_probability, Decimal::ONE);
        assert_eq!(risk.contracts_at_risk, 10);
    }

    fn make_test_contract(id: &str) -> OptionContract {
        OptionContract {
            contract_id: id.to_string(),
            underlying_symbol: "AAPL".to_string(),
            strike: Decimal::new(150, 0),
            expiration: "2024-01-19".to_string(),
            option_type: OptionType::Call,
            style: OptionStyle::American,
            multiplier: 100,
        }
    }
}
