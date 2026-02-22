//! Scanner Config Repository
//!
//! Loads active scanner config from `PostgreSQL`.

use async_trait::async_trait;
use sqlx::{FromRow, PgPool, postgres::PgPoolOptions};

use crate::Environment;
use crate::application::ports::scanner::ScannerConfigPort;
use crate::domain::scanner::ScannerParams;

/// Errors for scanner config repository operations.
#[derive(Debug, thiserror::Error)]
pub enum ScannerConfigRepositoryError {
    /// Missing `DATABASE_URL` environment variable.
    #[error("DATABASE_URL environment variable is required")]
    MissingDatabaseUrl,

    /// Database operation failed.
    #[error("database operation failed: {0}")]
    Sqlx(#[from] sqlx::Error),

    /// No active config exists for the current environment.
    #[error("no active scanner config found for environment {0}")]
    NotFound(String),
}

#[derive(Debug, FromRow)]
struct ScannerConfigRow {
    min_price: f64,
    min_avg_volume: i64,
    volume_spike_threshold: f64,
    price_move_threshold: f64,
    gap_threshold: f64,
    max_candidates: i32,
    cooldown_seconds: i64,
    enabled: bool,
}

/// PostgreSQL-backed scanner configuration repository.
#[derive(Debug, Clone)]
pub struct ScannerConfigRepository {
    pool: PgPool,
    environment: String,
}

impl ScannerConfigRepository {
    /// Create repository from `DATABASE_URL`.
    ///
    /// # Errors
    ///
    /// Returns an error when environment variables are missing or DB connect fails.
    pub async fn from_env(environment: Environment) -> Result<Self, ScannerConfigRepositoryError> {
        let database_url = std::env::var("DATABASE_URL")
            .map_err(|_| ScannerConfigRepositoryError::MissingDatabaseUrl)?;
        Self::new(&database_url, environment).await
    }

    /// Create repository with explicit database URL.
    ///
    /// # Errors
    ///
    /// Returns an error when connection setup fails.
    pub async fn new(
        database_url: &str,
        environment: Environment,
    ) -> Result<Self, ScannerConfigRepositoryError> {
        let pool = PgPoolOptions::new()
            .max_connections(2)
            .connect(database_url)
            .await?;

        let environment = match environment {
            Environment::Paper => "PAPER",
            Environment::Live => "LIVE",
        }
        .to_string();

        Ok(Self { pool, environment })
    }

    async fn load_config_internal(&self) -> Result<ScannerParams, ScannerConfigRepositoryError> {
        let query = r"
            SELECT
                min_price,
                min_avg_volume::bigint AS min_avg_volume,
                volume_spike_threshold,
                price_move_threshold,
                gap_threshold,
                max_candidates,
                cooldown_seconds::bigint AS cooldown_seconds,
                enabled
            FROM scanner_configs
            WHERE environment = $1::environment
              AND status = 'active'::config_status
            ORDER BY updated_at DESC
            LIMIT 1
        ";

        let row = sqlx::query_as::<_, ScannerConfigRow>(query)
            .bind(&self.environment)
            .fetch_optional(&self.pool)
            .await?
            .ok_or_else(|| ScannerConfigRepositoryError::NotFound(self.environment.clone()))?;

        let max_candidates = usize::try_from(row.max_candidates)
            .ok()
            .filter(|value| *value > 0)
            .unwrap_or(1);

        Ok(ScannerParams {
            min_price: row.min_price,
            min_avg_volume: row.min_avg_volume,
            volume_spike_threshold: row.volume_spike_threshold,
            price_move_threshold: row.price_move_threshold,
            gap_threshold: row.gap_threshold,
            max_candidates,
            cooldown_seconds: row.cooldown_seconds,
            enabled: row.enabled,
        })
    }
}

#[async_trait]
impl ScannerConfigPort for ScannerConfigRepository {
    async fn load_config(&self) -> Result<ScannerParams, Box<dyn std::error::Error + Send + Sync>> {
        self.load_config_internal()
            .await
            .map_err(|error| Box::new(error) as _)
    }
}
