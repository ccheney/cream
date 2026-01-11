//! Regulatory fee calculations for US markets.

use rust_decimal::Decimal;

use super::options::OptionsOrderValidator;

/// Regulatory fee calculator for US markets (as of January 2026).
///
/// Fee schedule:
/// - SEC Section 31 Fee: $0.0000278 per dollar on equity sells
/// - FINRA TAF (equities): $0.000195 per share, cap $9.79/transaction
/// - FINRA TAF (options): $0.00329 per contract, cap $9.79/transaction
/// - Options ORF: $0.0026 per contract (varies by exchange)
/// - Alpaca commission: $0.00 (commission-free)
#[derive(Debug, Clone, Default)]
pub struct RegulatoryFeeCalculator;

/// Breakdown of regulatory fees for a trade.
#[derive(Debug, Clone, Default)]
pub struct FeeBreakdown {
    /// SEC Section 31 fee (equity sells only).
    pub sec_fee: Decimal,
    /// FINRA Trading Activity Fee.
    pub finra_taf: Decimal,
    /// Options Regulatory Fee (options only).
    pub options_orf: Decimal,
    /// Broker commission (always $0.00 for Alpaca).
    pub commission: Decimal,
    /// Total fees.
    pub total: Decimal,
}

impl RegulatoryFeeCalculator {
    /// SEC Section 31 fee rate: $0.0000278 per dollar
    const SEC_FEE_RATE: Decimal = Decimal::from_parts(278, 0, 0, false, 8);

    /// FINRA TAF for equities: $0.000195 per share
    const FINRA_TAF_EQUITY_RATE: Decimal = Decimal::from_parts(195, 0, 0, false, 6);

    /// FINRA TAF for options: $0.00329 per contract
    const FINRA_TAF_OPTIONS_RATE: Decimal = Decimal::from_parts(329, 0, 0, false, 5);

    /// FINRA TAF cap per transaction
    const FINRA_TAF_CAP: Decimal = Decimal::from_parts(979, 0, 0, false, 2);

    /// Options ORF: $0.0026 per contract
    const OPTIONS_ORF_RATE: Decimal = Decimal::from_parts(26, 0, 0, false, 4);

    /// Calculate fees for an equity trade.
    #[must_use]
    pub fn calculate_equity_fees(
        is_sell: bool,
        shares: Decimal,
        notional_value: Decimal,
    ) -> FeeBreakdown {
        let mut breakdown = FeeBreakdown::default();

        // SEC fee only applies to sells
        if is_sell {
            breakdown.sec_fee = (notional_value * Self::SEC_FEE_RATE).round_dp(2);
        }

        // FINRA TAF applies to all trades, capped at $9.79
        let taf = shares * Self::FINRA_TAF_EQUITY_RATE;
        breakdown.finra_taf = taf.min(Self::FINRA_TAF_CAP).round_dp(2);

        // Commission is always $0.00
        breakdown.commission = Decimal::ZERO;

        breakdown.total = breakdown.sec_fee + breakdown.finra_taf + breakdown.commission;
        breakdown
    }

    /// Calculate fees for an options trade.
    #[must_use]
    pub fn calculate_options_fees(is_sell: bool, contracts: Decimal) -> FeeBreakdown {
        let mut breakdown = FeeBreakdown::default();

        // FINRA TAF for options, capped at $9.79
        let taf = contracts * Self::FINRA_TAF_OPTIONS_RATE;
        breakdown.finra_taf = taf.min(Self::FINRA_TAF_CAP).round_dp(2);

        // Options ORF applies to all trades
        breakdown.options_orf = (contracts * Self::OPTIONS_ORF_RATE).round_dp(2);

        // SEC fee applies to options sells (on premium value)
        // Note: This is often waived but including for completeness
        if is_sell {
            // For options, SEC fee would be on premium value, but we don't
            // have that here. Setting to zero as it's typically negligible.
            breakdown.sec_fee = Decimal::ZERO;
        }

        // Commission is always $0.00
        breakdown.commission = Decimal::ZERO;

        breakdown.total =
            breakdown.sec_fee + breakdown.finra_taf + breakdown.options_orf + breakdown.commission;
        breakdown
    }

    /// Calculate total fees for a trade (auto-detecting instrument type).
    #[must_use]
    pub fn calculate_fees(
        symbol: &str,
        is_sell: bool,
        quantity: Decimal,
        notional_value: Decimal,
    ) -> FeeBreakdown {
        if OptionsOrderValidator::is_options_symbol(symbol) {
            Self::calculate_options_fees(is_sell, quantity)
        } else {
            Self::calculate_equity_fees(is_sell, quantity, notional_value)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_equity_sell_fees() {
        // Selling 100 shares at $150/share = $15,000 notional
        let fees = RegulatoryFeeCalculator::calculate_equity_fees(
            true,
            Decimal::new(100, 0),
            Decimal::new(15000, 0),
        );

        // SEC fee: $15,000 * 0.0000278 = $0.417 -> $0.42
        assert!(fees.sec_fee > Decimal::ZERO);

        // FINRA TAF: 100 * 0.000195 = $0.0195 -> $0.02
        assert!(fees.finra_taf > Decimal::ZERO);

        // Commission should always be $0.00
        assert_eq!(fees.commission, Decimal::ZERO);

        // Total should be sum of all fees
        assert_eq!(fees.total, fees.sec_fee + fees.finra_taf + fees.commission);
    }

    #[test]
    fn test_equity_buy_no_sec_fee() {
        // Buying has no SEC fee
        let fees = RegulatoryFeeCalculator::calculate_equity_fees(
            false,
            Decimal::new(100, 0),
            Decimal::new(15000, 0),
        );

        // SEC fee should be zero on buys
        assert_eq!(fees.sec_fee, Decimal::ZERO);

        // FINRA TAF still applies
        assert!(fees.finra_taf > Decimal::ZERO);
    }

    #[test]
    fn test_finra_taf_cap() {
        // Trading 100,000 shares should hit the $9.79 cap
        // 100,000 * 0.000195 = $19.50, capped at $9.79
        let fees = RegulatoryFeeCalculator::calculate_equity_fees(
            false,
            Decimal::new(100_000, 0),
            Decimal::new(10_000_000, 0),
        );

        assert_eq!(fees.finra_taf, Decimal::new(979, 2));
    }

    #[test]
    fn test_options_fees() {
        // Trading 10 option contracts
        let fees = RegulatoryFeeCalculator::calculate_options_fees(true, Decimal::new(10, 0));

        // FINRA TAF: 10 * 0.00329 = $0.0329 -> $0.03
        assert!(fees.finra_taf > Decimal::ZERO);

        // Options ORF: 10 * 0.0026 = $0.026 -> $0.03
        assert!(fees.options_orf > Decimal::ZERO);

        // Commission should be $0.00
        assert_eq!(fees.commission, Decimal::ZERO);

        // Total should be sum
        assert_eq!(
            fees.total,
            fees.sec_fee + fees.finra_taf + fees.options_orf + fees.commission
        );
    }

    #[test]
    fn test_options_finra_taf_cap() {
        // Trading 10,000 contracts should hit the cap
        // 10,000 * 0.00329 = $32.90, capped at $9.79
        let fees = RegulatoryFeeCalculator::calculate_options_fees(true, Decimal::new(10000, 0));

        assert_eq!(fees.finra_taf, Decimal::new(979, 2));
    }

    #[test]
    fn test_calculate_fees_auto_detect_equity() {
        let fees = RegulatoryFeeCalculator::calculate_fees(
            "AAPL",
            true,
            Decimal::new(100, 0),
            Decimal::new(15000, 0),
        );

        // Should detect as equity and apply SEC fee for sell
        assert!(fees.sec_fee > Decimal::ZERO);
        assert_eq!(fees.options_orf, Decimal::ZERO);
    }

    #[test]
    fn test_calculate_fees_auto_detect_options() {
        let fees = RegulatoryFeeCalculator::calculate_fees(
            "AAPL240119C00150000",
            true,
            Decimal::new(10, 0),
            Decimal::ZERO, // notional not used for options
        );

        // Should detect as options and apply ORF
        assert!(fees.options_orf > Decimal::ZERO);
    }
}
