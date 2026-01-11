//! Formatting utilities for performance metrics display.

use rust_decimal::Decimal;

use super::constants::HUNDRED;

/// Format a decimal as percentage string.
#[must_use]
pub fn format_pct(value: Decimal) -> String {
    format!("{:.2}%", value * HUNDRED)
}

/// Format a decimal with 2 decimal places.
#[must_use]
pub fn format_decimal(value: Decimal) -> String {
    format!("{value:.2}")
}

/// Format an optional decimal ratio.
#[must_use]
pub fn format_ratio(value: Option<Decimal>) -> String {
    value.map_or_else(|| "N/A".to_string(), |v| format!("{v:.2}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_helpers() {
        assert_eq!(format_pct(Decimal::new(1523, 4)), "15.23%"); // 0.1523
        // Decimal::new(123_456, 3) = 123.456, formatted as 123.45 (truncation)
        assert_eq!(format_decimal(Decimal::new(123_456, 3)), "123.45");
        assert_eq!(format_ratio(Some(Decimal::new(235, 2))), "2.35"); // 2.35
        assert_eq!(format_ratio(None), "N/A");
    }
}
