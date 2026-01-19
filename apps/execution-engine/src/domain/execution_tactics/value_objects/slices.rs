//! Execution Slice Value Objects

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

/// Slice type for TWAP execution.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SliceType {
    /// Use limit orders for each slice.
    Limit,
    /// Use market orders for each slice.
    Market,
}

/// A single TWAP execution slice.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TwapSlice {
    /// Quantity for this slice.
    pub quantity: Decimal,
    /// Slice number (0-indexed).
    pub slice_number: usize,
    /// Scheduled execution time.
    pub scheduled_time: DateTime<Utc>,
}

impl TwapSlice {
    /// Create a new TWAP slice.
    #[must_use]
    pub const fn new(
        quantity: Decimal,
        slice_number: usize,
        scheduled_time: DateTime<Utc>,
    ) -> Self {
        Self {
            quantity,
            slice_number,
            scheduled_time,
        }
    }
}

/// A single VWAP execution slice.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VwapSlice {
    /// Quantity for this slice.
    pub quantity: Decimal,
    /// Participation rate (0.0 to 1.0).
    pub participation_rate: Decimal,
}

impl VwapSlice {
    /// Create a new VWAP slice.
    #[must_use]
    pub const fn new(quantity: Decimal, participation_rate: Decimal) -> Self {
        Self {
            quantity,
            participation_rate,
        }
    }
}

/// A single Iceberg execution slice (the visible "peak").
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IcebergPeak {
    /// Quantity for this peak.
    pub quantity: Decimal,
    /// Peak number.
    pub peak_number: usize,
}

impl IcebergPeak {
    /// Create a new iceberg peak.
    #[must_use]
    pub const fn new(quantity: Decimal, peak_number: usize) -> Self {
        Self {
            quantity,
            peak_number,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slice_type_serde() {
        let slice_type = SliceType::Limit;
        let json = serde_json::to_string(&slice_type).unwrap();
        assert_eq!(json, "\"limit\"");

        let parsed: SliceType = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, SliceType::Limit);
    }

    #[test]
    fn twap_slice_new() {
        let scheduled_time = Utc::now();
        let slice = TwapSlice::new(Decimal::new(100, 0), 0, scheduled_time);

        assert_eq!(slice.quantity, Decimal::new(100, 0));
        assert_eq!(slice.slice_number, 0);
        assert_eq!(slice.scheduled_time, scheduled_time);
    }

    #[test]
    fn vwap_slice_new() {
        let slice = VwapSlice::new(Decimal::new(50, 0), Decimal::new(10, 2));

        assert_eq!(slice.quantity, Decimal::new(50, 0));
        assert_eq!(slice.participation_rate, Decimal::new(10, 2));
    }

    #[test]
    fn iceberg_peak_new() {
        let peak = IcebergPeak::new(Decimal::new(100, 0), 3);

        assert_eq!(peak.quantity, Decimal::new(100, 0));
        assert_eq!(peak.peak_number, 3);
    }
}
