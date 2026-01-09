//! Multi-leg options validation and analytics.
//!
//! Implements Alpaca-specific multi-leg options constraints including:
//! - Leg ratio GCD validation (ratios must be in simplest form)
//! - Greeks aggregation for portfolio-level risk
//! - Early exercise risk monitoring
//! - Assignment risk tracking
//! - Position limits enforcement

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ============================================
// Option Contract Types
// ============================================

/// Option type (call or put).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OptionType {
    /// Call option (right to buy).
    Call,
    /// Put option (right to sell).
    Put,
}

/// Option style (American or European).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OptionStyle {
    /// American - can be exercised any time before expiration.
    American,
    /// European - can only be exercised at expiration.
    European,
}

/// An option contract.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptionContract {
    /// Unique contract identifier (e.g., `"AAPL240119C00150000"`).
    pub contract_id: String,
    /// Underlying symbol.
    pub underlying_symbol: String,
    /// Strike price.
    pub strike: Decimal,
    /// Expiration date (ISO 8601).
    pub expiration: String,
    /// Option type (call/put).
    pub option_type: OptionType,
    /// Option style (American/European).
    pub style: OptionStyle,
    /// Contract multiplier (typically 100 for equity options).
    pub multiplier: u32,
}

/// Greeks for an option or portfolio.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Greeks {
    /// Delta - rate of change of option price with respect to underlying price.
    /// Range: -1.0 to 1.0 for individual options.
    pub delta: Decimal,
    /// Gamma - rate of change of delta with respect to underlying price.
    pub gamma: Decimal,
    /// Theta - rate of change of option price with respect to time (per day).
    /// Typically negative for long options.
    pub theta: Decimal,
    /// Vega - sensitivity to implied volatility (per 1% change in IV).
    pub vega: Decimal,
    /// Rho - sensitivity to interest rate changes (per 1% change in rates).
    pub rho: Decimal,
    /// Vanna - sensitivity of delta to IV changes (optional, higher-order Greek).
    pub vanna: Option<Decimal>,
    /// Charm - rate of change of delta over time (optional, higher-order Greek).
    pub charm: Option<Decimal>,
}

impl Greeks {
    /// Create new Greeks with basic values.
    #[must_use]
    pub const fn new(
        delta: Decimal,
        gamma: Decimal,
        theta: Decimal,
        vega: Decimal,
        rho: Decimal,
    ) -> Self {
        Self {
            delta,
            gamma,
            theta,
            vega,
            rho,
            vanna: None,
            charm: None,
        }
    }

    /// Scale Greeks by a quantity (positive for long, negative for short).
    #[must_use]
    pub fn scale(&self, quantity: Decimal) -> Self {
        Self {
            delta: self.delta * quantity,
            gamma: self.gamma * quantity,
            theta: self.theta * quantity,
            vega: self.vega * quantity,
            rho: self.rho * quantity,
            vanna: self.vanna.map(|v| v * quantity),
            charm: self.charm.map(|c| c * quantity),
        }
    }

    /// Add another Greeks to this one.
    #[must_use]
    pub fn add(&self, other: &Self) -> Self {
        Self {
            delta: self.delta + other.delta,
            gamma: self.gamma + other.gamma,
            theta: self.theta + other.theta,
            vega: self.vega + other.vega,
            rho: self.rho + other.rho,
            vanna: match (self.vanna, other.vanna) {
                (Some(a), Some(b)) => Some(a + b),
                (Some(a), None) | (None, Some(a)) => Some(a),
                (None, None) => None,
            },
            charm: match (self.charm, other.charm) {
                (Some(a), Some(b)) => Some(a + b),
                (Some(a), None) | (None, Some(a)) => Some(a),
                (None, None) => None,
            },
        }
    }

    /// Create zero Greeks.
    #[must_use]
    pub const fn zero() -> Self {
        Self {
            delta: Decimal::ZERO,
            gamma: Decimal::ZERO,
            theta: Decimal::ZERO,
            vega: Decimal::ZERO,
            rho: Decimal::ZERO,
            vanna: None,
            charm: None,
        }
    }
}

// ============================================
// Multi-Leg Order Types
// ============================================

/// A single leg in a multi-leg order.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptionLeg {
    /// Leg index (0-based).
    pub leg_index: u32,
    /// Option contract.
    pub contract: OptionContract,
    /// Quantity (absolute value, sign determined by `is_long`).
    pub quantity: u32,
    /// Ratio for this leg (e.g., 1 for single, 2 for butterfly wing).
    pub ratio: u32,
    /// Whether this is a long position.
    pub is_long: bool,
    /// Greeks for this leg (per contract).
    pub greeks: Greeks,
}

impl OptionLeg {
    /// Get signed quantity (positive for long, negative for short).
    #[must_use]
    pub fn signed_quantity(&self) -> i64 {
        let qty = i64::from(self.quantity);
        if self.is_long { qty } else { -qty }
    }

    /// Get total Greeks for this leg (scaled by signed quantity).
    #[must_use]
    pub fn total_greeks(&self) -> Greeks {
        let signed = Decimal::from(self.signed_quantity());
        self.greeks.scale(signed)
    }
}

/// A multi-leg options order.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MultiLegOrder {
    /// Order ID.
    pub order_id: String,
    /// Underlying symbol.
    pub underlying_symbol: String,
    /// Strategy name (e.g., `"iron_condor"`, `"vertical_spread"`).
    pub strategy_name: String,
    /// Order legs.
    pub legs: Vec<OptionLeg>,
    /// Net debit (positive) or credit (negative).
    pub net_premium: Decimal,
}

impl MultiLegOrder {
    /// Get all leg ratios.
    #[must_use]
    pub fn leg_ratios(&self) -> Vec<u32> {
        self.legs.iter().map(|l| l.ratio).collect()
    }

    /// Calculate aggregate Greeks for the entire strategy.
    #[must_use]
    pub fn aggregate_greeks(&self) -> Greeks {
        aggregate_greeks(&self.legs)
    }
}

// ============================================
// GCD Validation (Alpaca Requirement)
// ============================================

/// Calculate GCD of two numbers using Euclidean algorithm.
fn gcd_two(a: u32, b: u32) -> u32 {
    if b == 0 { a } else { gcd_two(b, a % b) }
}

/// Calculate GCD of multiple numbers.
///
/// Returns the GCD of all numbers, or 0 if the list is empty.
#[must_use]
pub fn gcd_multiple(numbers: &[u32]) -> u32 {
    if numbers.is_empty() {
        return 0;
    }
    numbers.iter().copied().fold(numbers[0], gcd_two)
}

/// Result of multi-leg validation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MultiLegValidationResult {
    /// Whether validation passed.
    pub valid: bool,
    /// Validation errors (if any).
    pub errors: Vec<String>,
    /// Validation warnings (if any).
    pub warnings: Vec<String>,
    /// GCD of leg ratios (for diagnostics).
    pub leg_ratio_gcd: u32,
}

impl MultiLegValidationResult {
    /// Create a passing result.
    #[must_use]
    pub fn success(gcd: u32) -> Self {
        Self {
            valid: true,
            errors: Vec::new(),
            warnings: Vec::new(),
            leg_ratio_gcd: gcd,
        }
    }

    /// Create a failing result.
    #[must_use]
    pub fn failure(errors: Vec<String>, gcd: u32) -> Self {
        Self {
            valid: false,
            errors,
            warnings: Vec::new(),
            leg_ratio_gcd: gcd,
        }
    }
}

/// Validate leg ratios are in simplest form (GCD = 1).
///
/// Alpaca requires multi-leg option orders to have leg ratios in
/// their simplest form. For example:
/// - [1, 2] is valid (GCD = 1)
/// - [2, 4] is invalid (GCD = 2, should be [1, 2])
/// - [1, 1, 1, 1] is valid (GCD = 1)
///
/// # Arguments
/// * `ratios` - The leg ratios to validate
///
/// # Returns
/// Tuple of (`is_valid`, `gcd`)
#[must_use]
pub fn validate_leg_ratios(ratios: &[u32]) -> (bool, u32) {
    if ratios.is_empty() {
        return (true, 0);
    }

    // Filter out zeros (invalid ratios)
    let valid_ratios: Vec<u32> = ratios.iter().copied().filter(|&r| r > 0).collect();
    if valid_ratios.len() != ratios.len() {
        return (false, 0);
    }

    let gcd = gcd_multiple(&valid_ratios);
    (gcd == 1, gcd)
}

/// Validate a complete multi-leg order.
///
/// Checks:
/// - At least 2 legs
/// - Leg ratios in simplest form (GCD = 1)
/// - All legs have same underlying
/// - All ratios are positive
///
/// # Arguments
/// * `order` - The multi-leg order to validate
///
/// # Returns
/// Validation result with errors/warnings
#[must_use]
pub fn validate_multi_leg_order(order: &MultiLegOrder) -> MultiLegValidationResult {
    let mut errors = Vec::new();

    // Check minimum legs
    if order.legs.len() < 2 {
        errors.push("Multi-leg order requires at least 2 legs".to_string());
    }

    // Check all legs have same underlying
    let mismatched: Vec<_> = order
        .legs
        .iter()
        .filter(|l| l.contract.underlying_symbol != order.underlying_symbol)
        .collect();
    if !mismatched.is_empty() {
        errors.push(format!(
            "All legs must have same underlying ({}), found mismatched: {:?}",
            order.underlying_symbol,
            mismatched
                .iter()
                .map(|l| &l.contract.underlying_symbol)
                .collect::<Vec<_>>()
        ));
    }

    // Check ratios are positive
    let zero_ratios: Vec<_> = order.legs.iter().filter(|l| l.ratio == 0).collect();
    if !zero_ratios.is_empty() {
        errors.push("All leg ratios must be positive".to_string());
    }

    // Validate GCD
    let ratios = order.leg_ratios();
    let (ratios_valid, gcd) = validate_leg_ratios(&ratios);
    if !ratios_valid && gcd > 1 {
        errors.push(format!(
            "Leg ratios {ratios:?} not in simplest form (GCD = {gcd}). Divide all ratios by {gcd}."
        ));
    }

    if errors.is_empty() {
        MultiLegValidationResult::success(gcd)
    } else {
        MultiLegValidationResult::failure(errors, gcd)
    }
}

// ============================================
// Greeks Aggregation
// ============================================

/// Aggregate Greeks across all legs of a multi-leg strategy.
///
/// Each leg's Greeks are scaled by its signed quantity (positive for
/// long, negative for short) and summed.
///
/// # Arguments
/// * `legs` - The option legs to aggregate
///
/// # Returns
/// Aggregated Greeks for the entire strategy
#[must_use]
pub fn aggregate_greeks(legs: &[OptionLeg]) -> Greeks {
    legs.iter()
        .fold(Greeks::zero(), |acc, leg| acc.add(&leg.total_greeks()))
}

/// Calculate portfolio-level Greeks from multiple positions.
///
/// # Arguments
/// * `positions` - Map of position ID to (Greeks, signed quantity)
///
/// # Returns
/// Aggregated Greeks for the entire portfolio
#[must_use]
pub fn calculate_portfolio_greeks(positions: &HashMap<String, (Greeks, Decimal)>) -> Greeks {
    positions
        .values()
        .fold(Greeks::zero(), |acc, (greeks, quantity)| {
            acc.add(&greeks.scale(*quantity))
        })
}

// ============================================
// Early Exercise Risk Monitoring
// ============================================

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
            days_to_ex_div >= 0 && days_to_ex_div <= 2
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

// ============================================
// Assignment Risk Tracking
// ============================================

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

impl std::fmt::Display for OptionType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Call => write!(f, "Call"),
            Self::Put => write!(f, "Put"),
        }
    }
}

// ============================================
// Position Tracking
// ============================================

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
            max_delta: Decimal::new(100, 0),  // ±100 delta
            max_gamma: Decimal::new(50, 0),   // ±50 gamma
            max_vega: Decimal::new(5000, 0),  // ±$5000 vega
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

    // ============ GCD Tests ============

    #[test]
    fn test_gcd_two() {
        assert_eq!(gcd_two(48, 18), 6);
        assert_eq!(gcd_two(18, 48), 6);
        assert_eq!(gcd_two(7, 11), 1);
        assert_eq!(gcd_two(12, 12), 12);
        assert_eq!(gcd_two(0, 5), 5);
        assert_eq!(gcd_two(5, 0), 5);
    }

    #[test]
    fn test_gcd_multiple() {
        assert_eq!(gcd_multiple(&[12, 18, 24]), 6);
        assert_eq!(gcd_multiple(&[1, 2, 1]), 1);
        assert_eq!(gcd_multiple(&[2, 4, 6]), 2);
        assert_eq!(gcd_multiple(&[7, 13, 11]), 1);
        assert_eq!(gcd_multiple(&[]), 0);
        assert_eq!(gcd_multiple(&[42]), 42);
    }

    #[test]
    fn test_validate_leg_ratios_valid() {
        // Valid: [1, 2] - GCD is 1
        let (valid, gcd) = validate_leg_ratios(&[1, 2]);
        assert!(valid);
        assert_eq!(gcd, 1);

        // Valid: [1, 1, 1, 1] - Iron condor
        let (valid, gcd) = validate_leg_ratios(&[1, 1, 1, 1]);
        assert!(valid);
        assert_eq!(gcd, 1);

        // Valid: [1, 2, 1] - Butterfly
        let (valid, gcd) = validate_leg_ratios(&[1, 2, 1]);
        assert!(valid);
        assert_eq!(gcd, 1);
    }

    #[test]
    fn test_validate_leg_ratios_invalid() {
        // Invalid: [2, 4] - GCD is 2, should be [1, 2]
        let (valid, gcd) = validate_leg_ratios(&[2, 4]);
        assert!(!valid);
        assert_eq!(gcd, 2);

        // Invalid: [3, 6, 9] - GCD is 3
        let (valid, gcd) = validate_leg_ratios(&[3, 6, 9]);
        assert!(!valid);
        assert_eq!(gcd, 3);
    }

    #[test]
    fn test_validate_leg_ratios_zero() {
        // Invalid: contains zero
        let (valid, _) = validate_leg_ratios(&[1, 0, 2]);
        assert!(!valid);
    }

    // ============ Greeks Tests ============

    #[test]
    fn test_greeks_scale() {
        let greeks = Greeks::new(
            Decimal::new(5, 1),  // 0.5 delta
            Decimal::new(1, 2),  // 0.01 gamma
            Decimal::new(-5, 0), // -5 theta
            Decimal::new(10, 0), // 10 vega
            Decimal::new(1, 0),  // 1 rho
        );

        // Scale by +10 (long 10 contracts)
        let scaled = greeks.scale(Decimal::new(10, 0));
        assert_eq!(scaled.delta, Decimal::new(5, 0)); // 5 delta
        assert_eq!(scaled.gamma, Decimal::new(1, 1)); // 0.1 gamma
        assert_eq!(scaled.theta, Decimal::new(-50, 0)); // -50 theta

        // Scale by -5 (short 5 contracts)
        let scaled = greeks.scale(Decimal::new(-5, 0));
        assert_eq!(scaled.delta, Decimal::new(-25, 1)); // -2.5 delta
    }

    #[test]
    fn test_greeks_add() {
        let g1 = Greeks::new(
            Decimal::new(5, 0),
            Decimal::new(1, 0),
            Decimal::new(-10, 0),
            Decimal::new(20, 0),
            Decimal::new(2, 0),
        );

        let g2 = Greeks::new(
            Decimal::new(-3, 0),
            Decimal::new(2, 0),
            Decimal::new(-5, 0),
            Decimal::new(10, 0),
            Decimal::new(1, 0),
        );

        let sum = g1.add(&g2);
        assert_eq!(sum.delta, Decimal::new(2, 0));
        assert_eq!(sum.gamma, Decimal::new(3, 0));
        assert_eq!(sum.theta, Decimal::new(-15, 0));
        assert_eq!(sum.vega, Decimal::new(30, 0));
        assert_eq!(sum.rho, Decimal::new(3, 0));
    }

    #[test]
    fn test_aggregate_greeks() {
        let legs = vec![
            OptionLeg {
                leg_index: 0,
                contract: make_test_contract("AAPL240119C00150000"),
                quantity: 1,
                ratio: 1,
                is_long: true,
                greeks: Greeks::new(
                    Decimal::new(6, 1),  // 0.6 delta
                    Decimal::new(2, 2),  // 0.02 gamma
                    Decimal::new(-8, 0), // -8 theta
                    Decimal::new(15, 0), // 15 vega
                    Decimal::new(1, 0),
                ),
            },
            OptionLeg {
                leg_index: 1,
                contract: make_test_contract("AAPL240119C00155000"),
                quantity: 1,
                ratio: 1,
                is_long: false, // Short leg
                greeks: Greeks::new(
                    Decimal::new(4, 1),  // 0.4 delta
                    Decimal::new(2, 2),  // 0.02 gamma
                    Decimal::new(-6, 0), // -6 theta
                    Decimal::new(12, 0), // 12 vega
                    Decimal::new(1, 0),
                ),
            },
        ];

        let agg = aggregate_greeks(&legs);
        // Long 1 @ 0.6 + Short 1 @ 0.4 = 0.6 - 0.4 = 0.2
        assert_eq!(agg.delta, Decimal::new(2, 1));
        // Long 1 @ 0.02 + Short 1 @ 0.02 = 0.02 - 0.02 = 0
        assert_eq!(agg.gamma, Decimal::ZERO);
    }

    // ============ Multi-Leg Validation Tests ============

    #[test]
    fn test_validate_multi_leg_order_valid() {
        let order = make_test_iron_condor();
        let result = validate_multi_leg_order(&order);
        assert!(result.valid, "Errors: {:?}", result.errors);
        assert_eq!(result.leg_ratio_gcd, 1);
    }

    #[test]
    fn test_validate_multi_leg_order_invalid_gcd() {
        let order = MultiLegOrder {
            order_id: "O1".to_string(),
            underlying_symbol: "AAPL".to_string(),
            strategy_name: "test".to_string(),
            legs: vec![
                OptionLeg {
                    leg_index: 0,
                    contract: make_test_contract("C1"),
                    quantity: 2,
                    ratio: 2, // Not simplest form
                    is_long: true,
                    greeks: Greeks::zero(),
                },
                OptionLeg {
                    leg_index: 1,
                    contract: make_test_contract("C2"),
                    quantity: 4,
                    ratio: 4, // Not simplest form
                    is_long: false,
                    greeks: Greeks::zero(),
                },
            ],
            net_premium: Decimal::ZERO,
        };

        let result = validate_multi_leg_order(&order);
        assert!(!result.valid);
        assert_eq!(result.leg_ratio_gcd, 2);
        assert!(result.errors.iter().any(|e| e.contains("simplest form")));
    }

    #[test]
    fn test_validate_multi_leg_order_single_leg() {
        let order = MultiLegOrder {
            order_id: "O1".to_string(),
            underlying_symbol: "AAPL".to_string(),
            strategy_name: "test".to_string(),
            legs: vec![OptionLeg {
                leg_index: 0,
                contract: make_test_contract("C1"),
                quantity: 1,
                ratio: 1,
                is_long: true,
                greeks: Greeks::zero(),
            }],
            net_premium: Decimal::ZERO,
        };

        let result = validate_multi_leg_order(&order);
        assert!(!result.valid);
        assert!(result.errors.iter().any(|e| e.contains("at least 2 legs")));
    }

    // ============ Early Exercise Risk Tests ============

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

    // ============ Assignment Risk Tests ============

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

    // ============ Position Tracker Tests ============

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

    // ============ Helper Functions ============

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

    fn make_test_iron_condor() -> MultiLegOrder {
        MultiLegOrder {
            order_id: "IC1".to_string(),
            underlying_symbol: "AAPL".to_string(),
            strategy_name: "iron_condor".to_string(),
            legs: vec![
                OptionLeg {
                    leg_index: 0,
                    contract: OptionContract {
                        contract_id: "AAPL240119P00140000".to_string(),
                        underlying_symbol: "AAPL".to_string(),
                        strike: Decimal::new(140, 0),
                        expiration: "2024-01-19".to_string(),
                        option_type: OptionType::Put,
                        style: OptionStyle::American,
                        multiplier: 100,
                    },
                    quantity: 1,
                    ratio: 1,
                    is_long: true, // Long put (lower wing)
                    greeks: Greeks::zero(),
                },
                OptionLeg {
                    leg_index: 1,
                    contract: OptionContract {
                        contract_id: "AAPL240119P00145000".to_string(),
                        underlying_symbol: "AAPL".to_string(),
                        strike: Decimal::new(145, 0),
                        expiration: "2024-01-19".to_string(),
                        option_type: OptionType::Put,
                        style: OptionStyle::American,
                        multiplier: 100,
                    },
                    quantity: 1,
                    ratio: 1,
                    is_long: false, // Short put
                    greeks: Greeks::zero(),
                },
                OptionLeg {
                    leg_index: 2,
                    contract: OptionContract {
                        contract_id: "AAPL240119C00155000".to_string(),
                        underlying_symbol: "AAPL".to_string(),
                        strike: Decimal::new(155, 0),
                        expiration: "2024-01-19".to_string(),
                        option_type: OptionType::Call,
                        style: OptionStyle::American,
                        multiplier: 100,
                    },
                    quantity: 1,
                    ratio: 1,
                    is_long: false, // Short call
                    greeks: Greeks::zero(),
                },
                OptionLeg {
                    leg_index: 3,
                    contract: OptionContract {
                        contract_id: "AAPL240119C00160000".to_string(),
                        underlying_symbol: "AAPL".to_string(),
                        strike: Decimal::new(160, 0),
                        expiration: "2024-01-19".to_string(),
                        option_type: OptionType::Call,
                        style: OptionStyle::American,
                        multiplier: 100,
                    },
                    quantity: 1,
                    ratio: 1,
                    is_long: true, // Long call (upper wing)
                    greeks: Greeks::zero(),
                },
            ],
            net_premium: Decimal::new(-150, 0), // Credit received
        }
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
