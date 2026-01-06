"""Tests for PreExecutionEvaluator and PostExecutionEvaluator."""

import numpy as np
import pytest

from research.evaluator.bradley_terry import BradleyTerryRewardModel
from research.evaluator.calibration import ProbabilityCalibrator
from research.evaluator.post_execution import (
    Attribution,
    MarketData,
    OutcomeScore,
    PostExecutionEvaluator,
    TradeOutcome,
)
from research.evaluator.pre_execution import (
    DimensionScores,
    PlanScore,
    PreExecutionEvaluator,
)
from research.evaluator.rule_scorer import RuleBasedScorer
from research.evaluator.synthetic_preferences import (
    Action,
    Direction,
    MarketContext,
    SizeUnit,
    TradingPlan,
)

# ============================================
# Fixtures
# ============================================


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
def rule_scorer() -> RuleBasedScorer:
    """Create a rule-based scorer."""
    return RuleBasedScorer()


@pytest.fixture
def bt_model() -> BradleyTerryRewardModel:
    """Create a Bradley-Terry model."""
    return BradleyTerryRewardModel(input_dim=128)


@pytest.fixture
def calibrator() -> ProbabilityCalibrator:
    """Create a probability calibrator."""
    return ProbabilityCalibrator()


@pytest.fixture
def pre_evaluator(rule_scorer, bt_model, calibrator) -> PreExecutionEvaluator:
    """Create a pre-execution evaluator."""
    return PreExecutionEvaluator(
        rule_scorer=rule_scorer,
        bt_model=bt_model,
        calibrator=calibrator,
    )


@pytest.fixture
def post_evaluator() -> PostExecutionEvaluator:
    """Create a post-execution evaluator."""
    return PostExecutionEvaluator()


@pytest.fixture
def sample_outcome() -> TradeOutcome:
    """Create a sample trade outcome."""
    return TradeOutcome(
        decision_id="test-decision-001",
        realized_return=0.05,
        holding_duration_hours=48.0,
        total_slippage_bps=5.0,
        fill_rate=1.0,
        entry_slippage_bps=2.5,
        exit_slippage_bps=2.5,
        hit_stop=False,
        hit_target=True,
        beta_exposure=1.1,
    )


@pytest.fixture
def sample_market_data() -> MarketData:
    """Create sample market data."""
    return MarketData(
        entry_price=150.0,
        exit_price=157.5,
        entry_vwap=150.2,
        exit_vwap=157.3,
        benchmark_return_during_trade=0.02,
        sector_return_during_trade=0.025,
        high_during_trade=160.0,
        low_during_trade=148.0,
        avg_volume=1000000,
    )


# ============================================
# DimensionScores Tests
# ============================================


class TestDimensionScores:
    """Tests for DimensionScores dataclass."""

    def test_create_scores(self):
        """Test creating dimension scores."""
        scores = DimensionScores(
            technical_alignment=75.0,
            risk_reward_ratio=85.0,
            memory_consistency=60.0,
            context_relevance=70.0,
            sizing_appropriate=80.0,
        )

        assert scores.technical_alignment == 75.0
        assert scores.risk_reward_ratio == 85.0

    def test_to_dict(self):
        """Test converting to dictionary."""
        scores = DimensionScores(
            technical_alignment=75.0,
            risk_reward_ratio=85.0,
            memory_consistency=60.0,
            context_relevance=70.0,
            sizing_appropriate=80.0,
        )

        d = scores.to_dict()
        assert d["technical_alignment"] == 75.0
        assert len(d) == 5


# ============================================
# PlanScore Tests
# ============================================


class TestPlanScore:
    """Tests for PlanScore dataclass."""

    def test_create_plan_score(self):
        """Test creating a plan score."""
        scores = DimensionScores(
            technical_alignment=75.0,
            risk_reward_ratio=85.0,
            memory_consistency=60.0,
            context_relevance=70.0,
            sizing_appropriate=80.0,
        )

        plan_score = PlanScore(
            cycle_id="cycle-001",
            overall_score=75.0,
            dimension_scores=scores,
            confidence=0.75,
            notes=["Good risk-reward"],
        )

        assert plan_score.overall_score == 75.0
        assert plan_score.confidence == 0.75
        assert len(plan_score.notes) == 1

    def test_to_dict(self):
        """Test converting plan score to dictionary."""
        scores = DimensionScores(
            technical_alignment=75.0,
            risk_reward_ratio=85.0,
            memory_consistency=60.0,
            context_relevance=70.0,
            sizing_appropriate=80.0,
        )

        plan_score = PlanScore(
            cycle_id="cycle-001",
            overall_score=75.0,
            dimension_scores=scores,
            confidence=0.75,
            notes=[],
        )

        d = plan_score.to_dict()
        assert d["overall_score"] == 75.0
        assert "dimension_scores" in d


# ============================================
# PreExecutionEvaluator Tests
# ============================================


class TestPreExecutionEvaluator:
    """Tests for PreExecutionEvaluator class."""

    def test_init_minimal(self):
        """Test initialization with no scorers."""
        evaluator = PreExecutionEvaluator()
        assert evaluator.rule_scorer is None
        assert evaluator.bt_model is None

    def test_init_with_scorers(self, rule_scorer, bt_model, calibrator):
        """Test initialization with all scorers."""
        evaluator = PreExecutionEvaluator(
            rule_scorer=rule_scorer,
            bt_model=bt_model,
            calibrator=calibrator,
        )
        assert evaluator.rule_scorer is not None
        assert evaluator.bt_model is not None

    def test_evaluate_basic(self, pre_evaluator, sample_plan, sample_context):
        """Test basic evaluation."""
        plan_score = pre_evaluator.evaluate(sample_plan, sample_context)

        assert isinstance(plan_score, PlanScore)
        assert 0.0 <= plan_score.overall_score <= 100.0
        assert 0.0 <= plan_score.confidence <= 1.0
        assert isinstance(plan_score.dimension_scores, DimensionScores)

    def test_evaluate_with_features(self, pre_evaluator, sample_plan, sample_context):
        """Test evaluation with BT model features."""
        features = np.random.randn(128).astype(np.float32)
        plan_score = pre_evaluator.evaluate(sample_plan, sample_context, features=features)

        assert plan_score.bt_reward != 0.0  # Should have BT reward

    def test_evaluate_without_scorers(self, sample_plan, sample_context):
        """Test evaluation without optional scorers."""
        evaluator = PreExecutionEvaluator()
        plan_score = evaluator.evaluate(sample_plan, sample_context)

        # Should still produce a score
        assert 0.0 <= plan_score.overall_score <= 100.0

    def test_dimension_weights_sum_to_one(self, pre_evaluator):
        """Test that dimension weights sum to 1.0."""
        total = (
            pre_evaluator.WEIGHT_TECHNICAL
            + pre_evaluator.WEIGHT_RISK_REWARD
            + pre_evaluator.WEIGHT_MEMORY
            + pre_evaluator.WEIGHT_CONTEXT
            + pre_evaluator.WEIGHT_SIZING
        )
        assert abs(total - 1.0) < 0.001

    def test_bt_blend_ratio_valid(self, pre_evaluator):
        """Test that BT blend ratio is valid."""
        assert 0.0 <= pre_evaluator.BT_BLEND_RATIO <= 1.0

    def test_evaluate_with_memory_context(self, pre_evaluator, sample_plan, sample_context):
        """Test evaluation with memory context."""
        memory_context = {
            "relevant_nodes": [{"id": "node1"}],
            "similar_trades": [{"id": "trade1"}],
            "avg_outcome": 0.03,
            "regime_performance": {"BULL_TREND": 0.6},
        }

        plan_score = pre_evaluator.evaluate(
            sample_plan, sample_context, memory_context=memory_context
        )

        # Memory score should be influenced
        assert plan_score.dimension_scores.memory_consistency != 50.0

    def test_technical_score_long_in_bull(self, pre_evaluator, sample_context):
        """Test technical score for long in bull trend."""
        long_plan = TradingPlan(
            plan_id="test",
            action=Action.BUY,
            direction=Direction.LONG,
            symbol="AAPL",
            entry_price=150.0,
            stop_loss=145.0,
            take_profit=165.0,
            size=100,
            size_unit=SizeUnit.SHARES,
        )

        plan_score = pre_evaluator.evaluate(long_plan, sample_context)
        # Long in bull trend should have decent technical score
        assert plan_score.dimension_scores.technical_alignment >= 50.0

    def test_technical_score_short_in_bull(self, pre_evaluator, sample_context):
        """Test technical score for short in bull trend."""
        short_plan = TradingPlan(
            plan_id="test",
            action=Action.SELL,
            direction=Direction.SHORT,
            symbol="AAPL",
            entry_price=150.0,
            stop_loss=155.0,
            take_profit=140.0,
            size=100,
            size_unit=SizeUnit.SHARES,
        )

        plan_score = pre_evaluator.evaluate(short_plan, sample_context)
        # Short in bull trend should have lower technical score
        assert plan_score.dimension_scores.technical_alignment < 60.0

    def test_notes_generated_for_low_scores(self, pre_evaluator):
        """Test that notes are generated for low-scoring dimensions."""
        # Create a context that should produce low scores
        bad_context = MarketContext(
            symbol="TEST",
            current_price=100.0,
            regime="BEAR_TREND",
            vix=40.0,  # High vol
            rsi=75.0,  # Overbought
            trend_strength=-0.8,  # Strong bearish
        )

        # Long position in bearish regime with high vol - should score poorly
        long_plan = TradingPlan(
            plan_id="test",
            action=Action.BUY,
            direction=Direction.LONG,
            symbol="TEST",
            entry_price=100.0,
            stop_loss=99.0,  # Poor RR
            take_profit=101.0,  # 1:1 RR
            size=500,  # Large size
            size_unit=SizeUnit.SHARES,
            conviction=0.3,  # Low conviction
        )

        plan_score = pre_evaluator.evaluate(long_plan, bad_context)

        # Should have some warning notes
        assert len(plan_score.notes) > 0

    def test_evaluate_batch(self, pre_evaluator, sample_plan, sample_context):
        """Test batch evaluation."""
        plans = [sample_plan] * 5
        contexts = [sample_context] * 5

        scores = pre_evaluator.evaluate_batch(plans, contexts)

        assert len(scores) == 5
        for score in scores:
            assert isinstance(score, PlanScore)


# ============================================
# Attribution Tests
# ============================================


class TestAttribution:
    """Tests for Attribution dataclass."""

    def test_create_attribution(self):
        """Test creating attribution."""
        attr = Attribution(
            market_contribution=0.02,
            alpha_contribution=0.01,
            timing_contribution=0.005,
            sector_contribution=0.003,
            total=0.038,
            residual=0.0,
        )

        assert attr.market_contribution == 0.02
        assert attr.alpha_contribution == 0.01

    def test_to_dict(self):
        """Test converting to dictionary."""
        attr = Attribution(
            market_contribution=0.02,
            alpha_contribution=0.01,
            timing_contribution=0.005,
        )

        d = attr.to_dict()
        assert "market_contribution" in d
        assert "alpha_contribution" in d


# ============================================
# PostExecutionEvaluator Tests
# ============================================


class TestPostExecutionEvaluator:
    """Tests for PostExecutionEvaluator class."""

    def test_init_default(self):
        """Test default initialization."""
        evaluator = PostExecutionEvaluator()
        assert evaluator.expected_slippage_bps == 5.0

    def test_init_custom_slippage(self):
        """Test initialization with custom slippage."""
        evaluator = PostExecutionEvaluator(expected_slippage_bps=10.0)
        assert evaluator.expected_slippage_bps == 10.0

    def test_evaluate_basic(
        self, post_evaluator, sample_outcome, sample_market_data, sample_plan, sample_context
    ):
        """Test basic evaluation."""
        # Create a plan score first
        pre_evaluator = PreExecutionEvaluator()
        plan_score = pre_evaluator.evaluate(sample_plan, sample_context)

        # Evaluate outcome
        outcome_score = post_evaluator.evaluate(plan_score, sample_outcome, sample_market_data)

        assert isinstance(outcome_score, OutcomeScore)
        assert 0.0 <= outcome_score.execution_quality <= 100.0
        assert 0.0 <= outcome_score.outcome_score <= 100.0
        assert isinstance(outcome_score.attribution, Attribution)

    def test_execution_quality_low_slippage(self, post_evaluator, sample_market_data):
        """Test execution quality with low slippage."""
        low_slippage_outcome = TradeOutcome(
            decision_id="test",
            realized_return=0.03,
            holding_duration_hours=24.0,
            total_slippage_bps=2.0,  # Low slippage
            fill_rate=1.0,
        )

        pre_evaluator = PreExecutionEvaluator()
        plan_score = pre_evaluator.evaluate(
            TradingPlan(
                plan_id="test",
                action=Action.BUY,
                direction=Direction.LONG,
                symbol="TEST",
                entry_price=100.0,
                stop_loss=95.0,
                take_profit=110.0,
                size=100,
                size_unit=SizeUnit.SHARES,
            ),
            MarketContext(symbol="TEST", current_price=100.0),
        )

        outcome_score = post_evaluator.evaluate(
            plan_score, low_slippage_outcome, sample_market_data
        )

        # Low slippage should result in high execution quality
        assert outcome_score.execution_quality >= 80.0

    def test_execution_quality_high_slippage(self, post_evaluator, sample_market_data):
        """Test execution quality with high slippage."""
        high_slippage_outcome = TradeOutcome(
            decision_id="test",
            realized_return=0.03,
            holding_duration_hours=24.0,
            total_slippage_bps=15.0,  # High slippage
            fill_rate=1.0,
        )

        pre_evaluator = PreExecutionEvaluator()
        plan_score = pre_evaluator.evaluate(
            TradingPlan(
                plan_id="test",
                action=Action.BUY,
                direction=Direction.LONG,
                symbol="TEST",
                entry_price=100.0,
                stop_loss=95.0,
                take_profit=110.0,
                size=100,
                size_unit=SizeUnit.SHARES,
            ),
            MarketContext(symbol="TEST", current_price=100.0),
        )

        outcome_score = post_evaluator.evaluate(
            plan_score, high_slippage_outcome, sample_market_data
        )

        # High slippage should result in lower execution quality
        assert outcome_score.execution_quality < 70.0

    def test_attribution_components(self, post_evaluator, sample_outcome, sample_market_data):
        """Test attribution components are computed."""
        pre_evaluator = PreExecutionEvaluator()
        plan_score = pre_evaluator.evaluate(
            TradingPlan(
                plan_id="test",
                action=Action.BUY,
                direction=Direction.LONG,
                symbol="TEST",
                entry_price=100.0,
                stop_loss=95.0,
                take_profit=110.0,
                size=100,
                size_unit=SizeUnit.SHARES,
            ),
            MarketContext(symbol="TEST", current_price=100.0),
        )

        outcome_score = post_evaluator.evaluate(plan_score, sample_outcome, sample_market_data)

        attr = outcome_score.attribution
        # Should have non-zero market contribution (benchmark moved 2%)
        assert attr.market_contribution != 0.0
        # Total should be close to realized return
        assert abs(attr.total - sample_outcome.realized_return) < 0.01

    def test_winning_trade_scores_higher(self, post_evaluator, sample_market_data):
        """Test that winning trade scores higher than losing trade."""
        pre_evaluator = PreExecutionEvaluator()
        plan_score = pre_evaluator.evaluate(
            TradingPlan(
                plan_id="test",
                action=Action.BUY,
                direction=Direction.LONG,
                symbol="TEST",
                entry_price=100.0,
                stop_loss=95.0,
                take_profit=110.0,
                size=100,
                size_unit=SizeUnit.SHARES,
            ),
            MarketContext(symbol="TEST", current_price=100.0),
        )

        winning_outcome = TradeOutcome(
            decision_id="win",
            realized_return=0.05,
            holding_duration_hours=24.0,
            total_slippage_bps=5.0,
            fill_rate=1.0,
            hit_target=True,
        )

        losing_outcome = TradeOutcome(
            decision_id="lose",
            realized_return=-0.03,
            holding_duration_hours=24.0,
            total_slippage_bps=5.0,
            fill_rate=1.0,
            hit_stop=True,
        )

        winning_score = post_evaluator.evaluate(plan_score, winning_outcome, sample_market_data)
        losing_score = post_evaluator.evaluate(plan_score, losing_outcome, sample_market_data)

        assert winning_score.outcome_score > losing_score.outcome_score

    def test_notes_generated(self, post_evaluator, sample_outcome, sample_market_data):
        """Test that notes are generated."""
        pre_evaluator = PreExecutionEvaluator()
        plan_score = pre_evaluator.evaluate(
            TradingPlan(
                plan_id="test",
                action=Action.BUY,
                direction=Direction.LONG,
                symbol="TEST",
                entry_price=100.0,
                stop_loss=95.0,
                take_profit=110.0,
                size=100,
                size_unit=SizeUnit.SHARES,
            ),
            MarketContext(symbol="TEST", current_price=100.0),
        )

        outcome_score = post_evaluator.evaluate(plan_score, sample_outcome, sample_market_data)

        # Should have some notes (target hit, return, etc.)
        assert len(outcome_score.notes) > 0

    def test_execution_details_populated(self, post_evaluator, sample_outcome, sample_market_data):
        """Test that execution details are populated."""
        pre_evaluator = PreExecutionEvaluator()
        plan_score = pre_evaluator.evaluate(
            TradingPlan(
                plan_id="test",
                action=Action.BUY,
                direction=Direction.LONG,
                symbol="TEST",
                entry_price=100.0,
                stop_loss=95.0,
                take_profit=110.0,
                size=100,
                size_unit=SizeUnit.SHARES,
            ),
            MarketContext(symbol="TEST", current_price=100.0),
        )

        outcome_score = post_evaluator.evaluate(plan_score, sample_outcome, sample_market_data)

        assert "entry_slippage_bps" in outcome_score.execution_details
        assert "fill_rate" in outcome_score.execution_details
        assert "benchmark_return" in outcome_score.execution_details

    def test_evaluate_batch(self, post_evaluator, sample_outcome, sample_market_data):
        """Test batch evaluation."""
        pre_evaluator = PreExecutionEvaluator()
        plan_score = pre_evaluator.evaluate(
            TradingPlan(
                plan_id="test",
                action=Action.BUY,
                direction=Direction.LONG,
                symbol="TEST",
                entry_price=100.0,
                stop_loss=95.0,
                take_profit=110.0,
                size=100,
                size_unit=SizeUnit.SHARES,
            ),
            MarketContext(symbol="TEST", current_price=100.0),
        )

        plan_scores = [plan_score] * 3
        outcomes = [sample_outcome] * 3
        market_data_list = [sample_market_data] * 3

        outcome_scores = post_evaluator.evaluate_batch(plan_scores, outcomes, market_data_list)

        assert len(outcome_scores) == 3

    def test_aggregate_metrics(self, post_evaluator, sample_outcome, sample_market_data):
        """Test aggregate metrics computation."""
        pre_evaluator = PreExecutionEvaluator()
        plan_score = pre_evaluator.evaluate(
            TradingPlan(
                plan_id="test",
                action=Action.BUY,
                direction=Direction.LONG,
                symbol="TEST",
                entry_price=100.0,
                stop_loss=95.0,
                take_profit=110.0,
                size=100,
                size_unit=SizeUnit.SHARES,
            ),
            MarketContext(symbol="TEST", current_price=100.0),
        )

        # Create multiple outcome scores
        outcomes = [
            TradeOutcome(
                decision_id=f"test-{i}",
                realized_return=0.03 if i % 2 == 0 else -0.02,
                holding_duration_hours=24.0,
                total_slippage_bps=5.0,
                fill_rate=1.0,
            )
            for i in range(10)
        ]

        outcome_scores = [
            post_evaluator.evaluate(plan_score, outcome, sample_market_data) for outcome in outcomes
        ]

        metrics = post_evaluator.compute_aggregate_metrics(outcome_scores)

        assert metrics["count"] == 10
        assert "avg_return" in metrics
        assert "win_rate" in metrics
        assert "sharpe_ratio" in metrics


# ============================================
# Integration Tests
# ============================================


class TestIntegration:
    """Integration tests for pre and post execution evaluators."""

    def test_full_workflow(self, sample_plan, sample_context, sample_outcome, sample_market_data):
        """Test full workflow from pre to post evaluation."""
        # Pre-execution evaluation
        pre_evaluator = PreExecutionEvaluator(rule_scorer=RuleBasedScorer())
        plan_score = pre_evaluator.evaluate(sample_plan, sample_context)

        assert plan_score.overall_score > 0

        # Post-execution evaluation
        post_evaluator = PostExecutionEvaluator()
        outcome_score = post_evaluator.evaluate(plan_score, sample_outcome, sample_market_data)

        assert outcome_score.plan_score == plan_score
        assert outcome_score.decision_id == sample_outcome.decision_id

    def test_to_dict_serialization(
        self, sample_plan, sample_context, sample_outcome, sample_market_data
    ):
        """Test that all results can be serialized to dict."""
        pre_evaluator = PreExecutionEvaluator(rule_scorer=RuleBasedScorer())
        plan_score = pre_evaluator.evaluate(sample_plan, sample_context)

        plan_dict = plan_score.to_dict()
        assert "overall_score" in plan_dict
        assert "dimension_scores" in plan_dict

        post_evaluator = PostExecutionEvaluator()
        outcome_score = post_evaluator.evaluate(plan_score, sample_outcome, sample_market_data)

        outcome_dict = outcome_score.to_dict()
        assert "outcome_score" in outcome_dict
        assert "attribution" in outcome_dict


# ============================================
# Edge Case Tests
# ============================================


class TestEdgeCases:
    """Tests for edge cases."""

    def test_zero_slippage(self, post_evaluator, sample_market_data):
        """Test handling of zero slippage."""
        zero_slippage = TradeOutcome(
            decision_id="test",
            realized_return=0.03,
            holding_duration_hours=24.0,
            total_slippage_bps=0.0,
            fill_rate=1.0,
        )

        pre_evaluator = PreExecutionEvaluator()
        plan_score = pre_evaluator.evaluate(
            TradingPlan(
                plan_id="test",
                action=Action.BUY,
                direction=Direction.LONG,
                symbol="TEST",
                entry_price=100.0,
                stop_loss=95.0,
                take_profit=110.0,
                size=100,
                size_unit=SizeUnit.SHARES,
            ),
            MarketContext(symbol="TEST", current_price=100.0),
        )

        outcome_score = post_evaluator.evaluate(plan_score, zero_slippage, sample_market_data)
        assert outcome_score.execution_quality == 100.0

    def test_zero_vwap(self, post_evaluator):
        """Test handling of zero VWAP values."""
        market_data = MarketData(
            entry_price=100.0,
            exit_price=105.0,
            entry_vwap=0.0,  # Zero VWAP
            exit_vwap=0.0,
            benchmark_return_during_trade=0.02,
        )

        outcome = TradeOutcome(
            decision_id="test",
            realized_return=0.05,
            holding_duration_hours=24.0,
            total_slippage_bps=5.0,
            fill_rate=1.0,
        )

        pre_evaluator = PreExecutionEvaluator()
        plan_score = pre_evaluator.evaluate(
            TradingPlan(
                plan_id="test",
                action=Action.BUY,
                direction=Direction.LONG,
                symbol="TEST",
                entry_price=100.0,
                stop_loss=95.0,
                take_profit=110.0,
                size=100,
                size_unit=SizeUnit.SHARES,
            ),
            MarketContext(symbol="TEST", current_price=100.0),
        )

        # Should not crash
        outcome_score = post_evaluator.evaluate(plan_score, outcome, market_data)
        assert outcome_score.attribution.timing_contribution == 0.0

    def test_negative_benchmark(self, post_evaluator):
        """Test handling of negative benchmark return."""
        market_data = MarketData(
            entry_price=100.0,
            exit_price=95.0,
            entry_vwap=100.1,
            exit_vwap=95.1,
            benchmark_return_during_trade=-0.05,  # Negative
        )

        outcome = TradeOutcome(
            decision_id="test",
            realized_return=-0.03,
            holding_duration_hours=24.0,
            total_slippage_bps=5.0,
            fill_rate=1.0,
        )

        pre_evaluator = PreExecutionEvaluator()
        plan_score = pre_evaluator.evaluate(
            TradingPlan(
                plan_id="test",
                action=Action.BUY,
                direction=Direction.LONG,
                symbol="TEST",
                entry_price=100.0,
                stop_loss=95.0,
                take_profit=110.0,
                size=100,
                size_unit=SizeUnit.SHARES,
            ),
            MarketContext(symbol="TEST", current_price=100.0),
        )

        outcome_score = post_evaluator.evaluate(plan_score, outcome, market_data)
        # Market contribution should be negative
        assert outcome_score.attribution.market_contribution < 0

    def test_partial_fill(self, post_evaluator, sample_market_data):
        """Test handling of partial fill."""
        partial_fill = TradeOutcome(
            decision_id="test",
            realized_return=0.03,
            holding_duration_hours=24.0,
            total_slippage_bps=5.0,
            fill_rate=0.5,  # Only 50% filled
        )

        pre_evaluator = PreExecutionEvaluator()
        plan_score = pre_evaluator.evaluate(
            TradingPlan(
                plan_id="test",
                action=Action.BUY,
                direction=Direction.LONG,
                symbol="TEST",
                entry_price=100.0,
                stop_loss=95.0,
                take_profit=110.0,
                size=100,
                size_unit=SizeUnit.SHARES,
            ),
            MarketContext(symbol="TEST", current_price=100.0),
        )

        outcome_score = post_evaluator.evaluate(plan_score, partial_fill, sample_market_data)
        # Execution quality should be lower due to partial fill
        assert outcome_score.execution_quality < 100.0
