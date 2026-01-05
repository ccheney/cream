//! Commission calculation for backtest simulation.

use rust_decimal::Decimal;

use super::config::CommissionConfig;
use crate::models::OrderSide;

/// Instrument type for commission calculation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InstrumentType {
    /// Equity (stock).
    Equity,
    /// Option contract.
    Option,
}

/// Calculate total commission for a fill.
///
/// # Arguments
/// * `config` - Commission configuration
/// * `instrument_type` - Type of instrument
/// * `side` - Order side (buy or sell)
/// * `quantity` - Number of shares or contracts
/// * `price` - Fill price per share/contract
///
/// # Returns
/// Total commission including base commission and regulatory fees.
pub fn calculate_commission(
    config: &CommissionConfig,
    instrument_type: InstrumentType,
    side: OrderSide,
    quantity: Decimal,
    price: Decimal,
) -> Decimal {
    let base = calculate_base_commission(config, instrument_type, quantity);
    let fees = calculate_regulatory_fees(config, instrument_type, side, quantity, price);

    let total = base + fees;

    // Apply minimum
    total.max(config.per_unit.minimum)
}

/// Calculate base commission before regulatory fees.
fn calculate_base_commission(
    config: &CommissionConfig,
    instrument_type: InstrumentType,
    quantity: Decimal,
) -> Decimal {
    match instrument_type {
        InstrumentType::Equity => quantity * config.per_unit.equity_per_share,
        InstrumentType::Option => quantity * config.per_unit.option_per_contract,
    }
}

/// Calculate regulatory fees (SEC, TAF, ORF).
fn calculate_regulatory_fees(
    config: &CommissionConfig,
    instrument_type: InstrumentType,
    side: OrderSide,
    quantity: Decimal,
    price: Decimal,
) -> Decimal {
    let mut fees = Decimal::ZERO;

    match instrument_type {
        InstrumentType::Equity => {
            // TAF fee only on sells
            if side == OrderSide::Sell {
                let taf = (quantity * config.fees.taf_fee_per_share)
                    .min(config.fees.taf_max_per_trade);
                fees += taf;

                // SEC fee only on sells (based on notional value)
                let notional = quantity * price;
                let sec_fee = notional * config.fees.sec_fee_per_dollar;
                fees += sec_fee;
            }
        }
        InstrumentType::Option => {
            // TAF fee only on sells
            if side == OrderSide::Sell {
                let taf = (quantity * config.fees.taf_fee_per_contract)
                    .min(config.fees.taf_max_per_trade);
                fees += taf;
            }

            // ORF fee on both buys and sells
            let orf = quantity * config.fees.orf_fee_per_contract;
            fees += orf;
        }
    }

    fees
}

/// Calculate commission for a multi-leg options order.
///
/// Each leg is charged separately based on its side and quantity.
pub fn calculate_multi_leg_commission(
    config: &CommissionConfig,
    legs: &[(OrderSide, Decimal, Decimal)], // (side, quantity, price)
) -> Decimal {
    legs.iter()
        .map(|(side, qty, price)| {
            calculate_commission(config, InstrumentType::Option, *side, *qty, *price)
        })
        .sum()
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::config::*;

    fn default_config() -> CommissionConfig {
        CommissionConfig::default()
    }

    #[test]
    fn test_equity_buy_commission_zero() {
        let config = default_config();

        // Commission-free broker for equities
        let commission = calculate_commission(
            &config,
            InstrumentType::Equity,
            OrderSide::Buy,
            Decimal::new(100, 0),
            Decimal::new(15000, 2), // $150.00
        );

        // Buy has no fees (no TAF, no SEC on buys)
        assert_eq!(commission, Decimal::ZERO);
    }

    #[test]
    fn test_equity_sell_commission_includes_fees() {
        let config = default_config();

        // 100 shares at $150.00 = $15,000 notional
        let commission = calculate_commission(
            &config,
            InstrumentType::Equity,
            OrderSide::Sell,
            Decimal::new(100, 0),
            Decimal::new(15000, 2),
        );

        // TAF: 100 * 0.000195 = $0.0195
        // SEC: 15000 * 0.0000278 = $0.417
        // Total: ~$0.4365
        assert!(commission > Decimal::ZERO);
        assert!(commission < Decimal::ONE);
    }

    #[test]
    fn test_option_buy_commission() {
        let config = default_config();

        // 10 contracts
        let commission = calculate_commission(
            &config,
            InstrumentType::Option,
            OrderSide::Buy,
            Decimal::new(10, 0),
            Decimal::new(250, 2), // $2.50 per contract
        );

        // Base: 10 * $0.65 = $6.50
        // ORF: 10 * $0.0026 = $0.026
        // Total: ~$6.526
        assert!(commission > Decimal::new(6, 0));
        assert!(commission < Decimal::new(7, 0));
    }

    #[test]
    fn test_option_sell_commission() {
        let config = default_config();

        // 10 contracts
        let commission = calculate_commission(
            &config,
            InstrumentType::Option,
            OrderSide::Sell,
            Decimal::new(10, 0),
            Decimal::new(250, 2),
        );

        // Base: 10 * $0.65 = $6.50
        // TAF: 10 * $0.00329 = $0.0329
        // ORF: 10 * $0.0026 = $0.026
        // Total: ~$6.5589
        assert!(commission > Decimal::new(6, 0));
        assert!(commission < Decimal::new(7, 0));
    }

    #[test]
    fn test_taf_cap_applied() {
        let config = default_config();

        // Large order: 1,000,000 shares
        let commission = calculate_commission(
            &config,
            InstrumentType::Equity,
            OrderSide::Sell,
            Decimal::new(1_000_000, 0),
            Decimal::new(100, 2), // $1.00 per share
        );

        // TAF without cap: 1,000,000 * 0.000195 = $195
        // TAF with cap: $9.79
        // SEC: 1,000,000 * 0.0000278 = $27.80
        // Total should be less than $200 (capped)
        assert!(commission < Decimal::new(50, 0));
    }

    #[test]
    fn test_multi_leg_commission() {
        let config = default_config();

        // Bull call spread: buy 1 call, sell 1 call
        let legs = vec![
            (OrderSide::Buy, Decimal::new(1, 0), Decimal::new(500, 2)),   // Buy @ $5.00
            (OrderSide::Sell, Decimal::new(1, 0), Decimal::new(200, 2)),  // Sell @ $2.00
        ];

        let commission = calculate_multi_leg_commission(&config, &legs);

        // Buy leg: $0.65 + ORF
        // Sell leg: $0.65 + TAF + ORF
        // Total: ~$1.30 + fees
        assert!(commission > Decimal::ONE);
        assert!(commission < Decimal::TWO);
    }

    #[test]
    fn test_minimum_commission() {
        let mut config = default_config();
        config.per_unit.minimum = Decimal::ONE; // $1.00 minimum

        // Small trade
        let commission = calculate_commission(
            &config,
            InstrumentType::Equity,
            OrderSide::Buy,
            Decimal::new(1, 0),  // 1 share
            Decimal::new(100, 2), // $1.00
        );

        assert_eq!(commission, Decimal::ONE);
    }
}
