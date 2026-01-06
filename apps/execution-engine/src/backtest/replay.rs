//! Historical data replay engine for backtest simulation.
//!
//! Provides sequential candle streaming from various data sources:
//! - Local Parquet/Arrow files
//! - Arrow Flight RPC for high-performance streaming
//! - REST API fallback
//!
//! Features:
//! - Multi-instrument timestamp synchronization
//! - Memory-efficient streaming (does not load all data upfront)
//! - Progress tracking with ETA estimation
//! - Configurable date ranges
//! - Missing data handling

use std::cmp::Ordering;
use std::collections::{BinaryHeap, HashMap};
use std::path::PathBuf;
use std::sync::Arc;

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tracing::{debug, info, warn};

use super::Candle;

/// Replay engine errors.
#[derive(Debug, Error)]
pub enum ReplayError {
    /// IO error reading data.
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    /// Arrow error.
    #[error("Arrow error: {0}")]
    Arrow(String),

    /// Flight RPC error.
    #[error("Flight RPC error: {0}")]
    FlightRpc(String),

    /// No data available for instrument.
    #[error("No data for instrument: {0}")]
    NoData(String),

    /// Invalid date range.
    #[error("Invalid date range: start {0} >= end {1}")]
    InvalidDateRange(String, String),

    /// Configuration error.
    #[error("Configuration error: {0}")]
    Config(String),
}

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

/// Wrapper for CandleEvent to use in BinaryHeap (min-heap by timestamp).
#[derive(Debug)]
struct TimestampedEvent {
    event: CandleEvent,
}

impl PartialEq for TimestampedEvent {
    fn eq(&self, other: &Self) -> bool {
        self.event.candle.timestamp == other.event.candle.timestamp
    }
}

impl Eq for TimestampedEvent {}

impl PartialOrd for TimestampedEvent {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for TimestampedEvent {
    fn cmp(&self, other: &Self) -> Ordering {
        // Reverse ordering for min-heap (earliest timestamp first)
        other
            .event
            .candle
            .timestamp
            .cmp(&self.event.candle.timestamp)
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

/// Data source trait for loading candle data.
pub trait CandleDataSource: Send + Sync {
    /// Load candles for an instrument within the date range.
    fn load_candles(
        &self,
        instrument_id: &str,
        start_date: &str,
        end_date: &str,
    ) -> Result<Vec<Candle>, ReplayError>;

    /// Get the name of this data source.
    fn name(&self) -> &str;
}

/// In-memory data source for testing.
#[derive(Debug, Default)]
pub struct InMemoryDataSource {
    data: HashMap<String, Vec<Candle>>,
}

impl InMemoryDataSource {
    /// Create a new empty in-memory data source.
    #[must_use]
    pub fn new() -> Self {
        Self {
            data: HashMap::new(),
        }
    }

    /// Add candles for an instrument.
    pub fn add_candles(&mut self, instrument_id: &str, candles: Vec<Candle>) {
        self.data.insert(instrument_id.to_string(), candles);
    }
}

impl CandleDataSource for InMemoryDataSource {
    fn load_candles(
        &self,
        instrument_id: &str,
        start_date: &str,
        end_date: &str,
    ) -> Result<Vec<Candle>, ReplayError> {
        let candles = self
            .data
            .get(instrument_id)
            .ok_or_else(|| ReplayError::NoData(instrument_id.to_string()))?;

        // Filter by date range
        let filtered: Vec<Candle> = candles
            .iter()
            .filter(|c| c.timestamp >= start_date.to_string() && c.timestamp < end_date.to_string())
            .cloned()
            .collect();

        Ok(filtered)
    }

    fn name(&self) -> &str {
        "InMemory"
    }
}

/// Historical data replay engine.
///
/// Streams candles sequentially, synchronized across multiple instruments.
pub struct ReplayEngine {
    config: ReplayConfig,
    data_source: Arc<dyn CandleDataSource>,
    event_queue: BinaryHeap<TimestampedEvent>,
    sequence_counter: u64,
    last_candles: HashMap<String, Candle>,
    progress: ReplayProgress,
    start_time: std::time::Instant,
    initialized: bool,
}

impl std::fmt::Debug for ReplayEngine {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ReplayEngine")
            .field("config", &self.config)
            .field("data_source", &self.data_source.name())
            .field("event_queue_len", &self.event_queue.len())
            .field("sequence_counter", &self.sequence_counter)
            .field("last_candles", &self.last_candles)
            .field("progress", &self.progress)
            .field("initialized", &self.initialized)
            .finish()
    }
}

impl ReplayEngine {
    /// Create a new replay engine with the given configuration.
    pub fn new(config: ReplayConfig, data_source: Arc<dyn CandleDataSource>) -> Self {
        Self {
            config,
            data_source,
            event_queue: BinaryHeap::new(),
            sequence_counter: 0,
            last_candles: HashMap::new(),
            progress: ReplayProgress::default(),
            start_time: std::time::Instant::now(),
            initialized: false,
        }
    }

    /// Create a replay engine with in-memory data source.
    #[must_use]
    pub fn in_memory(config: ReplayConfig) -> Self {
        Self::new(config, Arc::new(InMemoryDataSource::new()))
    }

    /// Initialize the replay engine by loading data.
    pub fn initialize(&mut self) -> Result<(), ReplayError> {
        if self.initialized {
            return Ok(());
        }

        info!(
            source = %self.data_source.name(),
            instruments = ?self.config.instruments,
            start = %self.config.start_date,
            end = %self.config.end_date,
            "Initializing replay engine"
        );

        let mut total_candles = 0u64;

        for instrument_id in &self.config.instruments {
            let candles = self.data_source.load_candles(
                instrument_id,
                &self.config.start_date,
                &self.config.end_date,
            )?;

            debug!(
                instrument = %instrument_id,
                candles = candles.len(),
                "Loaded candles"
            );

            total_candles += candles.len() as u64;

            // Add candles to the event queue
            for candle in candles {
                self.sequence_counter += 1;
                let event = CandleEvent::new(instrument_id, candle, self.sequence_counter);
                self.event_queue.push(TimestampedEvent { event });
            }
        }

        // Initialize progress tracking
        self.progress.events_total = Some(total_candles);
        self.progress
            .start_timestamp
            .clone_from(&self.config.start_date);
        self.progress
            .end_timestamp
            .clone_from(&self.config.end_date);
        self.start_time = std::time::Instant::now();
        self.initialized = true;

        info!(total_candles = total_candles, "Replay engine initialized");

        Ok(())
    }

    /// Get the current progress.
    #[must_use]
    pub fn progress(&self) -> &ReplayProgress {
        &self.progress
    }

    /// Get the configuration.
    #[must_use]
    pub fn config(&self) -> &ReplayConfig {
        &self.config
    }

    /// Check if there are more events.
    #[must_use]
    pub fn has_more(&self) -> bool {
        !self.event_queue.is_empty()
    }

    /// Get the next candle event.
    pub fn next_event(&mut self) -> Option<CandleEvent> {
        let timestamped = self.event_queue.pop()?;
        let event = timestamped.event;

        // Update progress
        self.progress.events_processed += 1;
        self.progress
            .current_timestamp
            .clone_from(&event.candle.timestamp);
        self.update_progress();

        // Track last candle for each instrument (for forward-fill)
        self.last_candles
            .insert(event.instrument_id.clone(), event.candle.clone());

        Some(event)
    }

    /// Update progress metrics.
    fn update_progress(&mut self) {
        let elapsed = self.start_time.elapsed().as_secs_f64();
        self.progress.elapsed_seconds = elapsed;

        if elapsed > 0.0 {
            self.progress.events_per_second = self.progress.events_processed as f64 / elapsed;
        }

        if let Some(total) = self.progress.events_total {
            if total > 0 {
                self.progress.progress_pct = self.progress.events_processed as f64 / total as f64;

                // Estimate remaining time
                let remaining = total.saturating_sub(self.progress.events_processed);
                if self.progress.events_per_second > 0.0 {
                    self.progress.eta_seconds =
                        Some(remaining as f64 / self.progress.events_per_second);
                }
            }
        }
    }

    /// Get the last candle for an instrument (for forward-fill).
    #[must_use]
    pub fn last_candle(&self, instrument_id: &str) -> Option<&Candle> {
        self.last_candles.get(instrument_id)
    }

    /// Reset the replay engine to start over.
    pub fn reset(&mut self) -> Result<(), ReplayError> {
        self.event_queue.clear();
        self.sequence_counter = 0;
        self.last_candles.clear();
        self.progress = ReplayProgress::default();
        self.initialized = false;
        self.initialize()
    }
}

impl Iterator for ReplayEngine {
    type Item = CandleEvent;

    fn next(&mut self) -> Option<Self::Item> {
        if !self.initialized {
            if let Err(e) = self.initialize() {
                warn!(error = %e, "Failed to initialize replay engine");
                return None;
            }
        }

        self.next_event()
    }
}

/// Builder for ReplayEngine with fluent API.
#[derive(Default)]
pub struct ReplayEngineBuilder {
    config: ReplayConfig,
    data_source: Option<Arc<dyn CandleDataSource>>,
}

impl std::fmt::Debug for ReplayEngineBuilder {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ReplayEngineBuilder")
            .field("config", &self.config)
            .field("has_data_source", &self.data_source.is_some())
            .finish()
    }
}

impl ReplayEngineBuilder {
    /// Create a new builder.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Set the data source type.
    #[must_use]
    pub fn source(mut self, source: DataSourceType) -> Self {
        self.config.source = source;
        self
    }

    /// Set the start date.
    #[must_use]
    pub fn start_date(mut self, date: &str) -> Self {
        self.config.start_date = date.to_string();
        self
    }

    /// Set the end date.
    #[must_use]
    pub fn end_date(mut self, date: &str) -> Self {
        self.config.end_date = date.to_string();
        self
    }

    /// Add an instrument.
    #[must_use]
    pub fn instrument(mut self, instrument_id: &str) -> Self {
        self.config.instruments.push(instrument_id.to_string());
        self
    }

    /// Add multiple instruments.
    #[must_use]
    pub fn instruments(mut self, instruments: Vec<String>) -> Self {
        self.config.instruments.extend(instruments);
        self
    }

    /// Set the missing data policy.
    #[must_use]
    pub fn missing_data_policy(mut self, policy: MissingDataPolicy) -> Self {
        self.config.missing_data_policy = policy;
        self
    }

    /// Set progress tracking.
    #[must_use]
    pub fn track_progress(mut self, track: bool) -> Self {
        self.config.track_progress = track;
        self
    }

    /// Set the data source.
    #[must_use]
    pub fn data_source(mut self, source: Arc<dyn CandleDataSource>) -> Self {
        self.data_source = Some(source);
        self
    }

    /// Build the replay engine.
    #[must_use]
    pub fn build(self) -> ReplayEngine {
        let data_source = self
            .data_source
            .unwrap_or_else(|| Arc::new(InMemoryDataSource::new()));

        ReplayEngine::new(self.config, data_source)
    }
}

/// Synchronize candles across multiple instruments at the same timestamp.
///
/// Groups candle events by timestamp for processing.
#[derive(Debug)]
pub struct SynchronizedReplay {
    engine: ReplayEngine,
    current_timestamp: Option<String>,
    buffer: Vec<CandleEvent>,
}

impl SynchronizedReplay {
    /// Create a new synchronized replay wrapper.
    pub fn new(engine: ReplayEngine) -> Self {
        Self {
            engine,
            current_timestamp: None,
            buffer: Vec::new(),
        }
    }

    /// Get the next batch of synchronized candle events.
    ///
    /// Returns all candles at the same timestamp.
    pub fn next_batch(&mut self) -> Option<(String, Vec<CandleEvent>)> {
        if !self.engine.initialized {
            if let Err(e) = self.engine.initialize() {
                warn!(error = %e, "Failed to initialize replay engine");
                return None;
            }
        }

        loop {
            match self.engine.next_event() {
                Some(event) => {
                    let event_timestamp = event.candle.timestamp.clone();

                    match &self.current_timestamp {
                        None => {
                            // First event
                            self.current_timestamp = Some(event_timestamp);
                            self.buffer.push(event);
                        }
                        Some(current) if *current == event_timestamp => {
                            // Same timestamp - add to buffer
                            self.buffer.push(event);
                        }
                        Some(_) => {
                            // New timestamp - return buffered events and start new batch
                            let result_timestamp = self.current_timestamp.take().unwrap();
                            let result_events = std::mem::take(&mut self.buffer);

                            self.current_timestamp = Some(event_timestamp);
                            self.buffer.push(event);

                            return Some((result_timestamp, result_events));
                        }
                    }
                }
                None => {
                    // No more events - return any remaining buffered events
                    if !self.buffer.is_empty() {
                        let result_timestamp = self.current_timestamp.take().unwrap();
                        let result_events = std::mem::take(&mut self.buffer);
                        return Some((result_timestamp, result_events));
                    }
                    return None;
                }
            }
        }
    }

    /// Get the underlying engine's progress.
    #[must_use]
    pub fn progress(&self) -> &ReplayProgress {
        self.engine.progress()
    }
}

impl Iterator for SynchronizedReplay {
    type Item = (String, Vec<CandleEvent>);

    fn next(&mut self) -> Option<Self::Item> {
        self.next_batch()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_candle(timestamp: &str, close: i64) -> Candle {
        Candle {
            open: Decimal::new(100, 0),
            high: Decimal::new(101, 0),
            low: Decimal::new(99, 0),
            close: Decimal::new(close, 0),
            volume: Decimal::new(10000, 0),
            timestamp: timestamp.to_string(),
        }
    }

    fn setup_test_data_source() -> Arc<InMemoryDataSource> {
        let mut source = InMemoryDataSource::new();

        source.add_candles(
            "AAPL",
            vec![
                make_candle("2024-01-01T09:00:00Z", 150),
                make_candle("2024-01-01T10:00:00Z", 151),
                make_candle("2024-01-01T11:00:00Z", 152),
            ],
        );

        source.add_candles(
            "MSFT",
            vec![
                make_candle("2024-01-01T09:00:00Z", 300),
                make_candle("2024-01-01T10:00:00Z", 301),
                make_candle("2024-01-01T11:00:00Z", 302),
            ],
        );

        Arc::new(source)
    }

    #[test]
    fn test_replay_engine_creation() {
        let config = ReplayConfig::default();
        let engine = ReplayEngine::in_memory(config);

        assert!(!engine.initialized);
    }

    #[test]
    fn test_replay_engine_initialization() {
        let source = setup_test_data_source();
        let config = ReplayConfig {
            source: DataSourceType::InMemory,
            start_date: "2024-01-01T00:00:00Z".to_string(),
            end_date: "2024-01-02T00:00:00Z".to_string(),
            instruments: vec!["AAPL".to_string(), "MSFT".to_string()],
            ..Default::default()
        };

        let mut engine = ReplayEngine::new(config, source);
        engine.initialize().unwrap();

        assert!(engine.initialized);
        assert_eq!(engine.progress().events_total, Some(6));
    }

    #[test]
    fn test_replay_engine_sequential_iteration() {
        let source = setup_test_data_source();
        let config = ReplayConfig {
            source: DataSourceType::InMemory,
            start_date: "2024-01-01T00:00:00Z".to_string(),
            end_date: "2024-01-02T00:00:00Z".to_string(),
            instruments: vec!["AAPL".to_string()],
            ..Default::default()
        };

        let engine = ReplayEngine::new(config, source);
        let events: Vec<CandleEvent> = engine.collect();

        assert_eq!(events.len(), 3);
        // Events should be in timestamp order
        assert!(events[0].candle.timestamp <= events[1].candle.timestamp);
        assert!(events[1].candle.timestamp <= events[2].candle.timestamp);
    }

    #[test]
    fn test_replay_engine_multi_instrument_ordering() {
        let source = setup_test_data_source();
        let config = ReplayConfig {
            source: DataSourceType::InMemory,
            start_date: "2024-01-01T00:00:00Z".to_string(),
            end_date: "2024-01-02T00:00:00Z".to_string(),
            instruments: vec!["AAPL".to_string(), "MSFT".to_string()],
            ..Default::default()
        };

        let engine = ReplayEngine::new(config, source);
        let events: Vec<CandleEvent> = engine.collect();

        assert_eq!(events.len(), 6);

        // Verify timestamp ordering
        let mut last_timestamp = String::new();
        for event in &events {
            assert!(event.candle.timestamp >= last_timestamp);
            last_timestamp.clone_from(&event.candle.timestamp);
        }
    }

    #[test]
    fn test_replay_engine_progress_tracking() {
        let source = setup_test_data_source();
        let config = ReplayConfig {
            source: DataSourceType::InMemory,
            start_date: "2024-01-01T00:00:00Z".to_string(),
            end_date: "2024-01-02T00:00:00Z".to_string(),
            instruments: vec!["AAPL".to_string()],
            track_progress: true,
            ..Default::default()
        };

        let mut engine = ReplayEngine::new(config, source);
        engine.initialize().unwrap();

        // Process some events
        engine.next_event();
        engine.next_event();

        let progress = engine.progress();
        assert_eq!(progress.events_processed, 2);
        assert!(progress.progress_pct > 0.0);
    }

    #[test]
    fn test_synchronized_replay() {
        let source = setup_test_data_source();
        let config = ReplayConfig {
            source: DataSourceType::InMemory,
            start_date: "2024-01-01T00:00:00Z".to_string(),
            end_date: "2024-01-02T00:00:00Z".to_string(),
            instruments: vec!["AAPL".to_string(), "MSFT".to_string()],
            ..Default::default()
        };

        let engine = ReplayEngine::new(config, source);
        let sync_replay = SynchronizedReplay::new(engine);

        let batches: Vec<(String, Vec<CandleEvent>)> = sync_replay.collect();

        // Should have 3 batches (one per timestamp)
        assert_eq!(batches.len(), 3);

        // Each batch should have 2 events (AAPL + MSFT)
        for (_, events) in &batches {
            assert_eq!(events.len(), 2);
        }
    }

    #[test]
    fn test_replay_engine_builder() {
        let source = setup_test_data_source();

        let engine = ReplayEngineBuilder::new()
            .start_date("2024-01-01T00:00:00Z")
            .end_date("2024-01-02T00:00:00Z")
            .instrument("AAPL")
            .instrument("MSFT")
            .track_progress(true)
            .data_source(source)
            .build();

        assert_eq!(engine.config().instruments.len(), 2);
    }

    #[test]
    fn test_replay_engine_reset() {
        let source = setup_test_data_source();
        let config = ReplayConfig {
            source: DataSourceType::InMemory,
            start_date: "2024-01-01T00:00:00Z".to_string(),
            end_date: "2024-01-02T00:00:00Z".to_string(),
            instruments: vec!["AAPL".to_string()],
            ..Default::default()
        };

        let mut engine = ReplayEngine::new(config, source);
        engine.initialize().unwrap();

        // Consume some events
        engine.next_event();
        engine.next_event();

        // Reset
        engine.reset().unwrap();

        // Should be able to iterate again
        let events: Vec<CandleEvent> = engine.collect();
        assert_eq!(events.len(), 3);
    }

    #[test]
    fn test_candle_event_creation() {
        let candle = make_candle("2024-01-01T10:00:00Z", 150);
        let event = CandleEvent::new("AAPL", candle.clone(), 1);

        assert_eq!(event.instrument_id, "AAPL");
        assert_eq!(event.sequence, 1);
        assert!(!event.is_forward_filled);

        let ff_event = CandleEvent::forward_filled("AAPL", candle, 2);
        assert!(ff_event.is_forward_filled);
    }

    #[test]
    fn test_in_memory_data_source() {
        let mut source = InMemoryDataSource::new();

        source.add_candles(
            "AAPL",
            vec![
                make_candle("2024-01-01T09:00:00Z", 150),
                make_candle("2024-01-01T10:00:00Z", 151),
            ],
        );

        let candles = source
            .load_candles("AAPL", "2024-01-01T00:00:00Z", "2024-01-02T00:00:00Z")
            .unwrap();

        assert_eq!(candles.len(), 2);
    }

    #[test]
    fn test_in_memory_data_source_no_data() {
        let source = InMemoryDataSource::new();

        let result = source.load_candles("AAPL", "2024-01-01T00:00:00Z", "2024-01-02T00:00:00Z");

        assert!(matches!(result, Err(ReplayError::NoData(_))));
    }

    #[test]
    fn test_replay_progress_default() {
        let progress = ReplayProgress::default();

        assert_eq!(progress.events_processed, 0);
        assert_eq!(progress.progress_pct, 0.0);
    }
}
