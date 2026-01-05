"""Tests for SyntheticPreferenceGenerator and related classes."""

import time

import numpy as np
import pytest

from research.evaluator.synthetic_preferences import (
    Action,
    Direction,
    MarketContext,
    PreferencePair,
    SizeUnit,
    SyntheticPreferenceGenerator,
    TradeOutcome,
    TradingPlan,
    generate_random_contexts,
)


# ============================================
# Fixtures
# ============================================


@pytest.fixture
def sample_context() -> MarketContext:
    """Create a sample market context."""
    return MarketContext(
        symbol="AAPL",
        current_price=150.0,
        regime="BULL_TREND",
        vix=18.5,
        atr_pct=0.02,
        rsi=45.0,
        trend_strength=0.6,
        volume_ratio=1.2,
        sector="TECH",
        account_equity=100000.0,
    )


@pytest.fixture
def sample_plan() -> TradingPlan:
    """Create a sample trading plan."""
    return TradingPlan(
        plan_id="test-plan-001",
        action=Action.BUY,
        direction=Direction.LONG,
        symbol="AAPL",
        entry_price=150.0,
        stop_loss=145.0,
        take_profit=165.0,
        size=100,
        size_unit=SizeUnit.SHARES,
        conviction=0.7,
        time_horizon="SWING",
    )


@pytest.fixture
def sample_outcome() -> TradeOutcome:
    """Create a sample trade outcome."""
    return TradeOutcome(
        realized_pnl=0.05,
        slippage=0.001,
        fill_rate=1.0,
        execution_time_ms=50,
        hit_stop=False,
        hit_target=True,
        hold_duration_hours=48.0,
    )


@pytest.fixture
def generator() -> SyntheticPreferenceGenerator:
    """Create a generator with fixed seed."""
    return SyntheticPreferenceGenerator(random_seed=42)


# ============================================
# MarketContext Tests
# ============================================


class TestMarketContext:
    """Tests for MarketContext dataclass."""

    def test_create_context(self, sample_context):
        """Test creating a market context."""
        assert sample_context.symbol == "AAPL"
        assert sample_context.current_price == 150.0
        assert sample_context.regime == "BULL_TREND"
        assert sample_context.vix == 18.5

    def test_to_dict(self, sample_context):
        """Test converting context to dictionary."""
        d = sample_context.to_dict()

        assert d["symbol"] == "AAPL"
        assert d["current_price"] == 150.0
        assert d["regime"] == "BULL_TREND"
        assert "vix" in d
        assert "atr_pct" in d
        assert "rsi" in d

    def test_default_values(self):
        """Test default context values."""
        context = MarketContext(symbol="TEST", current_price=100.0)

        assert context.regime == "UNKNOWN"
        assert context.vix == 20.0
        assert context.atr_pct == 0.02
        assert context.rsi == 50.0
        assert context.trend_strength == 0.0


# ============================================
# TradingPlan Tests
# ============================================


class TestTradingPlan:
    """Tests for TradingPlan dataclass."""

    def test_create_plan(self, sample_plan):
        """Test creating a trading plan."""
        assert sample_plan.action == Action.BUY
        assert sample_plan.direction == Direction.LONG
        assert sample_plan.entry_price == 150.0
        assert sample_plan.stop_loss == 145.0
        assert sample_plan.take_profit == 165.0

    def test_risk_reward_ratio(self, sample_plan):
        """Test risk-reward ratio calculation."""
        # Risk: 150 - 145 = 5
        # Reward: 165 - 150 = 15
        # RR: 15/5 = 3.0
        assert sample_plan.risk_reward_ratio == 3.0

    def test_risk_reward_ratio_short(self):
        """Test risk-reward ratio for short position."""
        plan = TradingPlan(
            plan_id="test",
            action=Action.SELL,
            direction=Direction.SHORT,
            symbol="SPY",
            entry_price=100.0,
            stop_loss=105.0,  # Stop above entry for short
            take_profit=90.0,  # Target below entry for short
            size=50,
            size_unit=SizeUnit.SHARES,
        )
        # Risk: |100 - 105| = 5
        # Reward: |90 - 100| = 10
        # RR: 10/5 = 2.0
        assert plan.risk_reward_ratio == 2.0

    def test_risk_reward_ratio_hold(self):
        """Test risk-reward ratio for HOLD action."""
        plan = TradingPlan(
            plan_id="test",
            action=Action.HOLD,
            direction=Direction.FLAT,
            symbol="SPY",
            entry_price=100.0,
            stop_loss=100.0,  # Same as entry
            take_profit=100.0,
            size=0,
            size_unit=SizeUnit.SHARES,
        )
        assert plan.risk_reward_ratio == 0.0

    def test_risk_percent(self, sample_plan):
        """Test risk percentage calculation."""
        # Risk: |150 - 145| / 150 = 5/150 = 0.0333
        expected = 5 / 150
        assert abs(sample_plan.risk_percent - expected) < 0.001

    def test_to_feature_vector(self, sample_plan, sample_context):
        """Test feature vector generation."""
        features = sample_plan.to_feature_vector(sample_context)

        assert features.shape == (128,)
        assert features.dtype == np.float32

        # Check action one-hot encoding (BUY = [1, 0, 0, 0])
        assert features[0] == 1.0  # BUY
        assert features[1] == 0.0  # SELL
        assert features[2] == 0.0  # HOLD

        # Check direction encoding
        assert features[4] == 1.0  # LONG
        assert features[5] == 0.0  # SHORT


# ============================================
# TradeOutcome Tests
# ============================================


class TestTradeOutcome:
    """Tests for TradeOutcome dataclass."""

    def test_create_outcome(self, sample_outcome):
        """Test creating a trade outcome."""
        assert sample_outcome.realized_pnl == 0.05
        assert sample_outcome.slippage == 0.001
        assert sample_outcome.fill_rate == 1.0
        assert sample_outcome.hit_target is True
        assert sample_outcome.hit_stop is False

    def test_default_values(self):
        """Test default outcome values."""
        outcome = TradeOutcome(realized_pnl=0.02, slippage=0.0005)

        assert outcome.fill_rate == 1.0
        assert outcome.execution_time_ms == 0
        assert outcome.hit_stop is False
        assert outcome.hit_target is False


# ============================================
# PreferencePair Tests
# ============================================


class TestPreferencePair:
    """Tests for PreferencePair dataclass."""

    def test_create_pair(self, sample_plan, sample_context):
        """Test creating a preference pair."""
        rejected_plan = TradingPlan(
            plan_id="rejected-001",
            action=Action.BUY,
            direction=Direction.LONG,
            symbol="AAPL",
            entry_price=151.0,
            stop_loss=148.0,
            take_profit=155.0,  # Poor RR
            size=200,  # Oversized
            size_unit=SizeUnit.SHARES,
        )

        pair = PreferencePair(
            pair_id="pair-001",
            chosen=sample_plan,
            rejected=rejected_plan,
            chosen_score=85.0,
            rejected_score=45.0,
            margin=0.4,
            context=sample_context,
        )

        assert pair.chosen.plan_id == "test-plan-001"
        assert pair.rejected.plan_id == "rejected-001"
        assert pair.chosen_score > pair.rejected_score
        assert pair.margin == 0.4
        assert pair.source == "west_of_n"


# ============================================
# SyntheticPreferenceGenerator Tests
# ============================================


class TestSyntheticPreferenceGenerator:
    """Tests for SyntheticPreferenceGenerator class."""

    def test_init_with_seed(self):
        """Test initialization with random seed."""
        gen = SyntheticPreferenceGenerator(random_seed=123)
        assert gen.random_seed == 123

    def test_init_no_seed(self):
        """Test initialization without seed."""
        gen = SyntheticPreferenceGenerator(random_seed=None)
        assert gen.random_seed is None

    def test_generate_preference_pair(self, generator, sample_context):
        """Test West-of-N preference pair generation."""
        pair = generator.generate_preference_pair(sample_context, n_candidates=8)

        assert isinstance(pair, PreferencePair)
        assert pair.chosen is not None
        assert pair.rejected is not None
        assert pair.chosen_score >= pair.rejected_score
        assert 0.0 <= pair.margin <= 1.0
        assert pair.source == "west_of_n"
        assert pair.metadata["n_candidates"] == 8
        assert len(pair.metadata["all_scores"]) == 8

    def test_generate_preference_pair_minimum_candidates(self, generator, sample_context):
        """Test with minimum number of candidates."""
        pair = generator.generate_preference_pair(sample_context, n_candidates=2)

        assert pair.chosen is not None
        assert pair.rejected is not None
        assert pair.metadata["n_candidates"] == 2

    def test_generate_preference_pair_invalid_n(self, generator, sample_context):
        """Test with invalid number of candidates."""
        with pytest.raises(ValueError, match="n_candidates must be at least 2"):
            generator.generate_preference_pair(sample_context, n_candidates=1)

    def test_scores_are_sorted(self, generator, sample_context):
        """Test that all_scores in metadata are sorted descending."""
        pair = generator.generate_preference_pair(sample_context, n_candidates=8)

        scores = pair.metadata["all_scores"]
        assert scores == sorted(scores, reverse=True)
        assert pair.chosen_score == scores[0]
        assert pair.rejected_score == scores[-1]

    def test_generate_from_counterfactuals(
        self, generator, sample_plan, sample_outcome, sample_context
    ):
        """Test counterfactual preference pair generation."""
        pairs = generator.generate_from_counterfactuals(
            sample_plan, sample_outcome, sample_context, n_perturbations=4
        )

        # May generate 0-4 pairs depending on margin filtering
        assert isinstance(pairs, list)

        for pair in pairs:
            assert isinstance(pair, PreferencePair)
            assert pair.source == "counterfactual"
            assert "perturbation_type" in pair.metadata
            assert "actual_pnl" in pair.metadata
            assert pair.margin >= 0.05  # Filtered for minimum margin

    def test_counterfactual_with_losing_trade(self, generator, sample_plan, sample_context):
        """Test counterfactual generation with a losing trade."""
        losing_outcome = TradeOutcome(
            realized_pnl=-0.03,
            slippage=0.002,
            fill_rate=0.95,
            hit_stop=True,
            hit_target=False,
        )

        pairs = generator.generate_from_counterfactuals(
            sample_plan, losing_outcome, sample_context, n_perturbations=4
        )

        # Should still generate pairs
        assert isinstance(pairs, list)

    def test_generate_batch(self, generator):
        """Test batch preference pair generation."""
        contexts = generate_random_contexts(
            symbols=["AAPL", "MSFT", "GOOGL"],
            n_contexts=5,
            random_seed=42,
        )

        pairs = generator.generate_batch(contexts, n_candidates=8)

        assert len(pairs) == 5
        for pair in pairs:
            assert isinstance(pair, PreferencePair)
            assert pair.source == "west_of_n"

    def test_reproducibility(self, sample_context):
        """Test that same seed produces same results."""
        gen1 = SyntheticPreferenceGenerator(random_seed=42)
        gen2 = SyntheticPreferenceGenerator(random_seed=42)

        pair1 = gen1.generate_preference_pair(sample_context, n_candidates=8)
        pair2 = gen2.generate_preference_pair(sample_context, n_candidates=8)

        assert pair1.chosen_score == pair2.chosen_score
        assert pair1.rejected_score == pair2.rejected_score
        assert pair1.margin == pair2.margin


# ============================================
# Rule-Based Scoring Tests
# ============================================


class TestRuleBasedScoring:
    """Tests for rule-based scoring logic."""

    def test_high_rr_scores_well(self, generator, sample_context):
        """Test that high RR ratio scores well."""
        good_plan = TradingPlan(
            plan_id="test",
            action=Action.BUY,
            direction=Direction.LONG,
            symbol="AAPL",
            entry_price=150.0,
            stop_loss=147.0,  # 3 risk
            take_profit=162.0,  # 12 reward = 4:1 RR
            size=50,
            size_unit=SizeUnit.SHARES,
            conviction=0.7,
            time_horizon="SWING",
        )

        poor_plan = TradingPlan(
            plan_id="test",
            action=Action.BUY,
            direction=Direction.LONG,
            symbol="AAPL",
            entry_price=150.0,
            stop_loss=145.0,  # 5 risk
            take_profit=152.0,  # 2 reward = 0.4:1 RR
            size=50,
            size_unit=SizeUnit.SHARES,
            conviction=0.7,
            time_horizon="SWING",
        )

        good_score = generator._rule_based_score(good_plan, sample_context)
        poor_score = generator._rule_based_score(poor_plan, sample_context)

        assert good_score > poor_score

    def test_trend_alignment_scoring(self, generator):
        """Test that trend-aligned trades score better."""
        bull_context = MarketContext(
            symbol="AAPL",
            current_price=150.0,
            regime="BULL_TREND",
            trend_strength=0.8,  # Strong bullish trend
            vix=18.0,
            atr_pct=0.02,
            rsi=55.0,
        )

        long_plan = TradingPlan(
            plan_id="test",
            action=Action.BUY,
            direction=Direction.LONG,
            symbol="AAPL",
            entry_price=150.0,
            stop_loss=147.0,
            take_profit=159.0,
            size=50,
            size_unit=SizeUnit.SHARES,
        )

        short_plan = TradingPlan(
            plan_id="test",
            action=Action.SELL,
            direction=Direction.SHORT,
            symbol="AAPL",
            entry_price=150.0,
            stop_loss=153.0,
            take_profit=141.0,
            size=50,
            size_unit=SizeUnit.SHARES,
        )

        long_score = generator._rule_based_score(long_plan, bull_context)
        short_score = generator._rule_based_score(short_plan, bull_context)

        # Long should score better in bull trend
        assert long_score > short_score

    def test_rsi_timing_scoring(self, generator):
        """Test RSI timing affects score."""
        oversold_context = MarketContext(
            symbol="AAPL",
            current_price=150.0,
            regime="RANGE",
            rsi=25.0,  # Oversold
            vix=18.0,
            atr_pct=0.02,
            trend_strength=0.0,
        )

        overbought_context = MarketContext(
            symbol="AAPL",
            current_price=150.0,
            regime="RANGE",
            rsi=75.0,  # Overbought
            vix=18.0,
            atr_pct=0.02,
            trend_strength=0.0,
        )

        buy_plan = TradingPlan(
            plan_id="test",
            action=Action.BUY,
            direction=Direction.LONG,
            symbol="AAPL",
            entry_price=150.0,
            stop_loss=147.0,
            take_profit=159.0,
            size=50,
            size_unit=SizeUnit.SHARES,
        )

        # Buy in oversold should score better than buy in overbought
        oversold_score = generator._rule_based_score(buy_plan, oversold_context)
        overbought_score = generator._rule_based_score(buy_plan, overbought_context)

        assert oversold_score > overbought_score


# ============================================
# Feature Vector Tests
# ============================================


class TestFeatureVectors:
    """Tests for feature vector generation."""

    def test_get_feature_vectors(self, generator, sample_plan, sample_context):
        """Test feature vector extraction from pair."""
        rejected_plan = TradingPlan(
            plan_id="rejected",
            action=Action.BUY,
            direction=Direction.LONG,
            symbol="AAPL",
            entry_price=151.0,
            stop_loss=148.0,
            take_profit=155.0,
            size=100,
            size_unit=SizeUnit.SHARES,
        )

        pair = PreferencePair(
            pair_id="test",
            chosen=sample_plan,
            rejected=rejected_plan,
            chosen_score=80.0,
            rejected_score=50.0,
            margin=0.3,
            context=sample_context,
        )

        chosen_feat, rejected_feat = generator.get_feature_vectors(pair)

        assert chosen_feat.shape == (128,)
        assert rejected_feat.shape == (128,)
        assert chosen_feat.dtype == np.float32
        assert rejected_feat.dtype == np.float32

    def test_prepare_training_batch(self, generator, sample_context):
        """Test preparing batch for training."""
        pairs = [
            generator.generate_preference_pair(sample_context, n_candidates=4)
            for _ in range(5)
        ]

        chosen, rejected, margins = generator.prepare_training_batch(pairs)

        assert chosen.shape == (5, 128)
        assert rejected.shape == (5, 128)
        assert margins.shape == (5,)
        assert chosen.dtype == np.float32
        assert margins.dtype == np.float32

    def test_feature_values_normalized(self, sample_plan, sample_context):
        """Test that feature values are in reasonable ranges."""
        features = sample_plan.to_feature_vector(sample_context)

        # Most features should be in [-1, 1] or [0, 1] after normalization
        # Allow some outliers but most should be bounded
        bounded_count = np.sum(np.abs(features) <= 2.0)
        assert bounded_count >= 100  # At least 100/128 should be bounded


# ============================================
# Perturbation Tests
# ============================================


class TestPerturbations:
    """Tests for perturbation generation."""

    def test_generate_perturbations(self, generator, sample_plan, sample_context):
        """Test perturbation generation."""
        perturbations = generator._generate_perturbations(sample_plan, sample_context, 4)

        assert len(perturbations) == 4

        for p in perturbations:
            assert isinstance(p, TradingPlan)
            assert p.symbol == sample_plan.symbol
            assert p.action == sample_plan.action
            assert p.direction == sample_plan.direction
            # At least one value should be different
            assert (
                p.entry_price != sample_plan.entry_price
                or p.stop_loss != sample_plan.stop_loss
                or p.take_profit != sample_plan.take_profit
                or p.size != sample_plan.size
            )

    def test_perturbation_preserves_direction(self, generator, sample_context):
        """Test that perturbations preserve direction logic."""
        short_plan = TradingPlan(
            plan_id="test",
            action=Action.SELL,
            direction=Direction.SHORT,
            symbol="SPY",
            entry_price=400.0,
            stop_loss=410.0,
            take_profit=380.0,
            size=50,
            size_unit=SizeUnit.SHARES,
        )

        perturbations = generator._generate_perturbations(short_plan, sample_context, 4)

        for p in perturbations:
            assert p.direction == Direction.SHORT
            assert p.action == Action.SELL

    def test_identify_perturbation_type(self, generator, sample_plan):
        """Test perturbation type identification."""
        # Entry change only
        entry_perturb = TradingPlan(
            plan_id="test",
            action=sample_plan.action,
            direction=sample_plan.direction,
            symbol=sample_plan.symbol,
            entry_price=155.0,  # Changed
            stop_loss=sample_plan.stop_loss,
            take_profit=sample_plan.take_profit,
            size=sample_plan.size,
            size_unit=sample_plan.size_unit,
        )

        assert generator._identify_perturbation_type(sample_plan, entry_perturb) == "entry"

        # Size change only
        size_perturb = TradingPlan(
            plan_id="test",
            action=sample_plan.action,
            direction=sample_plan.direction,
            symbol=sample_plan.symbol,
            entry_price=sample_plan.entry_price,
            stop_loss=sample_plan.stop_loss,
            take_profit=sample_plan.take_profit,
            size=200,  # Changed
            size_unit=sample_plan.size_unit,
        )

        assert generator._identify_perturbation_type(sample_plan, size_perturb) == "size"

        # No change
        same = TradingPlan(
            plan_id="test",
            action=sample_plan.action,
            direction=sample_plan.direction,
            symbol=sample_plan.symbol,
            entry_price=sample_plan.entry_price,
            stop_loss=sample_plan.stop_loss,
            take_profit=sample_plan.take_profit,
            size=sample_plan.size,
            size_unit=sample_plan.size_unit,
        )

        assert generator._identify_perturbation_type(sample_plan, same) == "none"


# ============================================
# Counterfactual Outcome Tests
# ============================================


class TestCounterfactualOutcomes:
    """Tests for counterfactual outcome estimation."""

    def test_estimate_counterfactual_outcome(
        self, generator, sample_plan, sample_outcome, sample_context
    ):
        """Test counterfactual outcome estimation."""
        perturbation = TradingPlan(
            plan_id="cf",
            action=sample_plan.action,
            direction=sample_plan.direction,
            symbol=sample_plan.symbol,
            entry_price=148.0,  # Better entry for long
            stop_loss=sample_plan.stop_loss,
            take_profit=sample_plan.take_profit,
            size=sample_plan.size,
            size_unit=sample_plan.size_unit,
        )

        cf_outcome = generator._estimate_counterfactual_outcome(
            perturbation, sample_plan, sample_outcome, sample_context
        )

        assert isinstance(cf_outcome, TradeOutcome)
        assert isinstance(cf_outcome.realized_pnl, float)
        assert 0.0 <= cf_outcome.fill_rate <= 1.0

    def test_outcome_based_score(self, generator, sample_plan, sample_outcome, sample_context):
        """Test outcome-based scoring."""
        score = generator._outcome_based_score(sample_plan, sample_outcome, sample_context)

        assert 0.0 <= score <= 100.0

        # Winning trade should score above 50
        assert score > 50.0

    def test_losing_trade_scores_lower(self, generator, sample_plan, sample_context):
        """Test that losing trades score lower."""
        winning_outcome = TradeOutcome(
            realized_pnl=0.05,
            slippage=0.001,
            fill_rate=1.0,
            hit_target=True,
            hit_stop=False,
        )

        losing_outcome = TradeOutcome(
            realized_pnl=-0.05,
            slippage=0.003,
            fill_rate=0.9,
            hit_target=False,
            hit_stop=True,
        )

        winning_score = generator._outcome_based_score(
            sample_plan, winning_outcome, sample_context
        )
        losing_score = generator._outcome_based_score(
            sample_plan, losing_outcome, sample_context
        )

        assert winning_score > losing_score


# ============================================
# Helper Function Tests
# ============================================


class TestHelperFunctions:
    """Tests for helper functions."""

    def test_generate_random_contexts(self):
        """Test random context generation."""
        contexts = generate_random_contexts(
            symbols=["AAPL", "MSFT", "GOOGL"],
            n_contexts=10,
            random_seed=42,
        )

        assert len(contexts) == 10

        for ctx in contexts:
            assert isinstance(ctx, MarketContext)
            assert ctx.symbol in ["AAPL", "MSFT", "GOOGL"]
            assert ctx.current_price > 0
            assert ctx.regime in ["BULL_TREND", "BEAR_TREND", "RANGE", "HIGH_VOL"]
            assert 0 < ctx.vix < 60
            assert 0 < ctx.rsi < 100

    def test_generate_random_contexts_reproducible(self):
        """Test random context generation is reproducible."""
        ctx1 = generate_random_contexts(["SPY"], 5, random_seed=42)
        ctx2 = generate_random_contexts(["SPY"], 5, random_seed=42)

        for c1, c2 in zip(ctx1, ctx2):
            assert c1.current_price == c2.current_price
            assert c1.vix == c2.vix
            assert c1.rsi == c2.rsi

    def test_context_regime_correlation(self):
        """Test that contexts have correlated values based on regime."""
        contexts = generate_random_contexts(["SPY"], 100, random_seed=42)

        bull_vix = [c.vix for c in contexts if c.regime == "BULL_TREND"]
        bear_vix = [c.vix for c in contexts if c.regime == "BEAR_TREND"]

        if bull_vix and bear_vix:
            # Bear markets tend to have higher VIX
            assert np.mean(bear_vix) > np.mean(bull_vix)


# ============================================
# Performance Tests
# ============================================


class TestPerformance:
    """Tests for generation performance."""

    def test_generation_speed(self, generator):
        """Test that generation is fast (>100 pairs/second)."""
        contexts = generate_random_contexts(["SPY", "QQQ"], 100, random_seed=42)

        start_time = time.time()
        pairs = generator.generate_batch(contexts, n_candidates=8)
        elapsed = time.time() - start_time

        pairs_per_second = len(pairs) / elapsed

        assert pairs_per_second >= 100, f"Too slow: {pairs_per_second:.1f} pairs/sec"

    def test_batch_generation_efficiency(self, generator):
        """Test that batch generation is efficient."""
        contexts = generate_random_contexts(["AAPL"], 50, random_seed=42)

        start_time = time.time()
        batch_pairs = generator.generate_batch(contexts, n_candidates=8)
        batch_time = time.time() - start_time

        # Verify we got all pairs
        assert len(batch_pairs) == 50

        # Batch should complete in reasonable time (< 1 second for 50 contexts)
        assert batch_time < 1.0


# ============================================
# Edge Case Tests
# ============================================


class TestEdgeCases:
    """Tests for edge cases."""

    def test_zero_price_context(self, generator):
        """Test handling of zero price in context."""
        context = MarketContext(symbol="TEST", current_price=0.0)

        # Should not crash, but may produce warnings
        pair = generator.generate_preference_pair(context, n_candidates=2)
        assert pair is not None

    def test_extreme_vix(self, generator):
        """Test with extreme VIX values."""
        high_vix_context = MarketContext(
            symbol="SPY",
            current_price=400.0,
            regime="HIGH_VOL",
            vix=80.0,  # Extreme panic
        )

        pair = generator.generate_preference_pair(high_vix_context, n_candidates=4)
        assert pair is not None

        # In high vol, HOLD should be more likely
        # (We're just checking it doesn't crash)

    def test_flat_direction_plan(self, generator, sample_context):
        """Test scoring of FLAT direction plans."""
        hold_plan = TradingPlan(
            plan_id="test",
            action=Action.HOLD,
            direction=Direction.FLAT,
            symbol="AAPL",
            entry_price=150.0,
            stop_loss=148.0,
            take_profit=152.0,
            size=0,
            size_unit=SizeUnit.SHARES,
        )

        score = generator._rule_based_score(hold_plan, sample_context)

        # HOLD plans should have moderate scores
        assert 30.0 <= score <= 70.0

    def test_many_candidates(self, generator, sample_context):
        """Test with many candidates."""
        pair = generator.generate_preference_pair(sample_context, n_candidates=50)

        assert len(pair.metadata["all_scores"]) == 50
        assert pair.chosen_score == max(pair.metadata["all_scores"])
        assert pair.rejected_score == min(pair.metadata["all_scores"])
