//! Strongly-typed identifiers for domain entities.
//!
//! These prevent mixing up IDs from different contexts.

use serde::{Deserialize, Serialize};
use std::fmt;

macro_rules! define_id {
    ($name:ident, $doc:expr) => {
        #[doc = $doc]
        #[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
        #[serde(transparent)]
        pub struct $name(String);

        impl $name {
            /// Create a new identifier from a string.
            #[must_use]
            pub fn new(value: impl Into<String>) -> Self {
                Self(value.into())
            }

            /// Generate a new unique identifier using UUID v4.
            #[must_use]
            pub fn generate() -> Self {
                Self(uuid::Uuid::new_v4().to_string())
            }

            /// Get the inner string value.
            #[must_use]
            pub fn as_str(&self) -> &str {
                &self.0
            }

            /// Consume and return the inner string.
            #[must_use]
            pub fn into_inner(self) -> String {
                self.0
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                write!(f, "{}", self.0)
            }
        }

        impl AsRef<str> for $name {
            fn as_ref(&self) -> &str {
                &self.0
            }
        }

        impl From<String> for $name {
            fn from(value: String) -> Self {
                Self(value)
            }
        }

        impl From<&str> for $name {
            fn from(value: &str) -> Self {
                Self(value.to_string())
            }
        }
    };
}

define_id!(OrderId, "Unique identifier for an order (Cream internal).");
define_id!(BrokerId, "Broker's unique identifier for an order.");
define_id!(
    InstrumentId,
    "Identifier for a tradeable instrument (ticker or OCC symbol)."
);
define_id!(DecisionId, "Unique identifier for a trading decision.");
define_id!(PlanId, "Unique identifier for a decision plan.");
define_id!(CycleId, "Unique identifier for a trading cycle.");

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn order_id_new_and_display() {
        let id = OrderId::new("ord-123");
        assert_eq!(id.as_str(), "ord-123");
        assert_eq!(format!("{id}"), "ord-123");
    }

    #[test]
    fn order_id_generate_is_unique() {
        let id1 = OrderId::generate();
        let id2 = OrderId::generate();
        assert_ne!(id1, id2);
    }

    #[test]
    fn order_id_equality() {
        let id1 = OrderId::new("ord-123");
        let id2 = OrderId::new("ord-123");
        let id3 = OrderId::new("ord-456");
        assert_eq!(id1, id2);
        assert_ne!(id1, id3);
    }

    #[test]
    fn order_id_from_string() {
        let id: OrderId = "ord-123".into();
        assert_eq!(id.as_str(), "ord-123");

        let id: OrderId = String::from("ord-456").into();
        assert_eq!(id.as_str(), "ord-456");
    }

    #[test]
    fn order_id_into_inner() {
        let id = OrderId::new("ord-123");
        let inner = id.into_inner();
        assert_eq!(inner, "ord-123");
    }

    #[test]
    fn broker_id_new_and_display() {
        let id = BrokerId::new("alpaca-ord-abc");
        assert_eq!(id.as_str(), "alpaca-ord-abc");
    }

    #[test]
    fn instrument_id_new() {
        let ticker = InstrumentId::new("AAPL");
        assert_eq!(ticker.as_str(), "AAPL");

        let option = InstrumentId::new("AAPL250117P00190000");
        assert_eq!(option.as_str(), "AAPL250117P00190000");
    }

    #[test]
    fn decision_id_generate() {
        let id = DecisionId::generate();
        assert!(!id.as_str().is_empty());
    }

    #[test]
    fn plan_id_new() {
        let id = PlanId::new("plan-001");
        assert_eq!(id.as_str(), "plan-001");
    }

    #[test]
    fn cycle_id_new() {
        let id = CycleId::new("cycle-2026-01-19-1200");
        assert_eq!(id.as_str(), "cycle-2026-01-19-1200");
    }

    #[test]
    fn serde_roundtrip() {
        let id = OrderId::new("ord-123");
        let json = serde_json::to_string(&id).unwrap();
        assert_eq!(json, "\"ord-123\"");

        let parsed: OrderId = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, id);
    }

    #[test]
    fn hash_works_for_collections() {
        use std::collections::HashSet;
        let mut set = HashSet::new();
        set.insert(OrderId::new("ord-1"));
        set.insert(OrderId::new("ord-2"));
        set.insert(OrderId::new("ord-1")); // duplicate

        assert_eq!(set.len(), 2);
    }
}
