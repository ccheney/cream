//! Implied Volatility Solver
//!
//! Computes implied volatility from market prices using multiple methods:
//! - Newton-Raphson: Fast convergence (2-4 iterations) for well-behaved cases
//! - Modified Corrado-Miller: Initial guess for Newton-Raphson
//! - Bisection: Guaranteed convergence for edge cases (deep ITM/OTM)
//! - Hybrid: Newton-Raphson with bisection fallback
//!
//! Reference: docs/plans/09-rust-core.md (IV Computation, lines 366-386)

// Black-Scholes uses standard mathematical notation (s, k, t, r, q, sigma)
// Financial formulas use standard notation where mul_add() obscures meaning
#![allow(clippy::many_single_char_names)]
#![allow(clippy::suboptimal_flops)]

use rust_decimal::Decimal;
use rust_decimal::prelude::ToPrimitive;
use serde::{Deserialize, Serialize};
use std::f64::consts::PI;
use thiserror::Error;

// ============================================================================
// Error Types
// ============================================================================

/// Errors from IV computation.
#[derive(Debug, Error)]
pub enum IvError {
    /// Convergence failed after max iterations.
    #[error(
        "IV solver failed to converge after {iterations} iterations (last error: {last_error:.6})"
    )]
    ConvergenceFailed {
        /// Number of iterations attempted.
        iterations: u32,
        /// Last price error.
        last_error: f64,
    },

    /// Invalid input parameters.
    #[error("Invalid input: {message}")]
    InvalidInput {
        /// Error message.
        message: String,
    },

    /// No solution exists (e.g., price below intrinsic value).
    #[error("No valid IV solution: {reason}")]
    NoSolution {
        /// Reason no solution exists.
        reason: String,
    },
}

// ============================================================================
// Configuration
// ============================================================================

/// Configuration for IV solver.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IvSolverConfig {
    /// Maximum iterations for Newton-Raphson.
    pub max_iterations: u32,
    /// Convergence tolerance (absolute price error).
    pub tolerance: f64,
    /// Minimum volatility bound (e.g., 0.01 = 1%).
    pub min_vol: f64,
    /// Maximum volatility bound (e.g., 5.0 = 500%).
    pub max_vol: f64,
    /// Switch to bisection when strike is this far from money (e.g., 0.20 = 20%).
    pub hybrid_threshold: f64,
}

impl Default for IvSolverConfig {
    fn default() -> Self {
        Self {
            max_iterations: 100,
            tolerance: 1e-8,
            min_vol: 0.001,
            max_vol: 5.0,
            hybrid_threshold: 0.20,
        }
    }
}

/// Option type for IV computation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OptionKind {
    /// Call option.
    Call,
    /// Put option.
    Put,
}

// ============================================================================
// Black-Scholes Helpers
// ============================================================================

/// Standard normal CDF (cumulative distribution function).
fn norm_cdf(x: f64) -> f64 {
    0.5 * (1.0 + libm::erf(x / std::f64::consts::SQRT_2))
}

/// Standard normal PDF (probability density function).
fn norm_pdf(x: f64) -> f64 {
    (-0.5 * x * x).exp() / (2.0 * PI).sqrt()
}

/// Black-Scholes d1 parameter.
fn d1(s: f64, k: f64, t: f64, r: f64, q: f64, sigma: f64) -> f64 {
    ((s / k).ln() + (r - q + 0.5 * sigma * sigma) * t) / (sigma * t.sqrt())
}

/// Black-Scholes d2 parameter.
fn d2(s: f64, k: f64, t: f64, r: f64, q: f64, sigma: f64) -> f64 {
    d1(s, k, t, r, q, sigma) - sigma * t.sqrt()
}

/// Black-Scholes call price.
fn bs_call(s: f64, k: f64, t: f64, r: f64, q: f64, sigma: f64) -> f64 {
    let d1_val = d1(s, k, t, r, q, sigma);
    let d2_val = d2(s, k, t, r, q, sigma);
    s * (-q * t).exp() * norm_cdf(d1_val) - k * (-r * t).exp() * norm_cdf(d2_val)
}

/// Black-Scholes put price.
fn bs_put(s: f64, k: f64, t: f64, r: f64, q: f64, sigma: f64) -> f64 {
    let d1_val = d1(s, k, t, r, q, sigma);
    let d2_val = d2(s, k, t, r, q, sigma);
    k * (-r * t).exp() * norm_cdf(-d2_val) - s * (-q * t).exp() * norm_cdf(-d1_val)
}

/// Black-Scholes price for either call or put.
fn bs_price(s: f64, k: f64, t: f64, r: f64, q: f64, sigma: f64, kind: OptionKind) -> f64 {
    match kind {
        OptionKind::Call => bs_call(s, k, t, r, q, sigma),
        OptionKind::Put => bs_put(s, k, t, r, q, sigma),
    }
}

/// Black-Scholes vega (same for calls and puts).
fn bs_vega(s: f64, k: f64, t: f64, r: f64, q: f64, sigma: f64) -> f64 {
    let d1_val = d1(s, k, t, r, q, sigma);
    s * (-q * t).exp() * norm_pdf(d1_val) * t.sqrt()
}

// ============================================================================
// IV Solvers
// ============================================================================

/// Implied Volatility Solver.
#[derive(Debug, Clone)]
pub struct IvSolver {
    config: IvSolverConfig,
}

impl Default for IvSolver {
    fn default() -> Self {
        Self::new(IvSolverConfig::default())
    }
}

impl IvSolver {
    /// Create a new IV solver with the given configuration.
    #[must_use]
    pub const fn new(config: IvSolverConfig) -> Self {
        Self { config }
    }

    /// Compute implied volatility using the hybrid approach.
    ///
    /// Uses Newton-Raphson for near-the-money options and bisection
    /// for far-from-the-money options where vega is small.
    ///
    /// # Arguments
    ///
    /// * `market_price` - Observed market price of the option
    /// * `s` - Current stock price
    /// * `k` - Strike price
    /// * `t` - Time to expiration (years)
    /// * `r` - Risk-free rate (annualized)
    /// * `q` - Dividend yield (continuous)
    /// * `kind` - Option type (Call or Put)
    ///
    /// # Errors
    ///
    /// Returns an error if the solver fails to converge or inputs are invalid.
    #[allow(clippy::too_many_arguments)]
    pub fn solve(
        &self,
        market_price: f64,
        s: f64,
        k: f64,
        t: f64,
        r: f64,
        q: f64,
        kind: OptionKind,
    ) -> Result<f64, IvError> {
        // Validate inputs
        Self::validate_inputs(market_price, s, k, t)?;

        // Check if option has time value
        let intrinsic = match kind {
            OptionKind::Call => (s * (-q * t).exp() - k * (-r * t).exp()).max(0.0),
            OptionKind::Put => (k * (-r * t).exp() - s * (-q * t).exp()).max(0.0),
        };

        if market_price < intrinsic - self.config.tolerance {
            return Err(IvError::NoSolution {
                reason: format!(
                    "Market price ({market_price:.4}) is below intrinsic value ({intrinsic:.4})"
                ),
            });
        }

        // Determine moneyness to choose solver
        let moneyness = ((s / k).ln()).abs();

        if moneyness > self.config.hybrid_threshold {
            // Far from money - use bisection for robustness
            self.bisection(market_price, s, k, t, r, q, kind)
        } else {
            // Near the money - use Newton-Raphson for speed
            let initial_guess = self.corrado_miller_guess(market_price, s, k, t, r, q, kind);
            self.newton_raphson(market_price, s, k, t, r, q, kind, initial_guess)
                .or_else(|_| {
                    // Fallback to bisection
                    self.bisection(market_price, s, k, t, r, q, kind)
                })
        }
    }

    /// Validate input parameters.
    fn validate_inputs(market_price: f64, s: f64, k: f64, t: f64) -> Result<(), IvError> {
        if market_price <= 0.0 {
            return Err(IvError::InvalidInput {
                message: format!("Market price must be positive, got: {market_price}"),
            });
        }
        if s <= 0.0 {
            return Err(IvError::InvalidInput {
                message: format!("Stock price must be positive, got: {s}"),
            });
        }
        if k <= 0.0 {
            return Err(IvError::InvalidInput {
                message: format!("Strike price must be positive, got: {k}"),
            });
        }
        if t <= 0.0 {
            return Err(IvError::InvalidInput {
                message: format!("Time to expiration must be positive, got: {t}"),
            });
        }
        Ok(())
    }

    /// Modified Corrado-Miller initial guess for Newton-Raphson.
    ///
    /// Provides a good starting point that typically converges in 2-4 iterations.
    #[allow(clippy::too_many_arguments)]
    fn corrado_miller_guess(
        &self,
        market_price: f64,
        s: f64,
        k: f64,
        t: f64,
        r: f64,
        q: f64,
        kind: OptionKind,
    ) -> f64 {
        // Forward price
        let f = s * ((r - q) * t).exp();
        let df = (-r * t).exp();

        // Convert to call price if put (put-call parity)
        let call_price = match kind {
            OptionKind::Call => market_price,
            OptionKind::Put => market_price + df * (f - k),
        };

        // Corrado-Miller approximation
        let x = f - k;
        let y = call_price / df;

        // Handle edge cases
        if y <= 0.0 {
            return 0.30; // Default guess
        }

        // Approximation formula
        let numerator = y - 0.5 * x;
        let sqrt_term = (y - 0.5 * x).powi(2) - (x.powi(2) / PI);

        if sqrt_term < 0.0 {
            return 0.30;
        }

        let sigma_approx = (PI / (2.0 * t)).sqrt() * (numerator + sqrt_term.sqrt()) / f;

        // Clamp to valid range
        sigma_approx.clamp(self.config.min_vol, self.config.max_vol)
    }

    /// Newton-Raphson IV solver.
    ///
    /// Fast convergence (typically 2-4 iterations) when close to solution.
    #[allow(clippy::too_many_arguments)]
    fn newton_raphson(
        &self,
        market_price: f64,
        s: f64,
        k: f64,
        t: f64,
        r: f64,
        q: f64,
        kind: OptionKind,
        initial_guess: f64,
    ) -> Result<f64, IvError> {
        let mut sigma = initial_guess.clamp(self.config.min_vol, self.config.max_vol);

        for i in 0..self.config.max_iterations {
            let price = bs_price(s, k, t, r, q, sigma, kind);
            let error = price - market_price;

            if error.abs() < self.config.tolerance {
                return Ok(sigma);
            }

            let vega = bs_vega(s, k, t, r, q, sigma);

            // Check for near-zero vega (edge case)
            if vega.abs() < 1e-12 {
                // Vega too small, switch to bisection
                return Err(IvError::ConvergenceFailed {
                    iterations: i,
                    last_error: error.abs(),
                });
            }

            // Newton-Raphson update
            sigma -= error / vega;

            // Clamp to valid range
            sigma = sigma.clamp(self.config.min_vol, self.config.max_vol);
        }

        Err(IvError::ConvergenceFailed {
            iterations: self.config.max_iterations,
            last_error: (bs_price(s, k, t, r, q, sigma, kind) - market_price).abs(),
        })
    }

    /// Bisection IV solver.
    ///
    /// Guaranteed convergence but slower than Newton-Raphson.
    /// Used as fallback for deep ITM/OTM options.
    #[allow(clippy::too_many_arguments)]
    fn bisection(
        &self,
        market_price: f64,
        s: f64,
        k: f64,
        t: f64,
        r: f64,
        q: f64,
        kind: OptionKind,
    ) -> Result<f64, IvError> {
        let mut low = self.config.min_vol;
        let mut high = self.config.max_vol;

        // Verify solution exists in range
        let price_low = bs_price(s, k, t, r, q, low, kind);
        let price_high = bs_price(s, k, t, r, q, high, kind);

        if market_price < price_low {
            return Err(IvError::NoSolution {
                reason: format!(
                    "Market price ({market_price:.4}) is below minimum theoretical price ({price_low:.4})"
                ),
            });
        }
        if market_price > price_high {
            return Err(IvError::NoSolution {
                reason: format!(
                    "Market price ({market_price:.4}) exceeds maximum theoretical price ({price_high:.4})"
                ),
            });
        }

        for _i in 0..self.config.max_iterations {
            let mid = low.midpoint(high);
            let price = bs_price(s, k, t, r, q, mid, kind);
            let error = price - market_price;

            if error.abs() < self.config.tolerance {
                return Ok(mid);
            }

            if error > 0.0 {
                high = mid;
            } else {
                low = mid;
            }

            // Check convergence on sigma
            if (high - low) < 1e-10 {
                return Ok(mid);
            }
        }

        Err(IvError::ConvergenceFailed {
            iterations: self.config.max_iterations,
            last_error: (bs_price(s, k, t, r, q, low.midpoint(high), kind) - market_price).abs(),
        })
    }

    /// Solve IV from Decimal inputs (convenience method).
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - The input price is invalid (negative, exceeds intrinsic bounds)
    /// - The solver fails to converge within the maximum iterations
    #[allow(clippy::too_many_arguments)]
    pub fn solve_decimal(
        &self,
        market_price: Decimal,
        s: Decimal,
        k: Decimal,
        t: Decimal,
        r: Decimal,
        q: Decimal,
        kind: OptionKind,
    ) -> Result<Decimal, IvError> {
        let iv = self.solve(
            market_price.to_f64().unwrap_or(0.0),
            s.to_f64().unwrap_or(0.0),
            k.to_f64().unwrap_or(0.0),
            t.to_f64().unwrap_or(0.0),
            r.to_f64().unwrap_or(0.0),
            q.to_f64().unwrap_or(0.0),
            kind,
        )?;

        Ok(Decimal::from_f64_retain(iv).unwrap_or(Decimal::ZERO))
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn approx_eq(a: f64, b: f64, tolerance: f64) -> bool {
        (a - b).abs() < tolerance
    }

    #[test]
    fn test_norm_cdf() {
        assert!(approx_eq(norm_cdf(0.0), 0.5, 1e-6));
        assert!(approx_eq(norm_cdf(1.96), 0.975, 0.001));
        assert!(approx_eq(norm_cdf(-1.96), 0.025, 0.001));
    }

    #[test]
    fn test_bs_call_atm() {
        // ATM call: S=100, K=100, T=1, r=0.05, q=0, sigma=0.20
        let price = bs_call(100.0, 100.0, 1.0, 0.05, 0.0, 0.20);
        // Expected ~ 10.45 (from Black-Scholes tables)
        assert!(approx_eq(price, 10.45, 0.1));
    }

    #[test]
    fn test_bs_put_atm() {
        // ATM put: S=100, K=100, T=1, r=0.05, q=0, sigma=0.20
        let price = bs_put(100.0, 100.0, 1.0, 0.05, 0.0, 0.20);
        // Expected ~ 5.57 (from put-call parity)
        assert!(approx_eq(price, 5.57, 0.1));
    }

    #[test]
    fn test_iv_solver_atm_call() {
        let solver = IvSolver::default();

        // ATM call with known IV
        let s = 100.0;
        let k = 100.0;
        let t = 1.0;
        let r = 0.05;
        let q = 0.0;
        let true_iv = 0.25;

        let market_price = bs_call(s, k, t, r, q, true_iv);
        let computed_iv = match solver.solve(market_price, s, k, t, r, q, OptionKind::Call) {
            Ok(iv) => iv,
            Err(e) => panic!("IV solver should converge for ATM call: {e}"),
        };

        assert!(approx_eq(computed_iv, true_iv, 0.001));
    }

    #[test]
    fn test_iv_solver_atm_put() {
        let solver = IvSolver::default();

        // ATM put with known IV
        let s = 100.0;
        let k = 100.0;
        let t = 0.5;
        let r = 0.03;
        let q = 0.01;
        let true_iv = 0.30;

        let market_price = bs_put(s, k, t, r, q, true_iv);
        let computed_iv = match solver.solve(market_price, s, k, t, r, q, OptionKind::Put) {
            Ok(iv) => iv,
            Err(e) => panic!("IV solver should converge for ATM put: {e}"),
        };

        assert!(approx_eq(computed_iv, true_iv, 0.001));
    }

    #[test]
    fn test_iv_solver_otm_call() {
        let solver = IvSolver::default();

        // OTM call (should use bisection)
        let s = 100.0;
        let k = 130.0; // 30% OTM
        let t = 0.25;
        let r = 0.05;
        let q = 0.0;
        let true_iv = 0.35;

        let market_price = bs_call(s, k, t, r, q, true_iv);
        let computed_iv = match solver.solve(market_price, s, k, t, r, q, OptionKind::Call) {
            Ok(iv) => iv,
            Err(e) => panic!("IV solver should converge for OTM call: {e}"),
        };

        assert!(approx_eq(computed_iv, true_iv, 0.01));
    }

    #[test]
    fn test_iv_solver_itm_put() {
        let solver = IvSolver::default();

        // ITM put
        let s = 100.0;
        let k = 120.0; // 20% ITM
        let t = 0.5;
        let r = 0.04;
        let q = 0.02;
        let true_iv = 0.28;

        let market_price = bs_put(s, k, t, r, q, true_iv);
        let computed_iv = match solver.solve(market_price, s, k, t, r, q, OptionKind::Put) {
            Ok(iv) => iv,
            Err(e) => panic!("IV solver should converge for ITM put: {e}"),
        };

        assert!(approx_eq(computed_iv, true_iv, 0.01));
    }

    #[test]
    fn test_iv_solver_invalid_price() {
        let solver = IvSolver::default();

        let result = solver.solve(-1.0, 100.0, 100.0, 1.0, 0.05, 0.0, OptionKind::Call);
        assert!(result.is_err());
    }

    #[test]
    fn test_iv_solver_below_intrinsic() {
        let solver = IvSolver::default();

        // Price below intrinsic value (impossible for real options)
        let s = 120.0;
        let k = 100.0;
        let t = 0.5;
        let r = 0.05;
        let q = 0.0;
        // Intrinsic value ~ 20, try price of 15
        let result = solver.solve(15.0, s, k, t, r, q, OptionKind::Call);
        assert!(result.is_err());
    }

    #[test]
    fn test_corrado_miller_guess() {
        let solver = IvSolver::default();

        // ATM call
        let s = 100.0;
        let k = 100.0;
        let t = 1.0;
        let r = 0.05;
        let q = 0.0;
        let true_iv = 0.25;

        let market_price = bs_call(s, k, t, r, q, true_iv);
        let guess = solver.corrado_miller_guess(market_price, s, k, t, r, q, OptionKind::Call);

        // Guess should be within 10% of true IV
        assert!(approx_eq(guess, true_iv, 0.10));
    }

    #[test]
    fn test_iv_solver_high_iv() {
        let solver = IvSolver::default();

        // High IV scenario (meme stock)
        let s = 50.0;
        let k = 50.0;
        let t = 0.1;
        let r = 0.05;
        let q = 0.0;
        let true_iv = 1.50; // 150% IV

        let market_price = bs_call(s, k, t, r, q, true_iv);
        let computed_iv = match solver.solve(market_price, s, k, t, r, q, OptionKind::Call) {
            Ok(iv) => iv,
            Err(e) => panic!("IV solver should converge for high IV: {e}"),
        };

        assert!(approx_eq(computed_iv, true_iv, 0.02));
    }

    #[test]
    fn test_iv_solver_low_iv() {
        let solver = IvSolver::default();

        // Low IV scenario
        let s = 100.0;
        let k = 100.0;
        let t = 1.0;
        let r = 0.02;
        let q = 0.0;
        let true_iv = 0.08; // 8% IV

        let market_price = bs_call(s, k, t, r, q, true_iv);
        let computed_iv = match solver.solve(market_price, s, k, t, r, q, OptionKind::Call) {
            Ok(iv) => iv,
            Err(e) => panic!("IV solver should converge for low IV: {e}"),
        };

        assert!(approx_eq(computed_iv, true_iv, 0.01));
    }
}
