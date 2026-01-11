//! Decimal constants for performance metric calculations.

use rust_decimal::Decimal;

pub const ONE: Decimal = Decimal::ONE;
pub const TWO: Decimal = Decimal::TWO;
pub const HUNDRED: Decimal = Decimal::ONE_HUNDRED;
pub const DAYS_PER_YEAR: Decimal = Decimal::from_parts(365, 0, 0, false, 0);
pub const TRADING_DAYS: Decimal = Decimal::from_parts(252, 0, 0, false, 0);
pub const HOURS_PER_DAY: Decimal = Decimal::from_parts(24, 0, 0, false, 0);
pub const TOLERANCE: Decimal = Decimal::from_parts(1, 0, 0, false, 7); // 0.0000001
