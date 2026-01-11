//! Synchronized replay for multi-instrument timestamp alignment.

use tracing::warn;

use super::engine::ReplayEngine;
use super::types::{CandleEvent, ReplayProgress};

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
    #[must_use]
    pub const fn new(engine: ReplayEngine) -> Self {
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
        if !self.engine.is_initialized()
            && let Err(e) = self.engine.initialize()
        {
            warn!(error = %e, "Failed to initialize replay engine");
            return None;
        }

        loop {
            if let Some(event) = self.engine.next_event() {
                let event_timestamp = event.candle.timestamp.clone();

                match &self.current_timestamp {
                    None => {
                        self.current_timestamp = Some(event_timestamp);
                        self.buffer.push(event);
                    }
                    Some(current) if *current == event_timestamp => {
                        self.buffer.push(event);
                    }
                    Some(current_ts) => {
                        let result_timestamp = current_ts.clone();
                        self.current_timestamp = None;
                        let result_events = std::mem::take(&mut self.buffer);

                        self.current_timestamp = Some(event_timestamp);
                        self.buffer.push(event);

                        return Some((result_timestamp, result_events));
                    }
                }
            } else {
                if let Some(result_timestamp) = self.current_timestamp.take()
                    && !self.buffer.is_empty()
                {
                    let result_events = std::mem::take(&mut self.buffer);
                    return Some((result_timestamp, result_events));
                }
                return None;
            }
        }
    }

    /// Get the underlying engine's progress.
    #[must_use]
    pub const fn progress(&self) -> &ReplayProgress {
        self.engine.progress()
    }
}

impl Iterator for SynchronizedReplay {
    type Item = (String, Vec<CandleEvent>);

    fn next(&mut self) -> Option<Self::Item> {
        self.next_batch()
    }
}
