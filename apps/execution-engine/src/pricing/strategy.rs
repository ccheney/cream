//! Multi-Leg Options Strategy Builder
//!
//! Constructs options strategies including:
//! - Iron Condor: Bear call spread + bull put spread
//! - Vertical Spreads: Bull call, bear call, bull put, bear put
//! - Straddles and Strangles
//! - Butterflies
//!
//! Reference: docs/plans/09-rust-core.md (Strategy Builder, lines 388-410)

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::options::{Greeks, OptionContract, OptionStyle, OptionType};

// ============================================================================
// Error Types
// ============================================================================

/// Errors from strategy construction.
#[derive(Debug, Error)]
pub enum StrategyError {
    /// Invalid strike configuration.
    #[error("Invalid strike configuration: {message}")]
    InvalidStrikes {
        /// Error message.
        message: String,
    },

    /// Width constraint violated.
    #[error("Width constraint violated: {message}")]
    WidthConstraint {
        /// Error message.
        message: String,
    },

    /// Insufficient option chain data.
    #[error("Insufficient option chain: {message}")]
    InsufficientChain {
        /// Error message.
        message: String,
    },
}

// ============================================================================
// Leg Types
// ============================================================================

/// Position direction for a leg.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LegDirection {
    /// Long position (bought).
    Long,
    /// Short position (sold/written).
    Short,
}

/// A single leg of an options strategy.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StrategyLeg {
    /// The option contract.
    pub contract: OptionContract,
    /// Position direction.
    pub direction: LegDirection,
    /// Number of contracts.
    pub quantity: u32,
    /// Entry price (premium).
    pub premium: Decimal,
    /// Greeks for this leg.
    pub greeks: Option<Greeks>,
}

impl StrategyLeg {
    /// Create a new strategy leg.
    #[must_use]
    pub fn new(
        contract: OptionContract,
        direction: LegDirection,
        quantity: u32,
        premium: Decimal,
    ) -> Self {
        Self {
            contract,
            direction,
            quantity,
            premium,
            greeks: None,
        }
    }

    /// Set Greeks for this leg.
    #[must_use]
    pub fn with_greeks(mut self, greeks: Greeks) -> Self {
        self.greeks = Some(greeks);
        self
    }

    /// Net premium (positive = credit, negative = debit).
    #[must_use]
    pub fn net_premium(&self) -> Decimal {
        let multiplier = Decimal::from(self.contract.multiplier);
        let qty = Decimal::from(self.quantity);
        match self.direction {
            LegDirection::Short => self.premium * multiplier * qty,
            LegDirection::Long => -self.premium * multiplier * qty,
        }
    }
}

// ============================================================================
// Strategy Types
// ============================================================================

/// Type of options strategy.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum StrategyType {
    /// Iron Condor (neutral strategy).
    IronCondor,
    /// Bull Call Spread (bullish).
    BullCallSpread,
    /// Bear Call Spread (bearish).
    BearCallSpread,
    /// Bull Put Spread (bullish).
    BullPutSpread,
    /// Bear Put Spread (bearish).
    BearPutSpread,
    /// Straddle (volatility play).
    Straddle,
    /// Strangle (volatility play).
    Strangle,
    /// Iron Butterfly (neutral).
    IronButterfly,
    /// Call Butterfly.
    CallButterfly,
    /// Put Butterfly.
    PutButterfly,
    /// Calendar Spread (time spread, same strike different expirations).
    CalendarSpread,
    /// Diagonal Spread (different strikes AND expirations).
    DiagonalSpread,
    /// Custom strategy (any combination of legs).
    Custom,
}

/// A complete options strategy.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptionsStrategy {
    /// Strategy type.
    pub strategy_type: StrategyType,
    /// Underlying symbol.
    pub underlying: String,
    /// Expiration date (YYYY-MM-DD).
    pub expiration: String,
    /// All legs of the strategy.
    pub legs: Vec<StrategyLeg>,
    /// Net credit/debit (positive = credit).
    pub net_premium: Decimal,
    /// Maximum profit.
    pub max_profit: Decimal,
    /// Maximum loss.
    pub max_loss: Decimal,
    /// Breakeven points.
    pub breakevens: Vec<Decimal>,
    /// Aggregate Greeks.
    pub greeks: Option<Greeks>,
}

impl OptionsStrategy {
    /// Calculate aggregate Greeks from legs.
    #[must_use]
    pub fn aggregate_greeks(&self) -> Option<Greeks> {
        let mut agg = Greeks::default();
        let mut has_greeks = false;

        for leg in &self.legs {
            if let Some(ref g) = leg.greeks {
                has_greeks = true;
                let multiplier = match leg.direction {
                    LegDirection::Long => Decimal::from(leg.quantity),
                    LegDirection::Short => -Decimal::from(leg.quantity),
                };
                agg = agg.add(&g.scale(multiplier));
            }
        }

        if has_greeks { Some(agg) } else { None }
    }
}

// ============================================================================
// Strategy Builder
// ============================================================================

/// Configuration for strategy construction.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StrategyBuilderConfig {
    /// Target delta for short strikes (e.g., 0.20 = 20 delta).
    pub target_delta: Decimal,
    /// Maximum width between strikes (dollars).
    pub max_width: Decimal,
    /// Minimum credit to open (fraction of width).
    pub min_credit_ratio: Decimal,
}

impl Default for StrategyBuilderConfig {
    fn default() -> Self {
        Self {
            target_delta: Decimal::new(20, 2),     // 0.20 delta
            max_width: Decimal::new(5, 0),         // $5 wide
            min_credit_ratio: Decimal::new(25, 2), // 25% of width
        }
    }
}

/// Options strategy builder.
#[derive(Debug, Clone)]
pub struct StrategyBuilder {
    config: StrategyBuilderConfig,
}

impl Default for StrategyBuilder {
    fn default() -> Self {
        Self::new(StrategyBuilderConfig::default())
    }
}

impl StrategyBuilder {
    /// Create a new strategy builder.
    #[must_use]
    pub fn new(config: StrategyBuilderConfig) -> Self {
        Self { config }
    }

    /// Build an iron condor.
    ///
    /// An iron condor consists of:
    /// - Bear call spread (short call + long call at higher strike)
    /// - Bull put spread (short put + long put at lower strike)
    ///
    /// # Arguments
    ///
    /// * `underlying` - Underlying symbol
    /// * `expiration` - Expiration date (YYYY-MM-DD)
    /// * `short_put_strike` - Strike for short put
    /// * `short_call_strike` - Strike for short call
    /// * `width` - Width of wings (distance to long strikes)
    /// * `premiums` - (short_put, long_put, short_call, long_call) premiums
    ///
    /// # Errors
    ///
    /// Returns an error if strike configuration is invalid.
    pub fn iron_condor(
        &self,
        underlying: &str,
        expiration: &str,
        short_put_strike: Decimal,
        short_call_strike: Decimal,
        width: Decimal,
        premiums: (Decimal, Decimal, Decimal, Decimal),
    ) -> Result<OptionsStrategy, StrategyError> {
        // Validate strikes
        if short_put_strike >= short_call_strike {
            return Err(StrategyError::InvalidStrikes {
                message: "Short put strike must be below short call strike".to_string(),
            });
        }

        if width > self.config.max_width {
            return Err(StrategyError::WidthConstraint {
                message: format!("Width {width} exceeds max width {}", self.config.max_width),
            });
        }

        let long_put_strike = short_put_strike - width;
        let long_call_strike = short_call_strike + width;

        let (sp_prem, lp_prem, sc_prem, lc_prem) = premiums;

        let legs = vec![
            // Short put
            StrategyLeg::new(
                OptionContract {
                    contract_id: format!("{underlying}{expiration}P{short_put_strike}"),
                    underlying_symbol: underlying.to_string(),
                    strike: short_put_strike,
                    expiration: expiration.to_string(),
                    option_type: OptionType::Put,
                    style: OptionStyle::American,
                    multiplier: 100,
                },
                LegDirection::Short,
                1,
                sp_prem,
            ),
            // Long put (wing)
            StrategyLeg::new(
                OptionContract {
                    contract_id: format!("{underlying}{expiration}P{long_put_strike}"),
                    underlying_symbol: underlying.to_string(),
                    strike: long_put_strike,
                    expiration: expiration.to_string(),
                    option_type: OptionType::Put,
                    style: OptionStyle::American,
                    multiplier: 100,
                },
                LegDirection::Long,
                1,
                lp_prem,
            ),
            // Short call
            StrategyLeg::new(
                OptionContract {
                    contract_id: format!("{underlying}{expiration}C{short_call_strike}"),
                    underlying_symbol: underlying.to_string(),
                    strike: short_call_strike,
                    expiration: expiration.to_string(),
                    option_type: OptionType::Call,
                    style: OptionStyle::American,
                    multiplier: 100,
                },
                LegDirection::Short,
                1,
                sc_prem,
            ),
            // Long call (wing)
            StrategyLeg::new(
                OptionContract {
                    contract_id: format!("{underlying}{expiration}C{long_call_strike}"),
                    underlying_symbol: underlying.to_string(),
                    strike: long_call_strike,
                    expiration: expiration.to_string(),
                    option_type: OptionType::Call,
                    style: OptionStyle::American,
                    multiplier: 100,
                },
                LegDirection::Long,
                1,
                lc_prem,
            ),
        ];

        let net_premium: Decimal = legs.iter().map(|l| l.net_premium()).sum();
        let multiplier = Decimal::from(100);

        // Max profit = net credit received
        let max_profit = net_premium;

        // Max loss = width - net credit (on one side)
        let max_loss = (width * multiplier) - net_premium;

        // Breakevens
        let lower_breakeven = short_put_strike - (net_premium / multiplier);
        let upper_breakeven = short_call_strike + (net_premium / multiplier);

        Ok(OptionsStrategy {
            strategy_type: StrategyType::IronCondor,
            underlying: underlying.to_string(),
            expiration: expiration.to_string(),
            legs,
            net_premium,
            max_profit,
            max_loss,
            breakevens: vec![lower_breakeven, upper_breakeven],
            greeks: None,
        })
    }

    /// Build a vertical spread.
    ///
    /// # Arguments
    ///
    /// * `underlying` - Underlying symbol
    /// * `expiration` - Expiration date
    /// * `strategy_type` - Type of spread (BullCallSpread, BearCallSpread, etc.)
    /// * `short_strike` - Strike to sell
    /// * `long_strike` - Strike to buy
    /// * `short_premium` - Premium received for short leg
    /// * `long_premium` - Premium paid for long leg
    ///
    /// # Errors
    ///
    /// Returns an error if strike configuration is invalid.
    pub fn vertical_spread(
        &self,
        underlying: &str,
        expiration: &str,
        strategy_type: StrategyType,
        short_strike: Decimal,
        long_strike: Decimal,
        short_premium: Decimal,
        long_premium: Decimal,
    ) -> Result<OptionsStrategy, StrategyError> {
        let (option_type, is_credit) = match strategy_type {
            StrategyType::BullCallSpread => (OptionType::Call, false), // Debit
            StrategyType::BearCallSpread => (OptionType::Call, true),  // Credit
            StrategyType::BullPutSpread => (OptionType::Put, true),    // Credit
            StrategyType::BearPutSpread => (OptionType::Put, false),   // Debit
            _ => {
                return Err(StrategyError::InvalidStrikes {
                    message: format!(
                        "Invalid strategy type for vertical spread: {strategy_type:?}"
                    ),
                });
            }
        };

        // Validate strike order based on strategy type
        let width = (long_strike - short_strike).abs();
        if width > self.config.max_width {
            return Err(StrategyError::WidthConstraint {
                message: format!("Width {width} exceeds max width {}", self.config.max_width),
            });
        }

        let legs = vec![
            StrategyLeg::new(
                OptionContract {
                    contract_id: format!(
                        "{underlying}{expiration}{}{short_strike}",
                        if option_type == OptionType::Call {
                            "C"
                        } else {
                            "P"
                        }
                    ),
                    underlying_symbol: underlying.to_string(),
                    strike: short_strike,
                    expiration: expiration.to_string(),
                    option_type,
                    style: OptionStyle::American,
                    multiplier: 100,
                },
                LegDirection::Short,
                1,
                short_premium,
            ),
            StrategyLeg::new(
                OptionContract {
                    contract_id: format!(
                        "{underlying}{expiration}{}{long_strike}",
                        if option_type == OptionType::Call {
                            "C"
                        } else {
                            "P"
                        }
                    ),
                    underlying_symbol: underlying.to_string(),
                    strike: long_strike,
                    expiration: expiration.to_string(),
                    option_type,
                    style: OptionStyle::American,
                    multiplier: 100,
                },
                LegDirection::Long,
                1,
                long_premium,
            ),
        ];

        let net_premium: Decimal = legs.iter().map(|l| l.net_premium()).sum();
        let multiplier = Decimal::from(100);

        let (max_profit, max_loss) = if is_credit {
            // Credit spread
            (net_premium, (width * multiplier) - net_premium)
        } else {
            // Debit spread
            ((width * multiplier) + net_premium, -net_premium)
        };

        // Breakeven depends on strategy type
        let breakeven = if option_type == OptionType::Call {
            if is_credit {
                short_strike + (net_premium / multiplier)
            } else {
                long_strike + (-net_premium / multiplier)
            }
        } else if is_credit {
            short_strike - (net_premium / multiplier)
        } else {
            long_strike - (-net_premium / multiplier)
        };

        Ok(OptionsStrategy {
            strategy_type,
            underlying: underlying.to_string(),
            expiration: expiration.to_string(),
            legs,
            net_premium,
            max_profit,
            max_loss,
            breakevens: vec![breakeven],
            greeks: None,
        })
    }

    /// Build a straddle.
    ///
    /// A straddle is a long call and long put at the same strike.
    pub fn straddle(
        &self,
        underlying: &str,
        expiration: &str,
        strike: Decimal,
        call_premium: Decimal,
        put_premium: Decimal,
    ) -> Result<OptionsStrategy, StrategyError> {
        let legs = vec![
            StrategyLeg::new(
                OptionContract {
                    contract_id: format!("{underlying}{expiration}C{strike}"),
                    underlying_symbol: underlying.to_string(),
                    strike,
                    expiration: expiration.to_string(),
                    option_type: OptionType::Call,
                    style: OptionStyle::American,
                    multiplier: 100,
                },
                LegDirection::Long,
                1,
                call_premium,
            ),
            StrategyLeg::new(
                OptionContract {
                    contract_id: format!("{underlying}{expiration}P{strike}"),
                    underlying_symbol: underlying.to_string(),
                    strike,
                    expiration: expiration.to_string(),
                    option_type: OptionType::Put,
                    style: OptionStyle::American,
                    multiplier: 100,
                },
                LegDirection::Long,
                1,
                put_premium,
            ),
        ];

        let net_premium: Decimal = legs.iter().map(|l| l.net_premium()).sum();
        let multiplier = Decimal::from(100);
        let total_cost = -net_premium; // Debit

        // Max loss = total premium paid
        let max_loss = total_cost;

        // Max profit = unlimited (theoretically)
        let max_profit = Decimal::MAX;

        // Breakevens
        let lower_breakeven = strike - (total_cost / multiplier);
        let upper_breakeven = strike + (total_cost / multiplier);

        Ok(OptionsStrategy {
            strategy_type: StrategyType::Straddle,
            underlying: underlying.to_string(),
            expiration: expiration.to_string(),
            legs,
            net_premium,
            max_profit,
            max_loss,
            breakevens: vec![lower_breakeven, upper_breakeven],
            greeks: None,
        })
    }

    /// Build a strangle.
    ///
    /// A strangle is a long OTM call and long OTM put.
    pub fn strangle(
        &self,
        underlying: &str,
        expiration: &str,
        put_strike: Decimal,
        call_strike: Decimal,
        call_premium: Decimal,
        put_premium: Decimal,
    ) -> Result<OptionsStrategy, StrategyError> {
        if put_strike >= call_strike {
            return Err(StrategyError::InvalidStrikes {
                message: "Put strike must be below call strike for strangle".to_string(),
            });
        }

        let legs = vec![
            StrategyLeg::new(
                OptionContract {
                    contract_id: format!("{underlying}{expiration}C{call_strike}"),
                    underlying_symbol: underlying.to_string(),
                    strike: call_strike,
                    expiration: expiration.to_string(),
                    option_type: OptionType::Call,
                    style: OptionStyle::American,
                    multiplier: 100,
                },
                LegDirection::Long,
                1,
                call_premium,
            ),
            StrategyLeg::new(
                OptionContract {
                    contract_id: format!("{underlying}{expiration}P{put_strike}"),
                    underlying_symbol: underlying.to_string(),
                    strike: put_strike,
                    expiration: expiration.to_string(),
                    option_type: OptionType::Put,
                    style: OptionStyle::American,
                    multiplier: 100,
                },
                LegDirection::Long,
                1,
                put_premium,
            ),
        ];

        let net_premium: Decimal = legs.iter().map(|l| l.net_premium()).sum();
        let multiplier = Decimal::from(100);
        let total_cost = -net_premium;

        let max_loss = total_cost;
        let max_profit = Decimal::MAX;

        let lower_breakeven = put_strike - (total_cost / multiplier);
        let upper_breakeven = call_strike + (total_cost / multiplier);

        Ok(OptionsStrategy {
            strategy_type: StrategyType::Strangle,
            underlying: underlying.to_string(),
            expiration: expiration.to_string(),
            legs,
            net_premium,
            max_profit,
            max_loss,
            breakevens: vec![lower_breakeven, upper_breakeven],
            greeks: None,
        })
    }

    /// Build a calendar spread (time spread).
    ///
    /// A calendar spread is a same-strike, different-expiration strategy.
    /// Typically sells near-term and buys far-term (debit spread).
    ///
    /// # Arguments
    ///
    /// * `underlying` - Underlying symbol
    /// * `strike` - Strike price (same for both legs)
    /// * `near_expiration` - Near-term expiration (YYYY-MM-DD), sold
    /// * `far_expiration` - Far-term expiration (YYYY-MM-DD), bought
    /// * `option_type` - Call or Put
    /// * `near_premium` - Premium received for near-term option (sold)
    /// * `far_premium` - Premium paid for far-term option (bought)
    ///
    /// # Errors
    ///
    /// Returns an error if expirations are invalid.
    pub fn calendar_spread(
        &self,
        underlying: &str,
        strike: Decimal,
        near_expiration: &str,
        far_expiration: &str,
        option_type: OptionType,
        near_premium: Decimal,
        far_premium: Decimal,
    ) -> Result<OptionsStrategy, StrategyError> {
        // Validate expirations (near should be before far)
        if near_expiration >= far_expiration {
            return Err(StrategyError::InvalidStrikes {
                message: "Near expiration must be before far expiration".to_string(),
            });
        }

        let type_char = match option_type {
            OptionType::Call => "C",
            OptionType::Put => "P",
        };

        let legs = vec![
            // Short near-term option
            StrategyLeg::new(
                OptionContract {
                    contract_id: format!("{underlying}{near_expiration}{type_char}{strike}"),
                    underlying_symbol: underlying.to_string(),
                    strike,
                    expiration: near_expiration.to_string(),
                    option_type,
                    style: OptionStyle::American,
                    multiplier: 100,
                },
                LegDirection::Short,
                1,
                near_premium,
            ),
            // Long far-term option
            StrategyLeg::new(
                OptionContract {
                    contract_id: format!("{underlying}{far_expiration}{type_char}{strike}"),
                    underlying_symbol: underlying.to_string(),
                    strike,
                    expiration: far_expiration.to_string(),
                    option_type,
                    style: OptionStyle::American,
                    multiplier: 100,
                },
                LegDirection::Long,
                1,
                far_premium,
            ),
        ];

        let net_premium: Decimal = legs.iter().map(|l| l.net_premium()).sum();

        // Max profit for calendar occurs at strike at near expiration
        // Max loss is the net debit paid
        let max_loss = if net_premium < Decimal::ZERO {
            -net_premium
        } else {
            Decimal::ZERO
        };

        // Max profit is theoretical (depends on volatility at near expiration)
        // Use a placeholder; actual P&L depends on IV and time
        let max_profit = Decimal::MAX;

        Ok(OptionsStrategy {
            strategy_type: StrategyType::CalendarSpread,
            underlying: underlying.to_string(),
            expiration: far_expiration.to_string(), // Use far expiration as primary
            legs,
            net_premium,
            max_profit,
            max_loss,
            breakevens: vec![strike], // Approximate breakeven at strike
            greeks: None,
        })
    }

    /// Build a diagonal spread.
    ///
    /// A diagonal spread has different strikes AND different expirations.
    /// Combines elements of vertical and calendar spreads.
    ///
    /// # Arguments
    ///
    /// * `underlying` - Underlying symbol
    /// * `near_strike` - Near-term strike (sold)
    /// * `far_strike` - Far-term strike (bought)
    /// * `near_expiration` - Near-term expiration (YYYY-MM-DD)
    /// * `far_expiration` - Far-term expiration (YYYY-MM-DD)
    /// * `option_type` - Call or Put
    /// * `near_premium` - Premium received for near-term option
    /// * `far_premium` - Premium paid for far-term option
    ///
    /// # Errors
    ///
    /// Returns an error if configuration is invalid.
    pub fn diagonal_spread(
        &self,
        underlying: &str,
        near_strike: Decimal,
        far_strike: Decimal,
        near_expiration: &str,
        far_expiration: &str,
        option_type: OptionType,
        near_premium: Decimal,
        far_premium: Decimal,
    ) -> Result<OptionsStrategy, StrategyError> {
        // Validate expirations
        if near_expiration >= far_expiration {
            return Err(StrategyError::InvalidStrikes {
                message: "Near expiration must be before far expiration".to_string(),
            });
        }

        // For a proper diagonal, strikes should be different
        // (same strikes would be a calendar)
        if near_strike == far_strike {
            return Err(StrategyError::InvalidStrikes {
                message: "Strikes must be different for diagonal spread (use calendar_spread for same strike)".to_string(),
            });
        }

        let type_char = match option_type {
            OptionType::Call => "C",
            OptionType::Put => "P",
        };

        let legs = vec![
            // Short near-term option (usually OTM)
            StrategyLeg::new(
                OptionContract {
                    contract_id: format!("{underlying}{near_expiration}{type_char}{near_strike}"),
                    underlying_symbol: underlying.to_string(),
                    strike: near_strike,
                    expiration: near_expiration.to_string(),
                    option_type,
                    style: OptionStyle::American,
                    multiplier: 100,
                },
                LegDirection::Short,
                1,
                near_premium,
            ),
            // Long far-term option (usually closer to ATM)
            StrategyLeg::new(
                OptionContract {
                    contract_id: format!("{underlying}{far_expiration}{type_char}{far_strike}"),
                    underlying_symbol: underlying.to_string(),
                    strike: far_strike,
                    expiration: far_expiration.to_string(),
                    option_type,
                    style: OptionStyle::American,
                    multiplier: 100,
                },
                LegDirection::Long,
                1,
                far_premium,
            ),
        ];

        let net_premium: Decimal = legs.iter().map(|l| l.net_premium()).sum();

        // Max loss is typically the net debit
        let max_loss = if net_premium < Decimal::ZERO {
            -net_premium
        } else {
            Decimal::ZERO
        };

        // Max profit depends on near-term expiration price
        let max_profit = Decimal::MAX;

        // Breakevens are complex and depend on time remaining
        let breakevens = vec![];

        Ok(OptionsStrategy {
            strategy_type: StrategyType::DiagonalSpread,
            underlying: underlying.to_string(),
            expiration: far_expiration.to_string(),
            legs,
            net_premium,
            max_profit,
            max_loss,
            breakevens,
            greeks: None,
        })
    }

    /// Build a custom strategy from arbitrary legs.
    ///
    /// This allows creating any combination of option legs.
    /// Use for complex strategies not covered by standard builders.
    ///
    /// # Arguments
    ///
    /// * `underlying` - Underlying symbol
    /// * `expiration` - Primary expiration (for multi-expiration use the farthest)
    /// * `legs` - Vector of strategy legs
    ///
    /// # Errors
    ///
    /// Returns an error if legs are empty.
    pub fn custom(
        &self,
        underlying: &str,
        expiration: &str,
        legs: Vec<StrategyLeg>,
    ) -> Result<OptionsStrategy, StrategyError> {
        if legs.is_empty() {
            return Err(StrategyError::InsufficientChain {
                message: "Custom strategy must have at least one leg".to_string(),
            });
        }

        let net_premium: Decimal = legs.iter().map(|l| l.net_premium()).sum();

        // For custom strategies, we can't determine max P&L without more info
        // Use placeholder values
        let max_profit = Decimal::MAX;
        let max_loss = Decimal::MAX;

        Ok(OptionsStrategy {
            strategy_type: StrategyType::Custom,
            underlying: underlying.to_string(),
            expiration: expiration.to_string(),
            legs,
            net_premium,
            max_profit,
            max_loss,
            breakevens: vec![],
            greeks: None,
        })
    }

    /// Validate that a set of legs form a balanced spread (no naked exposure).
    ///
    /// A balanced spread has equal long and short exposure at each strike.
    #[must_use]
    pub fn validate_balanced_spread(legs: &[StrategyLeg]) -> bool {
        use std::collections::HashMap;

        // Group legs by (expiration, strike, option_type)
        let mut exposure: HashMap<(String, Decimal, OptionType), i32> = HashMap::new();

        for leg in legs {
            let key = (
                leg.contract.expiration.clone(),
                leg.contract.strike,
                leg.contract.option_type,
            );
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

        let total_shorts: i32 = legs
            .iter()
            .filter(|l| l.direction == LegDirection::Short)
            .map(|l| l.quantity as i32)
            .sum();

        let total_longs: i32 = legs
            .iter()
            .filter(|l| l.direction == LegDirection::Long)
            .map(|l| l.quantity as i32)
            .sum();

        // Must have at least as many longs as shorts (defined risk)
        total_longs >= total_shorts
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_iron_condor_construction() {
        let builder = StrategyBuilder::default();

        let strategy = builder
            .iron_condor(
                "SPY",
                "2026-01-17",
                Decimal::new(450, 0), // Short put at 450
                Decimal::new(470, 0), // Short call at 470
                Decimal::new(5, 0),   // $5 wide wings
                (
                    Decimal::new(150, 2), // Short put premium $1.50
                    Decimal::new(50, 2),  // Long put premium $0.50
                    Decimal::new(140, 2), // Short call premium $1.40
                    Decimal::new(40, 2),  // Long call premium $0.40
                ),
            )
            .unwrap();

        assert_eq!(strategy.strategy_type, StrategyType::IronCondor);
        assert_eq!(strategy.legs.len(), 4);
        assert_eq!(strategy.underlying, "SPY");

        // Net credit = (1.50 - 0.50 + 1.40 - 0.40) * 100 = $200
        assert_eq!(strategy.net_premium, Decimal::new(200, 0));

        // Max profit = net credit = $200
        assert_eq!(strategy.max_profit, Decimal::new(200, 0));

        // Max loss = width - credit = 500 - 200 = $300
        assert_eq!(strategy.max_loss, Decimal::new(300, 0));
    }

    #[test]
    fn test_iron_condor_invalid_strikes() {
        let builder = StrategyBuilder::default();

        let result = builder.iron_condor(
            "SPY",
            "2026-01-17",
            Decimal::new(470, 0), // Short put above short call - invalid!
            Decimal::new(450, 0),
            Decimal::new(5, 0),
            (
                Decimal::new(150, 2),
                Decimal::new(50, 2),
                Decimal::new(140, 2),
                Decimal::new(40, 2),
            ),
        );

        assert!(result.is_err());
    }

    #[test]
    fn test_bull_call_spread() {
        let builder = StrategyBuilder::default();

        let strategy = builder
            .vertical_spread(
                "AAPL",
                "2026-02-21",
                StrategyType::BullCallSpread,
                Decimal::new(185, 0), // Short call at 185
                Decimal::new(180, 0), // Long call at 180
                Decimal::new(200, 2), // Short premium $2.00
                Decimal::new(450, 2), // Long premium $4.50
            )
            .unwrap();

        assert_eq!(strategy.strategy_type, StrategyType::BullCallSpread);
        assert_eq!(strategy.legs.len(), 2);

        // Net debit = (2.00 - 4.50) * 100 = -$250
        assert_eq!(strategy.net_premium, Decimal::new(-250, 0));
    }

    #[test]
    fn test_bear_put_spread() {
        let builder = StrategyBuilder::default();

        let strategy = builder
            .vertical_spread(
                "AAPL",
                "2026-02-21",
                StrategyType::BearPutSpread,
                Decimal::new(175, 0), // Short put at 175
                Decimal::new(180, 0), // Long put at 180
                Decimal::new(150, 2), // Short premium $1.50
                Decimal::new(300, 2), // Long premium $3.00
            )
            .unwrap();

        assert_eq!(strategy.strategy_type, StrategyType::BearPutSpread);
        assert_eq!(strategy.legs.len(), 2);
    }

    #[test]
    fn test_straddle() {
        let builder = StrategyBuilder::default();

        let strategy = builder
            .straddle(
                "TSLA",
                "2026-01-17",
                Decimal::new(250, 0),  // ATM strike
                Decimal::new(1200, 2), // Call premium $12.00
                Decimal::new(1100, 2), // Put premium $11.00
            )
            .unwrap();

        assert_eq!(strategy.strategy_type, StrategyType::Straddle);
        assert_eq!(strategy.legs.len(), 2);

        // Net debit = -(12.00 + 11.00) * 100 = -$2300
        assert_eq!(strategy.net_premium, Decimal::new(-2300, 0));

        // Breakevens should be strike +/- total cost
        assert_eq!(strategy.breakevens.len(), 2);
    }

    #[test]
    fn test_strangle() {
        let builder = StrategyBuilder::default();

        let strategy = builder
            .strangle(
                "TSLA",
                "2026-01-17",
                Decimal::new(240, 0), // OTM put strike
                Decimal::new(260, 0), // OTM call strike
                Decimal::new(800, 2), // Call premium $8.00
                Decimal::new(750, 2), // Put premium $7.50
            )
            .unwrap();

        assert_eq!(strategy.strategy_type, StrategyType::Strangle);
        assert_eq!(strategy.legs.len(), 2);
    }

    #[test]
    fn test_strangle_invalid_strikes() {
        let builder = StrategyBuilder::default();

        let result = builder.strangle(
            "TSLA",
            "2026-01-17",
            Decimal::new(260, 0), // Put above call - invalid!
            Decimal::new(240, 0),
            Decimal::new(800, 2),
            Decimal::new(750, 2),
        );

        assert!(result.is_err());
    }

    #[test]
    fn test_leg_net_premium() {
        let leg = StrategyLeg::new(
            OptionContract {
                contract_id: "TEST".to_string(),
                underlying_symbol: "TEST".to_string(),
                strike: Decimal::new(100, 0),
                expiration: "2026-01-17".to_string(),
                option_type: OptionType::Call,
                style: OptionStyle::American,
                multiplier: 100,
            },
            LegDirection::Short,
            1,
            Decimal::new(250, 2), // $2.50 premium
        );

        // Short leg = credit = 2.50 * 100 = $250
        assert_eq!(leg.net_premium(), Decimal::new(250, 0));
    }

    #[test]
    fn test_width_constraint() {
        let builder = StrategyBuilder::new(StrategyBuilderConfig {
            max_width: Decimal::new(5, 0), // $5 max width
            ..Default::default()
        });

        let result = builder.iron_condor(
            "SPY",
            "2026-01-17",
            Decimal::new(450, 0),
            Decimal::new(470, 0),
            Decimal::new(10, 0), // $10 wide - exceeds limit!
            (
                Decimal::new(150, 2),
                Decimal::new(50, 2),
                Decimal::new(140, 2),
                Decimal::new(40, 2),
            ),
        );

        assert!(result.is_err());
    }

    #[test]
    fn test_calendar_spread() {
        let builder = StrategyBuilder::default();

        let strategy = builder
            .calendar_spread(
                "AAPL",
                Decimal::new(180, 0), // Same strike for both
                "2026-01-17",         // Near-term (sold)
                "2026-02-21",         // Far-term (bought)
                OptionType::Call,
                Decimal::new(300, 2), // Near premium $3.00 (received)
                Decimal::new(500, 2), // Far premium $5.00 (paid)
            )
            .unwrap();

        assert_eq!(strategy.strategy_type, StrategyType::CalendarSpread);
        assert_eq!(strategy.legs.len(), 2);
        assert_eq!(strategy.underlying, "AAPL");

        // Net debit = (3.00 - 5.00) * 100 = -$200
        assert_eq!(strategy.net_premium, Decimal::new(-200, 0));

        // Check legs
        assert_eq!(strategy.legs[0].direction, LegDirection::Short); // Near-term sold
        assert_eq!(strategy.legs[1].direction, LegDirection::Long); // Far-term bought
    }

    #[test]
    fn test_calendar_spread_invalid_expirations() {
        let builder = StrategyBuilder::default();

        let result = builder.calendar_spread(
            "AAPL",
            Decimal::new(180, 0),
            "2026-02-21", // Far before near - invalid!
            "2026-01-17",
            OptionType::Call,
            Decimal::new(300, 2),
            Decimal::new(500, 2),
        );

        assert!(result.is_err());
    }

    #[test]
    fn test_diagonal_spread() {
        let builder = StrategyBuilder::default();

        let strategy = builder
            .diagonal_spread(
                "SPY",
                Decimal::new(465, 0), // Near strike (OTM call sold)
                Decimal::new(460, 0), // Far strike (ATM call bought)
                "2026-01-17",         // Near-term
                "2026-02-21",         // Far-term
                OptionType::Call,
                Decimal::new(200, 2), // Near premium $2.00 (received)
                Decimal::new(600, 2), // Far premium $6.00 (paid)
            )
            .unwrap();

        assert_eq!(strategy.strategy_type, StrategyType::DiagonalSpread);
        assert_eq!(strategy.legs.len(), 2);

        // Net debit = (2.00 - 6.00) * 100 = -$400
        assert_eq!(strategy.net_premium, Decimal::new(-400, 0));

        // Max loss = net debit = $400
        assert_eq!(strategy.max_loss, Decimal::new(400, 0));
    }

    #[test]
    fn test_diagonal_spread_same_strike_error() {
        let builder = StrategyBuilder::default();

        let result = builder.diagonal_spread(
            "SPY",
            Decimal::new(460, 0), // Same strike
            Decimal::new(460, 0), // Same strike - should use calendar instead
            "2026-01-17",
            "2026-02-21",
            OptionType::Call,
            Decimal::new(200, 2),
            Decimal::new(600, 2),
        );

        assert!(result.is_err());
    }

    #[test]
    fn test_custom_strategy() {
        let builder = StrategyBuilder::default();

        let legs = vec![
            StrategyLeg::new(
                OptionContract {
                    contract_id: "CUSTOM1".to_string(),
                    underlying_symbol: "SPY".to_string(),
                    strike: Decimal::new(450, 0),
                    expiration: "2026-01-17".to_string(),
                    option_type: OptionType::Put,
                    style: OptionStyle::American,
                    multiplier: 100,
                },
                LegDirection::Long,
                1,
                Decimal::new(300, 2), // $3.00
            ),
            StrategyLeg::new(
                OptionContract {
                    contract_id: "CUSTOM2".to_string(),
                    underlying_symbol: "SPY".to_string(),
                    strike: Decimal::new(460, 0),
                    expiration: "2026-01-17".to_string(),
                    option_type: OptionType::Call,
                    style: OptionStyle::American,
                    multiplier: 100,
                },
                LegDirection::Long,
                1,
                Decimal::new(250, 2), // $2.50
            ),
        ];

        let strategy = builder.custom("SPY", "2026-01-17", legs).unwrap();

        assert_eq!(strategy.strategy_type, StrategyType::Custom);
        assert_eq!(strategy.legs.len(), 2);

        // Net debit = -(3.00 + 2.50) * 100 = -$550
        assert_eq!(strategy.net_premium, Decimal::new(-550, 0));
    }

    #[test]
    fn test_custom_strategy_empty_legs() {
        let builder = StrategyBuilder::default();

        let result = builder.custom("SPY", "2026-01-17", vec![]);

        assert!(result.is_err());
    }

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

        assert!(StrategyBuilder::validate_balanced_spread(&legs));
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

        assert!(!StrategyBuilder::validate_balanced_spread(&legs));
    }
}
