//! Core replay engine for streaming historical candle data.

use std::cmp::Ordering;
use std::collections::{BinaryHeap, HashMap};
use std::sync::Arc;

use tracing::{debug, info, warn};

use super::data_source::{CandleDataSource, InMemoryDataSource};
use super::error::ReplayError;
use super::types::{CandleEvent, DataSourceType, MissingDataPolicy, ReplayConfig, ReplayProgress};
use crate::backtest::Candle;

/// Wrapper for `CandleEvent` to use in `BinaryHeap` (min-heap by timestamp).
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
            .field("start_time", &self.start_time)
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
    ///
    /// # Errors
    ///
    /// Returns an error if candle data cannot be loaded from the data source
    /// for any of the configured instruments.
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

            for candle in candles {
                self.sequence_counter += 1;
                let event = CandleEvent::new(instrument_id, candle, self.sequence_counter);
                self.event_queue.push(TimestampedEvent { event });
            }
        }

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
    pub const fn progress(&self) -> &ReplayProgress {
        &self.progress
    }

    /// Get the configuration.
    #[must_use]
    pub const fn config(&self) -> &ReplayConfig {
        &self.config
    }

    /// Check if the engine has been initialized.
    #[must_use]
    pub const fn is_initialized(&self) -> bool {
        self.initialized
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

        self.progress.events_processed += 1;
        self.progress
            .current_timestamp
            .clone_from(&event.candle.timestamp);
        self.update_progress();

        self.last_candles
            .insert(event.instrument_id.clone(), event.candle.clone());

        Some(event)
    }

    /// Update progress metrics.
    #[allow(clippy::cast_precision_loss)]
    fn update_progress(&mut self) {
        let elapsed = self.start_time.elapsed().as_secs_f64();
        self.progress.elapsed_seconds = elapsed;

        // Precision loss acceptable for rate/progress calculations (approximate metrics)
        if elapsed > 0.0 {
            self.progress.events_per_second = self.progress.events_processed as f64 / elapsed;
        }

        if let Some(total) = self.progress.events_total
            && total > 0
        {
            self.progress.progress_pct = self.progress.events_processed as f64 / total as f64;

            let remaining = total.saturating_sub(self.progress.events_processed);
            if self.progress.events_per_second > 0.0 {
                self.progress.eta_seconds =
                    Some(remaining as f64 / self.progress.events_per_second);
            }
        }
    }

    /// Get the last candle for an instrument (for forward-fill).
    #[must_use]
    pub fn last_candle(&self, instrument_id: &str) -> Option<&Candle> {
        self.last_candles.get(instrument_id)
    }

    /// Reset the replay engine to start over.
    ///
    /// # Errors
    ///
    /// Returns an error if re-initialization fails due to data source errors.
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
        if !self.initialized
            && let Err(e) = self.initialize()
        {
            warn!(error = %e, "Failed to initialize replay engine");
            return None;
        }

        self.next_event()
    }
}

/// Builder for `ReplayEngine` with fluent API.
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
    pub const fn missing_data_policy(mut self, policy: MissingDataPolicy) -> Self {
        self.config.missing_data_policy = policy;
        self
    }

    /// Set progress tracking.
    #[must_use]
    pub const fn track_progress(mut self, track: bool) -> Self {
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
