//! Risk Policy Repository Trait

use async_trait::async_trait;

use super::aggregate::RiskPolicy;
use super::errors::RiskError;

/// Repository trait for Risk Policy persistence.

#[async_trait]
pub trait RiskPolicyRepository: Send + Sync {
    /// Save a risk policy.
    async fn save(&self, policy: &RiskPolicy) -> Result<(), RiskError>;

    /// Find a policy by ID.
    async fn find_by_id(&self, id: &str) -> Result<Option<RiskPolicy>, RiskError>;

    /// Find the active policy.
    async fn find_active(&self) -> Result<Option<RiskPolicy>, RiskError>;

    /// List all policies.
    async fn list_all(&self) -> Result<Vec<RiskPolicy>, RiskError>;

    /// Delete a policy by ID.
    async fn delete(&self, id: &str) -> Result<(), RiskError>;
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::sync::RwLock;

    struct InMemoryRiskPolicyRepository {
        policies: RwLock<HashMap<String, RiskPolicy>>,
    }

    impl InMemoryRiskPolicyRepository {
        fn new() -> Self {
            Self {
                policies: RwLock::new(HashMap::new()),
            }
        }
    }

    #[async_trait]
    impl RiskPolicyRepository for InMemoryRiskPolicyRepository {
        async fn save(&self, policy: &RiskPolicy) -> Result<(), RiskError> {
            let mut policies = self
                .policies
                .write()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            policies.insert(policy.id().to_string(), policy.clone());
            Ok(())
        }

        async fn find_by_id(&self, id: &str) -> Result<Option<RiskPolicy>, RiskError> {
            let policies = self
                .policies
                .read()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            Ok(policies.get(id).cloned())
        }

        async fn find_active(&self) -> Result<Option<RiskPolicy>, RiskError> {
            let policies = self
                .policies
                .read()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            Ok(policies.values().find(|p| p.is_active()).cloned())
        }

        async fn list_all(&self) -> Result<Vec<RiskPolicy>, RiskError> {
            let policies = self
                .policies
                .read()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            Ok(policies.values().cloned().collect())
        }

        async fn delete(&self, id: &str) -> Result<(), RiskError> {
            let mut policies = self
                .policies
                .write()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            policies
                .remove(id)
                .ok_or_else(|| RiskError::PolicyNotFound {
                    policy_id: id.to_string(),
                })?;
            Ok(())
        }
    }

    #[tokio::test]
    async fn repository_save_and_find() {
        let repo = InMemoryRiskPolicyRepository::new();
        let policy = RiskPolicy::default();

        repo.save(&policy).await.unwrap();

        let found = repo.find_by_id("default").await.unwrap();
        assert!(found.is_some());
    }

    #[tokio::test]
    async fn repository_find_active() {
        let repo = InMemoryRiskPolicyRepository::new();
        let mut policy = RiskPolicy::default();
        policy.activate();

        repo.save(&policy).await.unwrap();

        let active = repo.find_active().await.unwrap();
        assert!(active.is_some());
        assert!(active.unwrap().is_active());
    }

    #[tokio::test]
    async fn repository_delete() {
        let repo = InMemoryRiskPolicyRepository::new();
        let policy = RiskPolicy::default();

        repo.save(&policy).await.unwrap();
        repo.delete("default").await.unwrap();

        let found = repo.find_by_id("default").await.unwrap();
        assert!(found.is_none());
    }
}
