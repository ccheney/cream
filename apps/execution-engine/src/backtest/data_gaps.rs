//! Data gap detection and handling for backtest simulation.
//!
//! Provides validation to detect and handle missing or incomplete market data
//! during backtest simulation:
//!
//! - Missing candles for requested timestamp
//! - Incomplete OHLC data (null/zero values)
//! - Missing bid/ask spread data (required for SPREAD_BASED slippage)
//! - Missing volume data (required for VOLUME_IMPACT slippage)
//!
//! # Gap Handling Strategies
//!
//! When a data gap is detected, the simulation can:
//! 1. **Reject** - Reject the order with a clear error
//! 2. **Skip** - Skip the candle and continue
//! 3. **Interpolate** - Use previous/next values (not recommended)

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tracing::{debug, warn};

use super::Candle;
use super::config::SlippageModel;

/// Type of data gap detected.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DataGapType {
    /// Candle entirely missing for timestamp.
    MissingCandle,
    /// Open price is zero or invalid.
    InvalidOpen,
    /// High price is zero or invalid.
    InvalidHigh,
    /// Low price is zero or invalid.
    InvalidLow,
    /// Close price is zero or invalid.
    InvalidClose,
    /// Volume is zero or missing (required for VOLUME_IMPACT).
    MissingVolume,
    /// Bid price missing (required for SPREAD_BASED).
    MissingBid,
    /// Ask price missing (required for SPREAD_BASED).
    MissingAsk,
    /// Spread is invalid (ask <= bid).
    InvalidSpread,
    /// High/low relationship invalid (high < low).
    InvalidHighLow,
    /// Open/close outside high/low range.
    OhlcRangeInvalid,
}

impl std::fmt::Display for DataGapType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::MissingCandle => write!(f, "MISSING_CANDLE"),
            Self::InvalidOpen => write!(f, "INVALID_OPEN"),
            Self::InvalidHigh => write!(f, "INVALID_HIGH"),
            Self::InvalidLow => write!(f, "INVALID_LOW"),
            Self::InvalidClose => write!(f, "INVALID_CLOSE"),
            Self::MissingVolume => write!(f, "MISSING_VOLUME"),
            Self::MissingBid => write!(f, "MISSING_BID"),
            Self::MissingAsk => write!(f, "MISSING_ASK"),
            Self::InvalidSpread => write!(f, "INVALID_SPREAD"),
            Self::InvalidHighLow => write!(f, "INVALID_HIGH_LOW"),
            Self::OhlcRangeInvalid => write!(f, "OHLC_RANGE_INVALID"),
        }
    }
}

/// Error returned when data gap is detected.
#[derive(Debug, Error, Clone, Serialize, Deserialize)]
#[error("Data gap detected: {gap_type} for {symbol} at {timestamp}")]
pub struct DataGapError {
    /// Type of gap.
    pub gap_type: DataGapType,
    /// Symbol affected.
    pub symbol: String,
    /// Timestamp of gap.
    pub timestamp: String,
    /// Additional details.
    pub details: Option<String>,
}

impl DataGapError {
    /// Create a new data gap error.
    pub fn new(
        gap_type: DataGapType,
        symbol: impl Into<String>,
        timestamp: impl Into<String>,
    ) -> Self {
        Self {
            gap_type,
            symbol: symbol.into(),
            timestamp: timestamp.into(),
            details: None,
        }
    }

    /// Add details to the error.
    #[must_use]
    pub fn with_details(mut self, details: impl Into<String>) -> Self {
        self.details = Some(details.into());
        self
    }
}

/// Result of candle data validation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GapValidationResult {
    /// Whether the candle passed validation.
    pub valid: bool,
    /// List of gaps detected (empty if valid).
    pub gaps: Vec<DataGapError>,
    /// Number of warnings (non-fatal issues).
    pub warnings: u32,
}

impl GapValidationResult {
    /// Create a valid result.
    pub fn valid() -> Self {
        Self {
            valid: true,
            gaps: Vec::new(),
            warnings: 0,
        }
    }

    /// Create an invalid result with a single gap.
    pub fn invalid(error: DataGapError) -> Self {
        Self {
            valid: false,
            gaps: vec![error],
            warnings: 0,
        }
    }

    /// Add a gap to the result.
    pub fn add_gap(&mut self, error: DataGapError) {
        self.valid = false;
        self.gaps.push(error);
    }

    /// Add a warning (non-fatal issue).
    pub fn add_warning(&mut self) {
        self.warnings += 1;
    }

    /// Check if result is valid.
    #[must_use]
    pub fn is_valid(&self) -> bool {
        self.valid
    }

    /// Get first error if any.
    #[must_use]
    pub fn first_error(&self) -> Option<&DataGapError> {
        self.gaps.first()
    }
}

/// Validate candle OHLC data for completeness and consistency.
///
/// Checks:
/// - All OHLC values are positive
/// - High >= Low
/// - Open and Close are within High/Low range
///
/// # Arguments
/// * `candle` - Candle to validate
/// * `symbol` - Symbol for error reporting
/// * `timestamp` - Timestamp for error reporting
///
/// # Returns
/// Validation result with any detected gaps.
pub fn validate_candle_data(candle: &Candle, symbol: &str, timestamp: &str) -> GapValidationResult {
    let mut result = GapValidationResult::valid();

    // Check for zero/negative prices
    if candle.open <= Decimal::ZERO {
        result.add_gap(
            DataGapError::new(DataGapType::InvalidOpen, symbol, timestamp)
                .with_details(format!("Open price is {}", candle.open)),
        );
    }

    if candle.high <= Decimal::ZERO {
        result.add_gap(
            DataGapError::new(DataGapType::InvalidHigh, symbol, timestamp)
                .with_details(format!("High price is {}", candle.high)),
        );
    }

    if candle.low <= Decimal::ZERO {
        result.add_gap(
            DataGapError::new(DataGapType::InvalidLow, symbol, timestamp)
                .with_details(format!("Low price is {}", candle.low)),
        );
    }

    if candle.close <= Decimal::ZERO {
        result.add_gap(
            DataGapError::new(DataGapType::InvalidClose, symbol, timestamp)
                .with_details(format!("Close price is {}", candle.close)),
        );
    }

    // If any OHLC is invalid, skip further checks
    if !result.is_valid() {
        return result;
    }

    // Check high >= low
    if candle.high < candle.low {
        result.add_gap(
            DataGapError::new(DataGapType::InvalidHighLow, symbol, timestamp)
                .with_details(format!("High ({}) < Low ({})", candle.high, candle.low)),
        );
        return result;
    }

    // Check open/close within range
    if candle.open < candle.low || candle.open > candle.high {
        result.add_gap(
            DataGapError::new(DataGapType::OhlcRangeInvalid, symbol, timestamp).with_details(
                format!(
                    "Open ({}) outside range [{}, {}]",
                    candle.open, candle.low, candle.high
                ),
            ),
        );
    }

    if candle.close < candle.low || candle.close > candle.high {
        result.add_gap(
            DataGapError::new(DataGapType::OhlcRangeInvalid, symbol, timestamp).with_details(
                format!(
                    "Close ({}) outside range [{}, {}]",
                    candle.close, candle.low, candle.high
                ),
            ),
        );
    }

    // Log validation result
    if result.is_valid() {
        debug!(
            symbol = symbol,
            timestamp = timestamp,
            "Candle validation passed"
        );
    } else {
        warn!(
            symbol = symbol,
            timestamp = timestamp,
            gaps = ?result.gaps,
            "Candle validation failed"
        );
    }

    result
}

/// Validate volume data availability.
///
/// Volume is required for VOLUME_IMPACT slippage model.
///
/// # Arguments
/// * `volume` - Volume value
/// * `slippage_model` - Active slippage model
/// * `symbol` - Symbol for error reporting
/// * `timestamp` - Timestamp for error reporting
///
/// # Returns
/// Validation result.
pub fn validate_volume_data(
    volume: Decimal,
    slippage_model: SlippageModel,
    symbol: &str,
    timestamp: &str,
) -> GapValidationResult {
    // Volume only required for VOLUME_IMPACT
    if slippage_model != SlippageModel::VolumeImpact {
        return GapValidationResult::valid();
    }

    if volume <= Decimal::ZERO {
        let error =
            DataGapError::new(DataGapType::MissingVolume, symbol, timestamp).with_details(format!(
                "Volume ({}) required for VOLUME_IMPACT slippage model",
                volume
            ));

        warn!(
            symbol = symbol,
            timestamp = timestamp,
            volume = %volume,
            "Missing volume data for VOLUME_IMPACT model"
        );

        return GapValidationResult::invalid(error);
    }

    GapValidationResult::valid()
}

/// Validate bid/ask spread data availability.
///
/// Bid/ask data is required for SPREAD_BASED slippage model.
///
/// # Arguments
/// * `bid` - Bid price (optional)
/// * `ask` - Ask price (optional)
/// * `slippage_model` - Active slippage model
/// * `symbol` - Symbol for error reporting
/// * `timestamp` - Timestamp for error reporting
///
/// # Returns
/// Validation result.
pub fn validate_spread_data(
    bid: Option<Decimal>,
    ask: Option<Decimal>,
    slippage_model: SlippageModel,
    symbol: &str,
    timestamp: &str,
) -> GapValidationResult {
    // Spread only required for SPREAD_BASED
    if slippage_model != SlippageModel::SpreadBased {
        return GapValidationResult::valid();
    }

    let mut result = GapValidationResult::valid();

    match (bid, ask) {
        (None, _) => {
            result.add_gap(
                DataGapError::new(DataGapType::MissingBid, symbol, timestamp)
                    .with_details("Bid required for SPREAD_BASED slippage model"),
            );
        }
        (_, None) => {
            result.add_gap(
                DataGapError::new(DataGapType::MissingAsk, symbol, timestamp)
                    .with_details("Ask required for SPREAD_BASED slippage model"),
            );
        }
        (Some(b), Some(a)) => {
            // Check spread validity
            if a <= b {
                result.add_gap(
                    DataGapError::new(DataGapType::InvalidSpread, symbol, timestamp)
                        .with_details(format!("Ask ({}) <= Bid ({})", a, b)),
                );
            }
        }
    }

    if !result.is_valid() {
        warn!(
            symbol = symbol,
            timestamp = timestamp,
            bid = ?bid,
            ask = ?ask,
            "Invalid spread data for SPREAD_BASED model"
        );
    }

    result
}

/// Comprehensive validation for order execution.
///
/// Validates all data required for order execution based on slippage model.
///
/// # Arguments
/// * `candle` - Candle data
/// * `volume` - Volume data
/// * `bid` - Bid price (optional)
/// * `ask` - Ask price (optional)
/// * `slippage_model` - Active slippage model
/// * `symbol` - Symbol for error reporting
/// * `timestamp` - Timestamp for error reporting
///
/// # Returns
/// Validation result with all detected gaps.
pub fn validate_order_data(
    candle: &Candle,
    volume: Decimal,
    bid: Option<Decimal>,
    ask: Option<Decimal>,
    slippage_model: SlippageModel,
    symbol: &str,
    timestamp: &str,
) -> GapValidationResult {
    // Start with candle validation
    let mut result = validate_candle_data(candle, symbol, timestamp);

    // Add volume validation if needed
    let volume_result = validate_volume_data(volume, slippage_model, symbol, timestamp);
    for gap in volume_result.gaps {
        result.add_gap(gap);
    }

    // Add spread validation if needed
    let spread_result = validate_spread_data(bid, ask, slippage_model, symbol, timestamp);
    for gap in spread_result.gaps {
        result.add_gap(gap);
    }

    result
}

/// Data gap statistics for a backtest run.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct GapStatistics {
    /// Total candles processed.
    pub total_candles: u64,
    /// Number of gaps detected.
    pub gaps_detected: u64,
    /// Gaps by type.
    pub by_type: std::collections::HashMap<String, u64>,
    /// Gaps by symbol.
    pub by_symbol: std::collections::HashMap<String, u64>,
    /// Percentage of data with gaps.
    pub gap_percentage: f64,
}

impl GapStatistics {
    /// Create new statistics.
    pub fn new() -> Self {
        Self::default()
    }

    /// Record a processed candle.
    pub fn record_candle(&mut self) {
        self.total_candles += 1;
    }

    /// Record a detected gap.
    pub fn record_gap(&mut self, gap: &DataGapError) {
        self.gaps_detected += 1;

        *self.by_type.entry(gap.gap_type.to_string()).or_insert(0) += 1;

        *self.by_symbol.entry(gap.symbol.clone()).or_insert(0) += 1;

        // Update percentage
        if self.total_candles > 0 {
            self.gap_percentage = (self.gaps_detected as f64 / self.total_candles as f64) * 100.0;
        }
    }

    /// Get summary string.
    #[must_use]
    pub fn summary(&self) -> String {
        format!(
            "Gaps: {}/{} ({:.2}%)",
            self.gaps_detected, self.total_candles, self.gap_percentage
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_valid_candle() -> Candle {
        Candle::new(
            Decimal::new(10000, 2),   // open: 100.00
            Decimal::new(10100, 2),   // high: 101.00
            Decimal::new(9900, 2),    // low: 99.00
            Decimal::new(10050, 2),   // close: 100.50
            Decimal::new(100_000, 0), // volume: 100,000
        )
    }

    #[test]
    fn test_valid_candle_passes() {
        let candle = create_valid_candle();
        let result = validate_candle_data(&candle, "AAPL", "2026-01-05T10:00:00Z");

        assert!(result.is_valid());
        assert!(result.gaps.is_empty());
    }

    #[test]
    fn test_zero_open_fails() {
        let candle = Candle::new(
            Decimal::ZERO,
            Decimal::new(10100, 2),
            Decimal::new(9900, 2),
            Decimal::new(10050, 2),
            Decimal::new(100_000, 0),
        );
        let result = validate_candle_data(&candle, "AAPL", "2026-01-05T10:00:00Z");

        assert!(!result.is_valid());
        assert_eq!(result.gaps[0].gap_type, DataGapType::InvalidOpen);
    }

    #[test]
    fn test_high_less_than_low_fails() {
        let candle = Candle::new(
            Decimal::new(10000, 2), // open
            Decimal::new(9800, 2),  // high (invalid - less than low)
            Decimal::new(9900, 2),  // low
            Decimal::new(10050, 2), // close
            Decimal::new(100_000, 0),
        );
        let result = validate_candle_data(&candle, "AAPL", "2026-01-05T10:00:00Z");

        assert!(!result.is_valid());
        assert_eq!(result.gaps[0].gap_type, DataGapType::InvalidHighLow);
    }

    #[test]
    fn test_open_outside_range_fails() {
        let candle = Candle::new(
            Decimal::new(11000, 2), // open (invalid - above high)
            Decimal::new(10100, 2), // high
            Decimal::new(9900, 2),  // low
            Decimal::new(10050, 2), // close
            Decimal::new(100_000, 0),
        );
        let result = validate_candle_data(&candle, "AAPL", "2026-01-05T10:00:00Z");

        assert!(!result.is_valid());
        assert_eq!(result.gaps[0].gap_type, DataGapType::OhlcRangeInvalid);
    }

    #[test]
    fn test_volume_required_for_volume_impact() {
        let result = validate_volume_data(
            Decimal::ZERO,
            SlippageModel::VolumeImpact,
            "AAPL",
            "2026-01-05T10:00:00Z",
        );

        assert!(!result.is_valid());
        assert_eq!(result.gaps[0].gap_type, DataGapType::MissingVolume);
    }

    #[test]
    fn test_volume_not_required_for_fixed_bps() {
        let result = validate_volume_data(
            Decimal::ZERO,
            SlippageModel::FixedBps,
            "AAPL",
            "2026-01-05T10:00:00Z",
        );

        assert!(result.is_valid());
    }

    #[test]
    fn test_spread_required_for_spread_based() {
        let result = validate_spread_data(
            None,
            Some(Decimal::new(10010, 2)),
            SlippageModel::SpreadBased,
            "AAPL",
            "2026-01-05T10:00:00Z",
        );

        assert!(!result.is_valid());
        assert_eq!(result.gaps[0].gap_type, DataGapType::MissingBid);
    }

    #[test]
    fn test_invalid_spread_fails() {
        let result = validate_spread_data(
            Some(Decimal::new(10010, 2)), // bid
            Some(Decimal::new(10000, 2)), // ask (invalid - less than bid)
            SlippageModel::SpreadBased,
            "AAPL",
            "2026-01-05T10:00:00Z",
        );

        assert!(!result.is_valid());
        assert_eq!(result.gaps[0].gap_type, DataGapType::InvalidSpread);
    }

    #[test]
    fn test_valid_spread_passes() {
        let result = validate_spread_data(
            Some(Decimal::new(10000, 2)), // bid
            Some(Decimal::new(10010, 2)), // ask
            SlippageModel::SpreadBased,
            "AAPL",
            "2026-01-05T10:00:00Z",
        );

        assert!(result.is_valid());
    }

    #[test]
    fn test_comprehensive_validation() {
        let candle = create_valid_candle();
        let result = validate_order_data(
            &candle,
            Decimal::new(100_000, 0),
            Some(Decimal::new(10000, 2)),
            Some(Decimal::new(10010, 2)),
            SlippageModel::SpreadBased,
            "AAPL",
            "2026-01-05T10:00:00Z",
        );

        assert!(result.is_valid());
    }

    #[test]
    fn test_gap_statistics() {
        let mut stats = GapStatistics::new();

        stats.record_candle();
        stats.record_candle();
        stats.record_candle();

        let error = DataGapError::new(DataGapType::MissingVolume, "AAPL", "2026-01-05T10:00:00Z");
        stats.record_gap(&error);

        assert_eq!(stats.total_candles, 3);
        assert_eq!(stats.gaps_detected, 1);
        assert!((stats.gap_percentage - 33.33).abs() < 1.0);
        assert_eq!(*stats.by_symbol.get("AAPL").unwrap(), 1);
    }

    #[test]
    fn test_data_gap_error_display() {
        let error = DataGapError::new(DataGapType::MissingCandle, "AAPL", "2026-01-05T10:00:00Z");

        let display = format!("{}", error);
        assert!(display.contains("MISSING_CANDLE"));
        assert!(display.contains("AAPL"));
    }

    #[test]
    fn test_gap_type_display() {
        assert_eq!(format!("{}", DataGapType::MissingCandle), "MISSING_CANDLE");
        assert_eq!(format!("{}", DataGapType::InvalidOpen), "INVALID_OPEN");
        assert_eq!(format!("{}", DataGapType::MissingVolume), "MISSING_VOLUME");
    }
}
