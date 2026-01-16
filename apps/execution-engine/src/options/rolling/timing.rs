//! Roll timing evaluation.

use serde::{Deserialize, Serialize};

use super::config::RollConfig;

/// Check if now is a good time to roll.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RollTimingResult {
    /// Whether now is a good time to roll.
    pub is_good_time: bool,
    /// Reasons for the timing recommendation.
    pub reasons: Vec<String>,
    /// Recommended action.
    pub recommendation: RollTimingRecommendation,
}

/// Timing recommendation for rolls.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RollTimingRecommendation {
    /// Roll now.
    RollNow,
    /// Wait for better timing.
    Wait,
    /// Roll immediately regardless of timing.
    Urgent,
}

/// Check if timing is good for rolling.
#[must_use]
pub fn check_roll_timing(
    current_hour: u8,
    is_market_hours: bool,
    has_itm_leg: bool,
    is_friday: bool,
    config: &RollConfig,
) -> RollTimingResult {
    let mut reasons = Vec::new();

    let is_good_time = if is_market_hours {
        true
    } else {
        reasons.push("Market is closed".to_string());
        false
    };

    if current_hour != config.preferred_roll_hour {
        reasons.push(format!(
            "Current hour ({}) differs from preferred ({})",
            current_hour, config.preferred_roll_hour
        ));
    }

    if config.avoid_itm_overnight && has_itm_leg && current_hour >= 15 {
        reasons.push("ITM leg approaching overnight - recommend rolling now".to_string());
    }

    if is_friday && has_itm_leg {
        reasons.push("Friday with ITM leg - high assignment risk".to_string());
    }

    let recommendation = determine_recommendation(
        is_market_hours,
        has_itm_leg,
        current_hour,
        is_friday,
        config,
    );

    RollTimingResult {
        is_good_time: is_good_time && recommendation != RollTimingRecommendation::Wait,
        reasons,
        recommendation,
    }
}

#[allow(clippy::missing_const_for_fn)] // Method calls and arithmetic prevent const
fn determine_recommendation(
    is_market_hours: bool,
    has_itm_leg: bool,
    current_hour: u8,
    is_friday: bool,
    config: &RollConfig,
) -> RollTimingRecommendation {
    if !is_market_hours {
        return RollTimingRecommendation::Wait;
    }

    if has_itm_leg && (current_hour >= 15 || is_friday) {
        return RollTimingRecommendation::Urgent;
    }

    let in_preferred_window = current_hour >= config.preferred_roll_hour.saturating_sub(1)
        && current_hour <= config.preferred_roll_hour + 1;

    if in_preferred_window {
        RollTimingRecommendation::RollNow
    } else {
        RollTimingRecommendation::Wait
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_roll_timing_preferred_hour() {
        let config = RollConfig::default();
        let result = check_roll_timing(14, true, false, false, &config);
        assert_eq!(result.recommendation, RollTimingRecommendation::RollNow);
    }

    #[test]
    fn test_roll_timing_market_closed() {
        let config = RollConfig::default();
        let result = check_roll_timing(14, false, false, false, &config);
        assert_eq!(result.recommendation, RollTimingRecommendation::Wait);
    }

    #[test]
    fn test_roll_timing_itm_late_day() {
        let config = RollConfig::default();
        let result = check_roll_timing(15, true, true, false, &config);
        assert_eq!(result.recommendation, RollTimingRecommendation::Urgent);
    }

    #[test]
    fn test_roll_timing_friday_itm() {
        let config = RollConfig::default();
        let result = check_roll_timing(10, true, true, true, &config);
        assert_eq!(result.recommendation, RollTimingRecommendation::Urgent);
    }
}
