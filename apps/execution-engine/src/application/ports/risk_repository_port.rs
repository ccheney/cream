//! Risk Repository Port (Driven Port)
//!
//! Interface for persisting risk policies and retrieving risk context.

use async_trait::async_trait;
use rust_decimal::Decimal;

use crate::domain::risk_management::{
    aggregate::RiskPolicy,
    errors::RiskError,
    value_objects::{Exposure, Greeks, RiskContext},
};
use crate::domain::shared::{InstrumentId, Money};

/// Port for risk data persistence and retrieval.

#[async_trait]
pub trait RiskRepositoryPort: Send + Sync {
    /// Save a risk policy.
    async fn save_policy(&self, policy: &RiskPolicy) -> Result<(), RiskError>;

    /// Find a policy by ID.
    async fn find_policy_by_id(&self, id: &str) -> Result<Option<RiskPolicy>, RiskError>;

    /// Find the active policy.
    async fn find_active_policy(&self) -> Result<Option<RiskPolicy>, RiskError>;

    /// List all policies.
    async fn list_policies(&self) -> Result<Vec<RiskPolicy>, RiskError>;

    /// Delete a policy by ID.
    async fn delete_policy(&self, id: &str) -> Result<(), RiskError>;

    /// Get current portfolio exposure.
    async fn get_portfolio_exposure(&self) -> Result<Exposure, RiskError>;

    /// Get exposure for a specific instrument.
    async fn get_instrument_exposure(
        &self,
        instrument_id: &InstrumentId,
    ) -> Result<Exposure, RiskError>;

    /// Get current portfolio Greeks.
    async fn get_portfolio_greeks(&self) -> Result<Greeks, RiskError>;

    /// Get account buying power.
    async fn get_buying_power(&self) -> Result<Decimal, RiskError>;

    /// Get day trade count (for PDT tracking).
    async fn get_day_trade_count(&self) -> Result<u32, RiskError>;

    /// Build a complete risk context for validation.
    async fn build_risk_context(&self) -> Result<RiskContext, RiskError>;
}

/// In-memory implementation for testing.
#[derive(Debug, Default)]
pub struct InMemoryRiskRepository {
    policies: std::sync::RwLock<std::collections::HashMap<String, RiskPolicy>>,
}

impl InMemoryRiskRepository {
    /// Create a new in-memory repository.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }
}

#[async_trait]
impl RiskRepositoryPort for InMemoryRiskRepository {
    async fn save_policy(&self, policy: &RiskPolicy) -> Result<(), RiskError> {
        let mut policies = self
            .policies
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        policies.insert(policy.id().to_string(), policy.clone());
        drop(policies);
        Ok(())
    }

    async fn find_policy_by_id(&self, id: &str) -> Result<Option<RiskPolicy>, RiskError> {
        let policies = self
            .policies
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        Ok(policies.get(id).cloned())
    }

    async fn find_active_policy(&self) -> Result<Option<RiskPolicy>, RiskError> {
        let policies = self
            .policies
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        Ok(policies.values().find(|p| p.is_active()).cloned())
    }

    async fn list_policies(&self) -> Result<Vec<RiskPolicy>, RiskError> {
        let policies = self
            .policies
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        Ok(policies.values().cloned().collect())
    }

    async fn delete_policy(&self, id: &str) -> Result<(), RiskError> {
        {
            let mut policies = self
                .policies
                .write()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            policies
                .remove(id)
                .ok_or_else(|| RiskError::PolicyNotFound {
                    policy_id: id.to_string(),
                })?;
        }
        Ok(())
    }

    async fn get_portfolio_exposure(&self) -> Result<Exposure, RiskError> {
        Ok(Exposure::default())
    }

    async fn get_instrument_exposure(
        &self,
        _instrument_id: &InstrumentId,
    ) -> Result<Exposure, RiskError> {
        Ok(Exposure::default())
    }

    async fn get_portfolio_greeks(&self) -> Result<Greeks, RiskError> {
        Ok(Greeks::ZERO)
    }

    async fn get_buying_power(&self) -> Result<Decimal, RiskError> {
        Ok(Decimal::new(100_000, 0)) // $100,000 default
    }

    async fn get_day_trade_count(&self) -> Result<u32, RiskError> {
        Ok(0)
    }

    async fn build_risk_context(&self) -> Result<RiskContext, RiskError> {
        let buying_power = self.get_buying_power().await?;
        let mut context = RiskContext::new(
            Money::new(buying_power), // Use buying power as equity estimate
            Money::new(buying_power),
        );
        context.current_exposure = self.get_portfolio_exposure().await?;
        context.current_greeks = self.get_portfolio_greeks().await?;
        #[allow(clippy::cast_possible_truncation)]
        {
            context.day_trades_remaining =
                3u8.saturating_sub(self.get_day_trade_count().await? as u8);
        }
        Ok(context)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn in_memory_save_and_find() {
        let repo = InMemoryRiskRepository::new();
        let policy = RiskPolicy::default();

        repo.save_policy(&policy).await.unwrap();

        let found = repo.find_policy_by_id("default").await.unwrap();
        assert!(found.is_some());
    }

    #[tokio::test]
    async fn in_memory_find_active() {
        let repo = InMemoryRiskRepository::new();
        let mut policy = RiskPolicy::default();
        policy.activate();

        repo.save_policy(&policy).await.unwrap();

        let active = repo.find_active_policy().await.unwrap();
        assert!(active.is_some());
        assert!(active.unwrap().is_active());
    }

    #[tokio::test]
    async fn in_memory_delete() {
        let repo = InMemoryRiskRepository::new();
        let policy = RiskPolicy::default();

        repo.save_policy(&policy).await.unwrap();
        repo.delete_policy("default").await.unwrap();

        let found = repo.find_policy_by_id("default").await.unwrap();
        assert!(found.is_none());
    }

    #[tokio::test]
    async fn in_memory_delete_not_found() {
        let repo = InMemoryRiskRepository::new();
        let result = repo.delete_policy("nonexistent").await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn in_memory_build_risk_context() {
        use crate::domain::shared::Money;

        let repo = InMemoryRiskRepository::new();
        let context = repo.build_risk_context().await.unwrap();

        assert_eq!(context.buying_power, Money::new(Decimal::new(100_000, 0)));
        assert_eq!(context.day_trades_remaining, 3);
    }
}
