//! Options order validation and OCC symbol parsing.

use crate::models::TimeInForce;

use super::error::AlpacaError;

/// Alpaca-specific options order constraints.
#[derive(Debug, Clone)]
pub struct OptionsOrderValidator;

impl OptionsOrderValidator {
    /// Validate time-in-force for options orders.
    ///
    /// Alpaca only supports DAY time-in-force for options orders.
    /// GTC, IOC, FOK are not allowed for options.
    ///
    /// # Errors
    ///
    /// Returns an error if the time-in-force is not DAY.
    pub fn validate_time_in_force(tif: TimeInForce) -> Result<(), AlpacaError> {
        if tif != TimeInForce::Day {
            return Err(AlpacaError::Api {
                code: "INVALID_TIF_FOR_OPTIONS".to_string(),
                message: format!(
                    "Options orders only support DAY time-in-force. Got: {tif:?}. \
                     GTC, IOC, FOK are not allowed for options on Alpaca."
                ),
            });
        }
        Ok(())
    }

    /// Validate that bracket/OCO orders are not used for options.
    ///
    /// Alpaca only supports bracket/OCO orders for stocks and ETFs.
    ///
    /// # Errors
    ///
    /// Returns an error if trying to use bracket/OCO with options.
    pub fn validate_no_bracket_oco(
        is_options: bool,
        is_bracket_or_oco: bool,
    ) -> Result<(), AlpacaError> {
        if is_options && is_bracket_or_oco {
            return Err(AlpacaError::Api {
                code: "BRACKET_NOT_SUPPORTED_FOR_OPTIONS".to_string(),
                message: "Bracket and OCO orders are only supported for stocks and ETFs. \
                         Options orders cannot use bracket/OCO order types on Alpaca."
                    .to_string(),
            });
        }
        Ok(())
    }

    /// Check if an instrument is an options contract based on symbol format.
    ///
    /// Alpaca options symbols follow OCC format: AAPL240119C00150000
    /// - 1-6 char underlying symbol
    /// - 6 digit date (YYMMDD)
    /// - C or P (call/put)
    /// - 8 digit strike (price * 1000)
    #[must_use]
    pub fn is_options_symbol(symbol: &str) -> bool {
        // Options symbols are typically 15-21 characters
        if symbol.len() < 15 || symbol.len() > 21 {
            return false;
        }

        // Check for C or P indicator in the expected position
        let len = symbol.len();
        let indicator_pos = len - 9;
        let indicator = symbol.chars().nth(indicator_pos);
        matches!(indicator, Some('C' | 'P'))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_options_tif_day_allowed() {
        let result = OptionsOrderValidator::validate_time_in_force(TimeInForce::Day);
        assert!(result.is_ok());
    }

    #[test]
    fn test_options_tif_gtc_rejected() {
        let result = OptionsOrderValidator::validate_time_in_force(TimeInForce::Gtc);
        let Err(err) = result else {
            panic!("expected error for GTC on options");
        };
        if let AlpacaError::Api { code, .. } = err {
            assert_eq!(code, "INVALID_TIF_FOR_OPTIONS");
        } else {
            panic!("Expected Api error");
        }
    }

    #[test]
    fn test_options_tif_ioc_rejected() {
        let result = OptionsOrderValidator::validate_time_in_force(TimeInForce::Ioc);
        assert!(result.is_err());
    }

    #[test]
    fn test_options_tif_fok_rejected() {
        let result = OptionsOrderValidator::validate_time_in_force(TimeInForce::Fok);
        assert!(result.is_err());
    }

    #[test]
    fn test_bracket_allowed_for_equities() {
        let result = OptionsOrderValidator::validate_no_bracket_oco(false, true);
        assert!(result.is_ok());
    }

    #[test]
    fn test_bracket_rejected_for_options() {
        let result = OptionsOrderValidator::validate_no_bracket_oco(true, true);
        let Err(err) = result else {
            panic!("expected error for bracket order on options");
        };
        if let AlpacaError::Api { code, .. } = err {
            assert_eq!(code, "BRACKET_NOT_SUPPORTED_FOR_OPTIONS");
        } else {
            panic!("Expected Api error");
        }
    }

    #[test]
    fn test_is_options_symbol() {
        // Valid options symbols (OCC format)
        assert!(OptionsOrderValidator::is_options_symbol(
            "AAPL240119C00150000"
        ));
        assert!(OptionsOrderValidator::is_options_symbol(
            "AAPL240119P00150000"
        ));
        assert!(OptionsOrderValidator::is_options_symbol(
            "SPY240119C00500000"
        ));
        assert!(OptionsOrderValidator::is_options_symbol(
            "GOOGL240119P02800000"
        ));

        // Invalid - too short (equities)
        assert!(!OptionsOrderValidator::is_options_symbol("AAPL"));
        assert!(!OptionsOrderValidator::is_options_symbol("SPY"));
        assert!(!OptionsOrderValidator::is_options_symbol("GOOGL"));

        // Invalid - no C or P indicator
        assert!(!OptionsOrderValidator::is_options_symbol(
            "AAPL240119X00150000"
        ));
    }
}
