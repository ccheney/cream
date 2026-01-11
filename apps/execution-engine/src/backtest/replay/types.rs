//! Core types for the replay engine.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::backtest::Candle;

/// Data source type for replay.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DataSourceType {
    /// Local Parquet file.
    Parquet(PathBuf),
    /// Local Arrow IPC file.
    ArrowIpc(PathBuf),
    /// Arrow Flight RPC endpoint.
    ArrowFlight {
        /// gRPC endpoint URL.
        endpoint: String,
    },
    /// REST API.
    RestApi {
        /// API base URL.
        base_url: String,
    },
    /// In-memory data (for testing).
    InMemory,
}

/// Policy for handling missing data (gaps in candles).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum MissingDataPolicy {
    /// Skip gaps and continue.
    #[default]
    Skip,
    /// Forward-fill with previous candle's close.
    ForwardFill,
    /// Error on gaps.
    Error,
}

/// Configuration for the replay engine.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplayConfig {
    /// Data source type.
    pub source: DataSourceType,
    /// Start date (inclusive, ISO 8601).
    pub start_date: String,
    /// End date (exclusive, ISO 8601).
    pub end_date: String,
    /// Instruments to replay.
    pub instruments: Vec<String>,
    /// How to handle missing data.
    pub missing_data_policy: MissingDataPolicy,
    /// Whether to track progress.
    pub track_progress: bool,
}

impl Default for ReplayConfig {
    fn default() -> Self {
        Self {
            source: DataSourceType::InMemory,
            start_date: "2024-01-01T00:00:00Z".to_string(),
            end_date: "2024-12-31T23:59:59Z".to_string(),
            instruments: Vec::new(),
            missing_data_policy: MissingDataPolicy::Skip,
            track_progress: true,
        }
    }
}

/// A candle event with metadata for replay.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CandleEvent {
    /// Instrument ID.
    pub instrument_id: String,
    /// The candle data.
    pub candle: Candle,
    /// Event sequence number.
    pub sequence: u64,
    /// Whether this is a forward-filled candle.
    pub is_forward_filled: bool,
}

impl CandleEvent {
    /// Create a new candle event.
    #[must_use]
    pub fn new(instrument_id: &str, candle: Candle, sequence: u64) -> Self {
        Self {
            instrument_id: instrument_id.to_string(),
            candle,
            sequence,
            is_forward_filled: false,
        }
    }

    /// Create a forward-filled candle event.
    #[must_use]
    pub fn forward_filled(instrument_id: &str, candle: Candle, sequence: u64) -> Self {
        Self {
            instrument_id: instrument_id.to_string(),
            candle,
            sequence,
            is_forward_filled: true,
        }
    }
}

/// Progress tracking for replay.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplayProgress {
    /// Total events processed.
    pub events_processed: u64,
    /// Total events expected (estimate).
    pub events_total: Option<u64>,
    /// Current timestamp being processed.
    pub current_timestamp: String,
    /// Start timestamp.
    pub start_timestamp: String,
    /// End timestamp.
    pub end_timestamp: String,
    /// Progress percentage (0.0 to 1.0).
    pub progress_pct: f64,
    /// Estimated time remaining (seconds).
    pub eta_seconds: Option<f64>,
    /// Processing rate (events per second).
    pub events_per_second: f64,
    /// Elapsed time (seconds).
    pub elapsed_seconds: f64,
}

impl Default for ReplayProgress {
    fn default() -> Self {
        Self {
            events_processed: 0,
            events_total: None,
            current_timestamp: String::new(),
            start_timestamp: String::new(),
            end_timestamp: String::new(),
            progress_pct: 0.0,
            eta_seconds: None,
            events_per_second: 0.0,
            elapsed_seconds: 0.0,
        }
    }
}
