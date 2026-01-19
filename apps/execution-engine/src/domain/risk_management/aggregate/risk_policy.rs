//! Risk Policy Aggregate

use serde::{Deserialize, Serialize};

use crate::domain::risk_management::value_objects::ExposureLimits;
use crate::domain::shared::Timestamp;

/// Risk Policy Aggregate - configuration of risk limits.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RiskPolicy {
    /// Policy ID.
    id: String,
    /// Policy name.
    name: String,
    /// Exposure limits.
    limits: ExposureLimits,
    /// Whether this is the active policy.
    active: bool,
    /// Creation timestamp.
    created_at: Timestamp,
    /// Last update timestamp.
    updated_at: Timestamp,
}

impl RiskPolicy {
    /// Create a new risk policy.
    #[must_use]
    pub fn new(id: impl Into<String>, name: impl Into<String>, limits: ExposureLimits) -> Self {
        let now = Timestamp::now();
        Self {
            id: id.into(),
            name: name.into(),
            limits,
            active: false,
            created_at: now,
            updated_at: now,
        }
    }

    /// Create the default policy.
    #[must_use]
    pub fn default_policy() -> Self {
        Self::new("default", "Default Risk Policy", ExposureLimits::default())
    }

    /// Get the policy ID.
    #[must_use]
    pub fn id(&self) -> &str {
        &self.id
    }

    /// Get the policy name.
    #[must_use]
    pub fn name(&self) -> &str {
        &self.name
    }

    /// Get the exposure limits.
    #[must_use]
    pub fn limits(&self) -> &ExposureLimits {
        &self.limits
    }

    /// Check if this policy is active.
    #[must_use]
    pub const fn is_active(&self) -> bool {
        self.active
    }

    /// Activate this policy.
    pub fn activate(&mut self) {
        self.active = true;
        self.updated_at = Timestamp::now();
    }

    /// Deactivate this policy.
    pub fn deactivate(&mut self) {
        self.active = false;
        self.updated_at = Timestamp::now();
    }

    /// Update the exposure limits.
    pub fn update_limits(&mut self, limits: ExposureLimits) {
        self.limits = limits;
        self.updated_at = Timestamp::now();
    }

    /// Get creation timestamp.
    #[must_use]
    pub const fn created_at(&self) -> Timestamp {
        self.created_at
    }

    /// Get last update timestamp.
    #[must_use]
    pub const fn updated_at(&self) -> Timestamp {
        self.updated_at
    }
}

impl Default for RiskPolicy {
    fn default() -> Self {
        Self::default_policy()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn risk_policy_new() {
        let policy = RiskPolicy::new("policy-1", "Test Policy", ExposureLimits::default());
        assert_eq!(policy.id(), "policy-1");
        assert_eq!(policy.name(), "Test Policy");
        assert!(!policy.is_active());
    }

    #[test]
    fn risk_policy_default() {
        let policy = RiskPolicy::default();
        assert_eq!(policy.id(), "default");
    }

    #[test]
    fn risk_policy_activate_deactivate() {
        let mut policy = RiskPolicy::default();
        assert!(!policy.is_active());

        policy.activate();
        assert!(policy.is_active());

        policy.deactivate();
        assert!(!policy.is_active());
    }

    #[test]
    fn risk_policy_update_limits() {
        let mut policy = RiskPolicy::default();
        let mut new_limits = ExposureLimits::default();
        new_limits.per_instrument.max_units = 500;

        policy.update_limits(new_limits.clone());
        assert_eq!(policy.limits().per_instrument.max_units, 500);
    }

    #[test]
    fn risk_policy_serde() {
        let policy = RiskPolicy::default();
        let json = serde_json::to_string(&policy).unwrap();
        let parsed: RiskPolicy = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.id(), policy.id());
    }
}
