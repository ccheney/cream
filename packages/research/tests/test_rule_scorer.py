"""
Tests for Rule-Based Evaluator Scorer
"""

import pytest

from research.evaluator.rule_scorer import (
    ConvictionLevel,
    RuleBasedScorer,
    ScoringResult,
    VolatilityRegime,
)


class TestScoringResult:
    """Tests for ScoringResult dataclass."""

    def test_from_score_excellent(self) -> None:
        """Test A grade for scores >= 90."""
        result = ScoringResult.from_score(95, {"key": 1}, "Excellent")
        assert result.grade == "A"
        assert result.score == 95

    def test_from_score_good(self) -> None:
        """Test B grade for scores 80-89."""
        result = ScoringResult.from_score(85, {}, "Good")
        assert result.grade == "B"

    def test_from_score_acceptable(self) -> None:
        """Test C grade for scores 70-79."""
        result = ScoringResult.from_score(75, {}, "Acceptable")
        assert result.grade == "C"

    def test_from_score_poor(self) -> None:
        """Test D grade for scores 60-69."""
        result = ScoringResult.from_score(65, {}, "Poor")
        assert result.grade == "D"

    def test_from_score_failing(self) -> None:
        """Test F grade for scores < 60."""
        result = ScoringResult.from_score(55, {}, "Failing")
        assert result.grade == "F"


class TestRiskRewardScoring:
    """Tests for risk-reward ratio scoring."""

    def setup_method(self) -> None:
        """Set up test fixtures."""
        self.scorer = RuleBasedScorer()

    def test_excellent_rr_ratio(self) -> None:
        """Test scoring for RR >= 3.0 (excellent)."""
        # Entry: 100, Stop: 95 (risk=5), Target: 120 (reward=20)
        # RR = 20/5 = 4.0
        result = self.scorer.score_risk_reward(
            entry_price=100.0,
            stop_loss=95.0,
            take_profit=120.0,
        )
        assert result.score == 100.0
        assert result.grade == "A"
        assert result.components["risk_reward_ratio"] == 4.0

    def test_good_rr_ratio(self) -> None:
        """Test scoring for RR 2.5-3.0 (good)."""
        # Entry: 100, Stop: 96 (risk=4), Target: 111 (reward=11)
        # RR = 11/4 = 2.75
        result = self.scorer.score_risk_reward(
            entry_price=100.0,
            stop_loss=96.0,
            take_profit=111.0,
        )
        assert 85 <= result.score <= 100
        assert result.components["risk_reward_ratio"] == 2.75

    def test_acceptable_rr_ratio(self) -> None:
        """Test scoring for RR 2.0-2.5 (acceptable)."""
        # Entry: 100, Stop: 95 (risk=5), Target: 112.5 (reward=12.5)
        # RR = 12.5/5 = 2.5 (boundary, exactly 85)
        result = self.scorer.score_risk_reward(
            entry_price=100.0,
            stop_loss=95.0,
            take_profit=112.5,
        )
        assert result.score == 85.0

    def test_poor_rr_ratio(self) -> None:
        """Test scoring for RR 1.5-2.0 (poor)."""
        # Entry: 100, Stop: 95 (risk=5), Target: 108.75 (reward=8.75)
        # RR = 8.75/5 = 1.75
        result = self.scorer.score_risk_reward(
            entry_price=100.0,
            stop_loss=95.0,
            take_profit=108.75,
        )
        assert 50 <= result.score <= 70
        assert result.components["risk_reward_ratio"] == 1.75

    def test_minimum_rr_ratio(self) -> None:
        """Test scoring for RR 1.0-1.5 (minimum)."""
        # Entry: 100, Stop: 95 (risk=5), Target: 106.25 (reward=6.25)
        # RR = 6.25/5 = 1.25
        result = self.scorer.score_risk_reward(
            entry_price=100.0,
            stop_loss=95.0,
            take_profit=106.25,
        )
        assert 30 <= result.score <= 50
        assert result.components["risk_reward_ratio"] == 1.25

    def test_below_minimum_rr_ratio(self) -> None:
        """Test scoring for RR < 1.0 (unacceptable)."""
        # Entry: 100, Stop: 95 (risk=5), Target: 102.5 (reward=2.5)
        # RR = 2.5/5 = 0.5
        result = self.scorer.score_risk_reward(
            entry_price=100.0,
            stop_loss=95.0,
            take_profit=102.5,
        )
        assert 0 <= result.score <= 30
        assert result.components["risk_reward_ratio"] == 0.5

    def test_short_position_rr(self) -> None:
        """Test risk-reward for short position."""
        # Short entry: 100, Stop: 105 (risk=5), Target: 85 (reward=15)
        # RR = 15/5 = 3.0
        result = self.scorer.score_risk_reward(
            entry_price=100.0,
            stop_loss=105.0,
            take_profit=85.0,
        )
        assert result.score == 100.0
        assert result.components["risk_reward_ratio"] == 3.0

    def test_boundary_values(self) -> None:
        """Test scoring at exact boundary values."""
        # Test RR = 3.0 exactly
        result_3 = self.scorer.score_risk_reward(
            entry_price=100.0,
            stop_loss=95.0,
            take_profit=115.0,  # reward=15, risk=5, RR=3.0
        )
        assert result_3.score == 100.0

        # Test RR = 2.0 exactly
        result_2 = self.scorer.score_risk_reward(
            entry_price=100.0,
            stop_loss=95.0,
            take_profit=110.0,  # reward=10, risk=5, RR=2.0
        )
        assert result_2.score == 70.0

        # Test RR = 1.0 exactly
        result_1 = self.scorer.score_risk_reward(
            entry_price=100.0,
            stop_loss=95.0,
            take_profit=105.0,  # reward=5, risk=5, RR=1.0
        )
        assert result_1.score == 30.0

    def test_invalid_zero_prices(self) -> None:
        """Test that zero or negative prices raise ValueError."""
        with pytest.raises(ValueError, match="positive"):
            self.scorer.score_risk_reward(0, 95, 110)

        with pytest.raises(ValueError, match="positive"):
            self.scorer.score_risk_reward(100, 0, 110)

        with pytest.raises(ValueError, match="positive"):
            self.scorer.score_risk_reward(100, 95, -10)

    def test_invalid_zero_risk(self) -> None:
        """Test that zero risk (stop = entry) raises ValueError."""
        with pytest.raises(ValueError, match="zero"):
            self.scorer.score_risk_reward(100, 100, 110)


class TestSizingScoring:
    """Tests for position sizing scoring."""

    def setup_method(self) -> None:
        """Set up test fixtures."""
        self.scorer = RuleBasedScorer()

    def test_ideal_high_conviction(self) -> None:
        """Test scoring for ideal high-conviction sizing."""
        # High conviction: ideal risk is 2% of account
        # Account: 100k, Position: 10k, Stop: 20% -> Risk = 2k = 2% of account
        result = self.scorer.score_sizing(
            position_notional=10000.0,
            account_equity=100000.0,
            stop_loss_pct=0.20,
            conviction_level=0.8,  # High conviction
            volatility_regime="normal",
        )
        assert result.score >= 95  # Near-ideal should be 95+
        assert result.components["conviction_category"] == "high"
        assert result.components["ideal_risk_pct"] == 2.0

    def test_ideal_standard_conviction(self) -> None:
        """Test scoring for ideal standard-conviction sizing."""
        # Standard conviction: ideal risk is 1% of account
        # Account: 100k, Position: 5k, Stop: 20% -> Risk = 1k = 1% of account
        result = self.scorer.score_sizing(
            position_notional=5000.0,
            account_equity=100000.0,
            stop_loss_pct=0.20,
            conviction_level=0.5,  # Standard conviction
            volatility_regime="normal",
        )
        assert result.score >= 95
        assert result.components["conviction_category"] == "standard"
        assert result.components["ideal_risk_pct"] == 1.0

    def test_ideal_speculative_conviction(self) -> None:
        """Test scoring for ideal speculative-conviction sizing."""
        # Speculative conviction: ideal risk is 0.5% of account
        # Account: 100k, Position: 2.5k, Stop: 20% -> Risk = 0.5k = 0.5% of account
        result = self.scorer.score_sizing(
            position_notional=2500.0,
            account_equity=100000.0,
            stop_loss_pct=0.20,
            conviction_level=0.2,  # Speculative conviction
            volatility_regime="normal",
        )
        assert result.score >= 95
        assert result.components["conviction_category"] == "speculative"
        assert result.components["ideal_risk_pct"] == 0.5

    def test_high_volatility_adjustment(self) -> None:
        """Test that high volatility reduces ideal risk by 50%."""
        # High conviction in high vol: ideal risk is 2% * 0.5 = 1%
        result = self.scorer.score_sizing(
            position_notional=5000.0,
            account_equity=100000.0,
            stop_loss_pct=0.20,  # Risk = 1k = 1% of account
            conviction_level=0.8,
            volatility_regime="high",
        )
        assert result.components["volatility_regime"] == "high"
        assert result.components["ideal_risk_pct"] == 1.0  # Reduced from 2%
        assert result.score >= 95

    def test_oversized_position(self) -> None:
        """Test scoring for oversized position (>100% deviation)."""
        # High conviction: ideal = 2%, actual = 5% -> 150% deviation
        result = self.scorer.score_sizing(
            position_notional=25000.0,
            account_equity=100000.0,
            stop_loss_pct=0.20,  # Risk = 5k = 5%
            conviction_level=0.8,
            volatility_regime="normal",
        )
        assert result.score < 50
        assert "oversized" in result.feedback.lower() or "excessive" in result.feedback.lower()

    def test_undersized_position(self) -> None:
        """Test scoring for undersized position."""
        # High conviction: ideal = 2%, actual = 0.5% -> 75% deviation below
        result = self.scorer.score_sizing(
            position_notional=2500.0,
            account_equity=100000.0,
            stop_loss_pct=0.20,  # Risk = 0.5k = 0.5%
            conviction_level=0.8,
            volatility_regime="normal",
        )
        assert result.score < 70
        assert "undersized" in result.feedback.lower() or "insufficient" in result.feedback.lower()

    def test_conviction_level_boundaries(self) -> None:
        """Test conviction level categorization at boundaries."""
        scorer = RuleBasedScorer()

        # 0.39 should be speculative
        assert scorer._categorize_conviction(0.39) == ConvictionLevel.SPECULATIVE

        # 0.40 should be standard
        assert scorer._categorize_conviction(0.40) == ConvictionLevel.STANDARD

        # 0.69 should be standard
        assert scorer._categorize_conviction(0.69) == ConvictionLevel.STANDARD

        # 0.70 should be high
        assert scorer._categorize_conviction(0.70) == ConvictionLevel.HIGH

    def test_invalid_inputs(self) -> None:
        """Test validation of invalid inputs."""
        with pytest.raises(ValueError, match="positive"):
            self.scorer.score_sizing(0, 100000, 0.05, 0.5)

        with pytest.raises(ValueError, match="positive"):
            self.scorer.score_sizing(10000, 0, 0.05, 0.5)

        with pytest.raises(ValueError, match="between 0 and 1"):
            self.scorer.score_sizing(10000, 100000, 1.5, 0.5)

        with pytest.raises(ValueError, match="between 0 and 1"):
            self.scorer.score_sizing(10000, 100000, 0.05, 1.5)


class TestCombinedScoring:
    """Tests for combined scoring."""

    def setup_method(self) -> None:
        """Set up test fixtures."""
        self.scorer = RuleBasedScorer()

    def test_combined_excellent(self) -> None:
        """Test combined score with excellent components."""
        # For high conviction (0.8), ideal risk = 2% of account
        # stop_loss_pct = 5/100 = 5%, so position_notional = 2000/0.05 = 40000
        # gives 2% risk which matches ideal for high conviction
        result = self.scorer.score_combined(
            entry_price=100.0,
            stop_loss=95.0,  # 5% stop
            take_profit=120.0,  # RR = 4.0
            position_notional=40000.0,  # Risk = 40k * 0.05 = 2k = 2% of 100k
            account_equity=100000.0,
            conviction_level=0.8,  # High conviction
            volatility_regime="normal",
        )
        assert result.score >= 90
        assert "risk_reward_score" in result.components
        assert "sizing_score" in result.components

    def test_combined_weights(self) -> None:
        """Test that combined score uses correct weights (60% RR, 40% sizing)."""
        result = self.scorer.score_combined(
            entry_price=100.0,
            stop_loss=95.0,
            take_profit=115.0,  # RR = 3.0 -> 100 score
            position_notional=10000.0,
            account_equity=100000.0,
            conviction_level=0.8,
            volatility_regime="normal",
        )

        rr_score = result.components["risk_reward_score"]
        sizing_score = result.components["sizing_score"]
        expected = rr_score * 0.6 + sizing_score * 0.4

        assert abs(result.score - expected) < 0.01


class TestVolatilityRegime:
    """Tests for volatility regime enum."""

    def test_volatility_values(self) -> None:
        """Test volatility regime values."""
        assert VolatilityRegime.LOW.value == "low"
        assert VolatilityRegime.NORMAL.value == "normal"
        assert VolatilityRegime.HIGH.value == "high"
