//! Scanner Configuration Port
//!
//! Outbound port for reading scanner configuration from infrastructure.

use std::error::Error;

use async_trait::async_trait;

use crate::domain::scanner::ScannerParams;

/// Abstraction for loading scanner configuration.
#[async_trait]
pub trait ScannerConfigPort: Send + Sync {
    /// Load active scanner config.
    async fn load_config(&self) -> Result<ScannerParams, Box<dyn Error + Send + Sync>>;
}
