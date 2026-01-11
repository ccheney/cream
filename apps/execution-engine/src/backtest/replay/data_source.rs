//! Data source trait and implementations for loading candle data.

use std::collections::HashMap;

use super::error::ReplayError;
use crate::backtest::Candle;

/// Data source trait for loading candle data.
pub trait CandleDataSource: Send + Sync {
    /// Load candles for an instrument within the date range.
    ///
    /// # Errors
    ///
    /// Returns an error if the candle data cannot be loaded, for example
    /// if the instrument is not found or the data source is unavailable.
    fn load_candles(
        &self,
        instrument_id: &str,
        start_date: &str,
        end_date: &str,
    ) -> Result<Vec<Candle>, ReplayError>;

    /// Get the name of this data source.
    fn name(&self) -> &'static str;
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

        let filtered: Vec<Candle> = candles
            .iter()
            .filter(|c| c.timestamp.as_str() >= start_date && c.timestamp.as_str() < end_date)
            .cloned()
            .collect();

        Ok(filtered)
    }

    fn name(&self) -> &'static str {
        "InMemory"
    }
}
