//! Monte Carlo simulation for strategy validation.
//!
//! Implements randomization techniques to distinguish luck from skill:
//! - Trade sequence shuffling (removes timing luck)
//! - Bootstrap resampling (sample with replacement)
//! - Confidence interval calculation (percentile method)
//! - Value at Risk (`VaR`) and Conditional `VaR` (`CVaR`)

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

use rust_decimal::Decimal;
use rust_decimal::prelude::ToPrimitive;
use serde::{Deserialize, Serialize};
use tracing::{debug, info};

use super::metrics::{PerformanceCalculator, TradeRecord};

/// Randomization method for Monte Carlo simulation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RandomizationMethod {
    /// Shuffle trade order (removes timing luck).
    #[default]
    ShuffleTrades,
    /// Bootstrap resampling (sample with replacement).
    Bootstrap,
}

/// Configuration for Monte Carlo simulation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonteCarloConfig {
    /// Number of simulation iterations.
    pub num_iterations: u32,
    /// Randomization method.
    pub method: RandomizationMethod,
    /// Confidence level (e.g., 0.95 for 95%).
    pub confidence_level: Decimal,
    /// Seed for reproducibility (None = random).
    pub seed: Option<u64>,
    /// Initial equity for calculations.
    pub initial_equity: Decimal,
}

impl Default for MonteCarloConfig {
    fn default() -> Self {
        Self {
            num_iterations: 5000,
            method: RandomizationMethod::ShuffleTrades,
            confidence_level: Decimal::new(95, 2), // 0.95
            seed: None,
            initial_equity: Decimal::new(100_000, 0),
        }
    }
}

/// Results from a single Monte Carlo iteration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IterationResult {
    /// Iteration index.
    pub iteration: u32,
    /// Total return for this iteration.
    pub total_return: Decimal,
    /// Sharpe ratio (if calculable).
    pub sharpe_ratio: Option<Decimal>,
    /// Maximum drawdown.
    pub max_drawdown: Decimal,
    /// Win rate.
    pub win_rate: Decimal,
    /// Profit factor.
    pub profit_factor: Option<Decimal>,
    /// Final equity.
    pub final_equity: Decimal,
}

/// Statistical distribution summary.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DistributionStats {
    /// Mean value.
    pub mean: Decimal,
    /// Median (50th percentile).
    pub median: Decimal,
    /// Standard deviation.
    pub std_dev: Decimal,
    /// Minimum value.
    pub min: Decimal,
    /// Maximum value.
    pub max: Decimal,
    /// 5th percentile (lower bound of CI).
    pub percentile_5: Decimal,
    /// 25th percentile.
    pub percentile_25: Decimal,
    /// 75th percentile.
    pub percentile_75: Decimal,
    /// 95th percentile (upper bound of CI).
    pub percentile_95: Decimal,
}

impl Default for DistributionStats {
    fn default() -> Self {
        Self {
            mean: Decimal::ZERO,
            median: Decimal::ZERO,
            std_dev: Decimal::ZERO,
            min: Decimal::ZERO,
            max: Decimal::ZERO,
            percentile_5: Decimal::ZERO,
            percentile_25: Decimal::ZERO,
            percentile_75: Decimal::ZERO,
            percentile_95: Decimal::ZERO,
        }
    }
}

/// Luck vs skill analysis results.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LuckVsSkillAnalysis {
    /// Original strategy return.
    pub original_return: Decimal,
    /// Percentile rank of original vs simulations (0-100).
    pub percentile_rank: Decimal,
    /// Assessment: `"SKILL"`, `"POSSIBLE_SKILL"`, `"LUCK"`, `"UNDERPERFORMANCE"`.
    pub assessment: String,
    /// Probability of achieving original return by chance.
    pub p_value: Decimal,
    /// Number of simulations with higher return.
    pub simulations_better: u32,
    /// Total simulations.
    pub total_simulations: u32,
}

/// Value at Risk (`VaR`) analysis.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaRAnalysis {
    /// Confidence level (e.g., 0.95).
    pub confidence_level: Decimal,
    /// Value at Risk (5th percentile return for 95% confidence).
    pub var: Decimal,
    /// Conditional `VaR` (expected loss given loss exceeds `VaR`).
    pub cvar: Decimal,
    /// Probability of negative returns.
    pub prob_negative: Decimal,
    /// Expected shortfall percentage.
    pub expected_shortfall_pct: Decimal,
}

/// Complete Monte Carlo simulation results.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonteCarloResult {
    /// Configuration used.
    pub config: MonteCarloConfig,
    /// Number of iterations completed.
    pub iterations_completed: u32,
    /// Original strategy metrics (non-randomized).
    pub original_metrics: IterationResult,
    /// Return distribution statistics.
    pub return_distribution: DistributionStats,
    /// Sharpe ratio distribution statistics.
    pub sharpe_distribution: Option<DistributionStats>,
    /// Max drawdown distribution statistics.
    pub drawdown_distribution: DistributionStats,
    /// Luck vs skill analysis.
    pub luck_vs_skill: LuckVsSkillAnalysis,
    /// Value at Risk analysis.
    pub var_analysis: VaRAnalysis,
    /// All iteration results (for detailed analysis).
    pub iterations: Vec<IterationResult>,
}

/// Monte Carlo simulator.
#[derive(Debug)]
pub struct MonteCarloSimulator {
    config: MonteCarloConfig,
    trades: Vec<TradeRecord>,
    rng_state: u64,
}

impl MonteCarloSimulator {
    /// Create a new Monte Carlo simulator.
    #[must_use]
    pub fn new(config: MonteCarloConfig, trades: Vec<TradeRecord>) -> Self {
        let rng_state = config.seed.unwrap_or_else(|| {
            // Use time-based seed if not provided
            let mut hasher = DefaultHasher::new();
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
                .hash(&mut hasher);
            hasher.finish()
        });

        Self {
            config,
            trades,
            rng_state,
        }
    }

    /// Run the Monte Carlo simulation.
    pub fn run(&mut self) -> MonteCarloResult {
        info!(
            iterations = self.config.num_iterations,
            trades = self.trades.len(),
            method = ?self.config.method,
            "Running Monte Carlo simulation"
        );

        // Calculate original metrics first
        let original_metrics = self.calculate_iteration_metrics(&self.trades, 0);

        // Run simulations
        let mut iterations = Vec::with_capacity(self.config.num_iterations as usize);

        for i in 1..=self.config.num_iterations {
            let randomized_trades = self.randomize_trades();
            let result = self.calculate_iteration_metrics(&randomized_trades, i);
            iterations.push(result);

            if i % 1000 == 0 {
                debug!(iteration = i, "Monte Carlo progress");
            }
        }

        // Calculate distribution statistics
        let returns: Vec<Decimal> = iterations.iter().map(|r| r.total_return).collect();
        let return_distribution = calculate_distribution_stats(&returns);

        let sharpes: Vec<Decimal> = iterations.iter().filter_map(|r| r.sharpe_ratio).collect();
        let sharpe_distribution = if sharpes.len() > 10 {
            Some(calculate_distribution_stats(&sharpes))
        } else {
            None
        };

        let drawdowns: Vec<Decimal> = iterations.iter().map(|r| r.max_drawdown).collect();
        let drawdown_distribution = calculate_distribution_stats(&drawdowns);

        // Luck vs skill analysis
        let luck_vs_skill = Self::analyze_luck_vs_skill(&original_metrics, &iterations);

        // VaR analysis
        let var_analysis = self.calculate_var(&returns);

        MonteCarloResult {
            config: self.config.clone(),
            iterations_completed: self.config.num_iterations,
            original_metrics,
            return_distribution,
            sharpe_distribution,
            drawdown_distribution,
            luck_vs_skill,
            var_analysis,
            iterations,
        }
    }

    /// Randomize trades based on configured method.
    fn randomize_trades(&mut self) -> Vec<TradeRecord> {
        match self.config.method {
            RandomizationMethod::ShuffleTrades => self.shuffle_trades(),
            RandomizationMethod::Bootstrap => self.bootstrap_trades(),
        }
    }

    /// Shuffle trade order (Fisher-Yates algorithm).
    fn shuffle_trades(&mut self) -> Vec<TradeRecord> {
        let mut shuffled = self.trades.clone();
        let n = shuffled.len();

        for i in (1..n).rev() {
            // Random index selection: u64 % (i+1) is safe since i+1 <= n <= trades.len()
            #[allow(clippy::cast_possible_truncation)]
            let j = (self.next_random() % (i as u64 + 1)) as usize;
            shuffled.swap(i, j);
        }

        shuffled
    }

    /// Bootstrap resampling (sample with replacement).
    fn bootstrap_trades(&mut self) -> Vec<TradeRecord> {
        let n = self.trades.len();
        let mut sampled = Vec::with_capacity(n);

        for _ in 0..n {
            // Random index selection: result is bounded by n which fits in usize
            #[allow(clippy::cast_possible_truncation)]
            let idx = (self.next_random() % n as u64) as usize;
            sampled.push(self.trades[idx].clone());
        }

        sampled
    }

    /// Generate next random number (xorshift64).
    const fn next_random(&mut self) -> u64 {
        let mut x = self.rng_state;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.rng_state = x;
        x
    }

    /// Calculate metrics for a set of trades.
    fn calculate_iteration_metrics(
        &self,
        trades: &[TradeRecord],
        iteration: u32,
    ) -> IterationResult {
        let mut calc = PerformanceCalculator::new(self.config.initial_equity);

        // Build equity curve from trades
        let mut equity = self.config.initial_equity;
        for trade in trades {
            calc.add_trade(trade.clone());
            equity += trade.net_pnl;
            calc.add_equity_point(&trade.exit_time, equity);
        }

        let summary = calc.calculate();

        IterationResult {
            iteration,
            total_return: summary.total_return,
            sharpe_ratio: summary.sharpe_ratio,
            max_drawdown: summary.max_drawdown,
            win_rate: summary.win_rate,
            profit_factor: summary.profit_factor,
            final_equity: summary.final_equity,
        }
    }

    /// Analyze luck vs skill.
    fn analyze_luck_vs_skill(
        original: &IterationResult,
        iterations: &[IterationResult],
    ) -> LuckVsSkillAnalysis {
        let original_return = original.total_return;

        // Count how many simulations beat the original
        // Count is bounded by iterations.len() which should fit in u32 for practical use
        #[allow(clippy::cast_possible_truncation)]
        let simulations_better = iterations
            .iter()
            .filter(|r| r.total_return >= original_return)
            .count() as u32;

        #[allow(clippy::cast_possible_truncation)]
        let total = iterations.len() as u32;

        // Percentile rank (100 = best, 0 = worst)
        let percentile_rank = if total > 0 {
            Decimal::ONE_HUNDRED
                - (Decimal::from(simulations_better) / Decimal::from(total) * Decimal::ONE_HUNDRED)
        } else {
            Decimal::new(50, 0)
        };

        // P-value (probability of achieving by chance)
        let p_value = if total > 0 {
            Decimal::from(simulations_better) / Decimal::from(total)
        } else {
            Decimal::ONE
        };

        // Assessment based on percentile rank
        let assessment = if percentile_rank >= Decimal::new(95, 0) {
            "SKILL".to_string()
        } else if percentile_rank >= Decimal::new(75, 0) {
            "POSSIBLE_SKILL".to_string()
        } else if percentile_rank >= Decimal::new(25, 0) {
            "LUCK".to_string()
        } else {
            "UNDERPERFORMANCE".to_string()
        };

        LuckVsSkillAnalysis {
            original_return,
            percentile_rank,
            assessment,
            p_value,
            simulations_better,
            total_simulations: total,
        }
    }

    /// Calculate Value at Risk and Conditional `VaR`.
    fn calculate_var(&self, returns: &[Decimal]) -> VaRAnalysis {
        if returns.is_empty() {
            return VaRAnalysis {
                confidence_level: self.config.confidence_level,
                var: Decimal::ZERO,
                cvar: Decimal::ZERO,
                prob_negative: Decimal::ZERO,
                expected_shortfall_pct: Decimal::ZERO,
            };
        }

        let mut sorted = returns.to_vec();
        sorted.sort();

        let n = sorted.len();

        // VaR at confidence level (e.g., 5th percentile for 95% confidence)
        let var_percentile = Decimal::ONE - self.config.confidence_level;
        // Precision loss acceptable for index calculation (approximate percentile)
        #[allow(
            clippy::cast_precision_loss,
            clippy::cast_possible_truncation,
            clippy::cast_sign_loss
        )]
        let var_idx = ((Decimal::from(n as u64) * var_percentile)
            .to_f64()
            .unwrap_or(0.0) as usize)
            .min(n - 1);
        let var = sorted[var_idx];

        // CVaR (average of returns below VaR)
        let below_var: Vec<Decimal> = sorted.iter().take(var_idx + 1).copied().collect();
        // Precision loss acceptable: below_var.len() is bounded by returns.len()
        #[allow(clippy::cast_precision_loss)]
        let cvar = if !below_var.is_empty() {
            below_var.iter().sum::<Decimal>() / Decimal::from(below_var.len() as u64)
        } else {
            var
        };

        // Probability of negative returns
        // Precision loss acceptable: counts fit in reasonable bounds for simulation
        #[allow(clippy::cast_precision_loss)]
        let negative_count = returns.iter().filter(|r| **r < Decimal::ZERO).count();
        #[allow(clippy::cast_precision_loss)]
        let prob_negative = Decimal::from(negative_count as u64) / Decimal::from(n as u64);

        // Expected shortfall as percentage of initial equity
        let expected_shortfall_pct = if cvar < Decimal::ZERO {
            cvar.abs() * Decimal::ONE_HUNDRED
        } else {
            Decimal::ZERO
        };

        VaRAnalysis {
            confidence_level: self.config.confidence_level,
            var,
            cvar,
            prob_negative,
            expected_shortfall_pct,
        }
    }
}

/// Calculate distribution statistics for a set of values.
#[allow(
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss
)]
fn calculate_distribution_stats(values: &[Decimal]) -> DistributionStats {
    if values.is_empty() {
        return DistributionStats::default();
    }

    let n = values.len();
    let mut sorted = values.to_vec();
    sorted.sort();

    // Mean - precision loss acceptable for statistical calculation
    let sum: Decimal = values.iter().sum();
    let mean = sum / Decimal::from(n as u64);

    // Median
    let median = if n % 2 == 0 {
        (sorted[n / 2 - 1] + sorted[n / 2]) / Decimal::TWO
    } else {
        sorted[n / 2]
    };

    // Standard deviation - precision loss acceptable for statistical calculation
    let variance_sum: Decimal = values.iter().map(|v| (*v - mean) * (*v - mean)).sum();
    let variance = if n > 1 {
        variance_sum / Decimal::from((n - 1) as u64)
    } else {
        Decimal::ZERO
    };
    let std_dev = sqrt_decimal(variance);

    // Min/Max
    let min = sorted[0];
    let max = sorted[n - 1];

    // Percentiles - precision/truncation acceptable for index calculation
    let pctl_05 = sorted[(n as f64 * 0.05) as usize];
    let pctl_25 = sorted[(n as f64 * 0.25) as usize];
    let pctl_75 = sorted[((n as f64 * 0.75) as usize).min(n - 1)];
    let pctl_95 = sorted[((n as f64 * 0.95) as usize).min(n - 1)];

    DistributionStats {
        mean,
        median,
        std_dev,
        min,
        max,
        percentile_5: pctl_05,
        percentile_25: pctl_25,
        percentile_75: pctl_75,
        percentile_95: pctl_95,
    }
}

/// Approximate square root using Newton's method.
fn sqrt_decimal(value: Decimal) -> Decimal {
    if value <= Decimal::ZERO {
        return Decimal::ZERO;
    }

    let mut guess = value / Decimal::TWO;
    let tolerance = Decimal::new(1, 10); // 0.0000000001

    for _ in 0..50 {
        let next = (guess + value / guess) / Decimal::TWO;
        if (next - guess).abs() < tolerance {
            return next;
        }
        guess = next;
    }

    guess
}

/// Builder for Monte Carlo simulation.
#[derive(Debug, Default)]
pub struct MonteCarloBuilder {
    config: MonteCarloConfig,
    trades: Vec<TradeRecord>,
}

impl MonteCarloBuilder {
    /// Create a new builder.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Set number of iterations.
    #[must_use]
    pub const fn iterations(mut self, n: u32) -> Self {
        self.config.num_iterations = n;
        self
    }

    /// Set randomization method.
    #[must_use]
    pub const fn method(mut self, method: RandomizationMethod) -> Self {
        self.config.method = method;
        self
    }

    /// Set confidence level.
    #[must_use]
    pub const fn confidence_level(mut self, level: Decimal) -> Self {
        self.config.confidence_level = level;
        self
    }

    /// Set random seed for reproducibility.
    #[must_use]
    pub const fn seed(mut self, seed: u64) -> Self {
        self.config.seed = Some(seed);
        self
    }

    /// Set initial equity.
    #[must_use]
    pub const fn initial_equity(mut self, equity: Decimal) -> Self {
        self.config.initial_equity = equity;
        self
    }

    /// Add trades.
    #[must_use]
    pub fn trades(mut self, trades: Vec<TradeRecord>) -> Self {
        self.trades = trades;
        self
    }

    /// Build the simulator.
    #[must_use]
    pub fn build(self) -> MonteCarloSimulator {
        MonteCarloSimulator::new(self.config, self.trades)
    }
}

#[cfg(test)]
mod tests {
    use super::super::metrics::ExitReason;
    use super::*;

    fn make_trade(id: &str, net_pnl: i64) -> TradeRecord {
        TradeRecord {
            trade_id: id.to_string(),
            instrument_id: "AAPL".to_string(),
            side: "LONG".to_string(),
            entry_time: "2024-01-01T10:00:00Z".to_string(),
            entry_price: Decimal::new(100, 0),
            entry_slippage_bps: Decimal::ZERO,
            exit_time: "2024-01-01T14:00:00Z".to_string(),
            exit_price: Decimal::new(100, 0),
            exit_slippage_bps: Decimal::ZERO,
            exit_reason: ExitReason::Target,
            quantity: Decimal::new(100, 0),
            gross_pnl: Decimal::new(net_pnl, 0),
            commission: Decimal::ZERO,
            net_pnl: Decimal::new(net_pnl, 0),
            holding_period_hours: Decimal::new(4, 0),
        }
    }

    fn sample_trades() -> Vec<TradeRecord> {
        vec![
            make_trade("1", 500),
            make_trade("2", -200),
            make_trade("3", 300),
            make_trade("4", 100),
            make_trade("5", -150),
            make_trade("6", 400),
            make_trade("7", -100),
            make_trade("8", 250),
            make_trade("9", 350),
            make_trade("10", -50),
        ]
    }

    #[test]
    fn test_config_default() {
        let config = MonteCarloConfig::default();
        assert_eq!(config.num_iterations, 5000);
        assert_eq!(config.method, RandomizationMethod::ShuffleTrades);
    }

    #[test]
    fn test_shuffle_trades() {
        let trades = sample_trades();
        let config = MonteCarloConfig {
            seed: Some(12345),
            ..Default::default()
        };

        let mut sim = MonteCarloSimulator::new(config, trades.clone());
        let shuffled = sim.shuffle_trades();

        // Should have same length
        assert_eq!(shuffled.len(), trades.len());

        // Should be different order (with high probability)
        let same_order = shuffled
            .iter()
            .zip(trades.iter())
            .all(|(a, b)| a.trade_id == b.trade_id);
        assert!(!same_order, "Shuffled trades should have different order");
    }

    #[test]
    fn test_bootstrap_trades() {
        let trades = sample_trades();
        let config = MonteCarloConfig {
            seed: Some(12345),
            method: RandomizationMethod::Bootstrap,
            ..Default::default()
        };

        let mut sim = MonteCarloSimulator::new(config, trades.clone());
        let bootstrapped = sim.bootstrap_trades();

        // Should have same length
        assert_eq!(bootstrapped.len(), trades.len());

        // Bootstrap may have duplicates
        // (not guaranteed but likely with 10 trades)
    }

    #[test]
    fn test_monte_carlo_run() {
        let trades = sample_trades();
        let config = MonteCarloConfig {
            num_iterations: 100, // Small for test speed
            seed: Some(42),
            ..Default::default()
        };

        let mut sim = MonteCarloSimulator::new(config, trades);
        let result = sim.run();

        assert_eq!(result.iterations_completed, 100);
        assert_eq!(result.iterations.len(), 100);

        // Return distribution should have valid stats
        assert!(result.return_distribution.mean != Decimal::ZERO);
        assert!(result.return_distribution.std_dev >= Decimal::ZERO);
    }

    #[test]
    fn test_distribution_stats() {
        let values = vec![
            Decimal::new(10, 0),
            Decimal::new(20, 0),
            Decimal::new(30, 0),
            Decimal::new(40, 0),
            Decimal::new(50, 0),
        ];

        let stats = calculate_distribution_stats(&values);

        // Mean = (10+20+30+40+50)/5 = 30
        assert_eq!(stats.mean, Decimal::new(30, 0));

        // Median = 30 (middle value)
        assert_eq!(stats.median, Decimal::new(30, 0));

        // Min/Max
        assert_eq!(stats.min, Decimal::new(10, 0));
        assert_eq!(stats.max, Decimal::new(50, 0));
    }

    #[test]
    fn test_luck_vs_skill_analysis() {
        let trades = sample_trades();
        let config = MonteCarloConfig {
            num_iterations: 100,
            seed: Some(42),
            ..Default::default()
        };

        let mut sim = MonteCarloSimulator::new(config, trades);
        let result = sim.run();

        // Should have valid analysis
        assert!(result.luck_vs_skill.percentile_rank >= Decimal::ZERO);
        assert!(result.luck_vs_skill.percentile_rank <= Decimal::ONE_HUNDRED);
        assert!(result.luck_vs_skill.p_value >= Decimal::ZERO);
        assert!(result.luck_vs_skill.p_value <= Decimal::ONE);
    }

    #[test]
    fn test_var_analysis() {
        let trades = sample_trades();
        let config = MonteCarloConfig {
            num_iterations: 100,
            seed: Some(42),
            confidence_level: Decimal::new(95, 2),
            ..Default::default()
        };

        let mut sim = MonteCarloSimulator::new(config, trades);
        let result = sim.run();

        // VaR analysis should be populated
        assert_eq!(result.var_analysis.confidence_level, Decimal::new(95, 2));
        assert!(result.var_analysis.prob_negative >= Decimal::ZERO);
        assert!(result.var_analysis.prob_negative <= Decimal::ONE);
    }

    #[test]
    fn test_builder() {
        let trades = sample_trades();

        let mut sim = MonteCarloBuilder::new()
            .iterations(50)
            .method(RandomizationMethod::Bootstrap)
            .confidence_level(Decimal::new(90, 2))
            .seed(99)
            .initial_equity(Decimal::new(50000, 0))
            .trades(trades)
            .build();

        let result = sim.run();

        assert_eq!(result.iterations_completed, 50);
        assert_eq!(result.config.method, RandomizationMethod::Bootstrap);
    }

    #[test]
    fn test_sqrt_decimal() {
        let sqrt4 = sqrt_decimal(Decimal::new(4, 0));
        assert!((sqrt4 - Decimal::new(2, 0)).abs() < Decimal::new(1, 6));

        let sqrt_zero = sqrt_decimal(Decimal::ZERO);
        assert_eq!(sqrt_zero, Decimal::ZERO);

        let sqrt_neg = sqrt_decimal(Decimal::new(-1, 0));
        assert_eq!(sqrt_neg, Decimal::ZERO);
    }

    #[test]
    fn test_reproducibility_with_seed() {
        let trades = sample_trades();

        let config1 = MonteCarloConfig {
            num_iterations: 20,
            seed: Some(12345),
            ..Default::default()
        };

        let config2 = MonteCarloConfig {
            num_iterations: 20,
            seed: Some(12345),
            ..Default::default()
        };

        let mut sim1 = MonteCarloSimulator::new(config1, trades.clone());
        let mut sim2 = MonteCarloSimulator::new(config2, trades);

        let result1 = sim1.run();
        let result2 = sim2.run();

        // With same seed, results should be identical
        assert_eq!(
            result1.return_distribution.mean,
            result2.return_distribution.mean
        );
    }

    #[test]
    fn test_empty_trades() {
        let config = MonteCarloConfig {
            num_iterations: 10,
            ..Default::default()
        };

        let mut sim = MonteCarloSimulator::new(config, vec![]);
        let result = sim.run();

        assert_eq!(result.original_metrics.total_return, Decimal::ZERO);
    }
}
