//! Parameter grid for grid search optimization.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::types::ParamValue;

/// A parameter grid for grid search optimization.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParameterGrid {
    parameters: HashMap<String, Vec<ParamValue>>,
    order: Vec<String>,
}

impl ParameterGrid {
    /// Create a new parameter grid builder.
    #[must_use]
    pub fn builder() -> ParameterGridBuilder {
        ParameterGridBuilder::new()
    }

    /// Get the total number of parameter combinations.
    #[must_use]
    pub fn total_combinations(&self) -> usize {
        self.parameters.values().map(Vec::len).product()
    }

    /// Generate all parameter combinations.
    #[must_use]
    pub fn combinations(&self) -> Vec<HashMap<String, ParamValue>> {
        let mut result = vec![HashMap::new()];

        for param_name in &self.order {
            let Some(values) = self.parameters.get(param_name) else {
                continue;
            };

            let mut new_result = Vec::with_capacity(result.len() * values.len());
            for combo in &result {
                for value in values {
                    let mut new_combo = combo.clone();
                    new_combo.insert(param_name.clone(), value.clone());
                    new_result.push(new_combo);
                }
            }
            result = new_result;
        }

        result
    }

    /// Check if grid is empty.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.parameters.is_empty() || self.total_combinations() == 0
    }
}

/// Builder for parameter grids.
#[derive(Debug, Default)]
pub struct ParameterGridBuilder {
    parameters: HashMap<String, Vec<ParamValue>>,
    order: Vec<String>,
}

impl ParameterGridBuilder {
    /// Create a new builder.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Add integer parameter values.
    #[must_use]
    pub fn add_int_param(mut self, name: &str, values: Vec<i64>) -> Self {
        self.order.push(name.to_string());
        self.parameters.insert(
            name.to_string(),
            values.into_iter().map(ParamValue::Int).collect(),
        );
        self
    }

    /// Add float parameter values.
    #[must_use]
    pub fn add_float_param(mut self, name: &str, values: Vec<f64>) -> Self {
        self.order.push(name.to_string());
        self.parameters.insert(
            name.to_string(),
            values.into_iter().map(ParamValue::Float).collect(),
        );
        self
    }

    /// Add string parameter values.
    #[must_use]
    pub fn add_string_param(mut self, name: &str, values: Vec<&str>) -> Self {
        self.order.push(name.to_string());
        self.parameters.insert(
            name.to_string(),
            values
                .into_iter()
                .map(|s| ParamValue::String(s.to_string()))
                .collect(),
        );
        self
    }

    /// Add a parameter range (inclusive).
    #[must_use]
    #[allow(clippy::cast_possible_truncation)]
    pub fn add_int_range(self, name: &str, start: i64, end: i64, step: i64) -> Self {
        let values: Vec<i64> = (start..=end)
            .step_by(step.unsigned_abs() as usize)
            .collect();
        self.add_int_param(name, values)
    }

    /// Build the parameter grid.
    #[must_use]
    pub fn build(self) -> ParameterGrid {
        ParameterGrid {
            parameters: self.parameters,
            order: self.order,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parameter_grid_builder() {
        let grid = ParameterGrid::builder()
            .add_int_param("sma_period", vec![10, 20, 50])
            .add_float_param("stop_pct", vec![0.02, 0.05])
            .build();

        assert_eq!(grid.total_combinations(), 6);
    }

    #[test]
    fn test_parameter_grid_combinations() {
        let grid = ParameterGrid::builder()
            .add_int_param("a", vec![1, 2])
            .add_int_param("b", vec![10, 20])
            .build();

        let combos = grid.combinations();
        assert_eq!(combos.len(), 4);

        let has_1_10 = combos.iter().any(|c| {
            c.get("a") == Some(&ParamValue::Int(1)) && c.get("b") == Some(&ParamValue::Int(10))
        });
        let has_2_20 = combos.iter().any(|c| {
            c.get("a") == Some(&ParamValue::Int(2)) && c.get("b") == Some(&ParamValue::Int(20))
        });

        assert!(has_1_10);
        assert!(has_2_20);
    }

    #[test]
    fn test_parameter_grid_int_range() {
        let grid = ParameterGrid::builder()
            .add_int_range("period", 10, 50, 10)
            .build();

        assert_eq!(grid.total_combinations(), 5);
    }
}
