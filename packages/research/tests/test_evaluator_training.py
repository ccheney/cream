"""
Tests for Evaluator Training Pipeline

Tests the four-phase curriculum training:
1. Expert bootstrap
2. Historical outcomes
3. Synthetic augmentation
4. Calibration
"""

import tempfile

import pytest
import torch

from research.evaluator.bradley_terry import BradleyTerryRewardModel
from research.evaluator.calibration import ProbabilityCalibrator
from research.evaluator.synthetic_preferences import (
    Action,
    Direction,
    MarketContext,
    PreferencePair,
    SizeUnit,
    SyntheticPreferenceGenerator,
    TradingPlan,
)
from research.evaluator.training import (
    EvaluatorTrainingPipeline,
    ExpertAnnotation,
    HistoricalOutcome,
    PhaseProgress,
    TrainingConfig,
    TrainingPhase,
    TrainingResult,
)

# ============================================
# Fixtures
# ============================================


@pytest.fixture
def sample_plan() -> TradingPlan:
    """Create a sample trading plan."""
    return TradingPlan(
        plan_id="plan_001",
        action=Action.BUY,
        direction=Direction.LONG,
        symbol="AAPL",
        entry_price=150.0,
        stop_loss=145.0,
        take_profit=165.0,
        size=0.05,
        size_unit=SizeUnit.PCT_EQUITY,
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
        vix=18.0,
        atr_pct=0.02,
        rsi=55.0,
        trend_strength=0.5,
        volume_ratio=1.2,
        sector="technology",
    )


@pytest.fixture
def sample_annotation(sample_plan, sample_context) -> ExpertAnnotation:
    """Create a sample expert annotation."""
    return ExpertAnnotation(
        annotation_id="ann_001",
        plan=sample_plan,
        context=sample_context,
        rating=0.8,
        annotator_id="expert_1",
    )


@pytest.fixture
def sample_outcome(sample_plan, sample_context) -> HistoricalOutcome:
    """Create a sample historical outcome."""
    return HistoricalOutcome(
        outcome_id="out_001",
        plan=sample_plan,
        context=sample_context,
        realized_return=0.05,
        risk_adjusted_return=0.8,
        holding_duration_hours=24,
        hit_target=True,
    )


@pytest.fixture
def model() -> BradleyTerryRewardModel:
    """Create a test model."""
    return BradleyTerryRewardModel(input_dim=128)


@pytest.fixture
def generator() -> SyntheticPreferenceGenerator:
    """Create a synthetic generator."""
    return SyntheticPreferenceGenerator(random_seed=42)


@pytest.fixture
def calibrator() -> ProbabilityCalibrator:
    """Create a calibrator."""
    return ProbabilityCalibrator()


@pytest.fixture
def config() -> TrainingConfig:
    """Create test configuration."""
    return TrainingConfig(
        expert_epochs=2,
        outcome_epochs=2,
        synthetic_epochs=2,
        batch_size=4,
        learning_rate=1e-3,
        save_checkpoints=False,
        verbose=False,
    )


@pytest.fixture
def pipeline(model, generator, calibrator, config) -> EvaluatorTrainingPipeline:
    """Create a test pipeline."""
    return EvaluatorTrainingPipeline(
        model=model,
        generator=generator,
        calibrator=calibrator,
        config=config,
    )


# ============================================
# Test TrainingConfig
# ============================================


class TestTrainingConfig:
    """Tests for TrainingConfig."""

    def test_default_values(self):
        """Test default configuration values."""
        config = TrainingConfig()

        assert config.expert_epochs == 10
        assert config.outcome_epochs == 20
        assert config.synthetic_epochs == 10
        assert config.batch_size == 32
        assert config.learning_rate == 1e-4
        assert config.synthetic_multiplier == 2.0

    def test_custom_values(self):
        """Test custom configuration."""
        config = TrainingConfig(
            expert_epochs=5,
            outcome_epochs=15,
            batch_size=64,
        )

        assert config.expert_epochs == 5
        assert config.outcome_epochs == 15
        assert config.batch_size == 64


# ============================================
# Test ExpertAnnotation
# ============================================


class TestExpertAnnotation:
    """Tests for ExpertAnnotation."""

    def test_create_annotation(self, sample_plan, sample_context):
        """Test creating an expert annotation."""
        ann = ExpertAnnotation(
            annotation_id="test_001",
            plan=sample_plan,
            context=sample_context,
            rating=0.75,
            annotator_id="expert_1",
        )

        assert ann.annotation_id == "test_001"
        assert ann.rating == 0.75
        assert ann.annotator_id == "expert_1"

    def test_to_dict(self, sample_annotation):
        """Test annotation serialization."""
        d = sample_annotation.to_dict()

        assert "annotation_id" in d
        assert "rating" in d
        assert d["annotation_id"] == "ann_001"


# ============================================
# Test HistoricalOutcome
# ============================================


class TestHistoricalOutcome:
    """Tests for HistoricalOutcome."""

    def test_create_outcome(self, sample_plan, sample_context):
        """Test creating a historical outcome."""
        outcome = HistoricalOutcome(
            outcome_id="out_001",
            plan=sample_plan,
            context=sample_context,
            realized_return=0.05,
            hit_target=True,
        )

        assert outcome.outcome_id == "out_001"
        assert outcome.realized_return == 0.05
        assert outcome.hit_target is True

    def test_to_dict(self, sample_outcome):
        """Test outcome serialization."""
        d = sample_outcome.to_dict()

        assert "outcome_id" in d
        assert "realized_return" in d
        assert d["realized_return"] == 0.05


# ============================================
# Test TrainingResult
# ============================================


class TestTrainingResult:
    """Tests for TrainingResult."""

    def test_default_result(self):
        """Test default result values."""
        result = TrainingResult(success=True, final_loss=0.5)

        assert result.success is True
        assert result.final_loss == 0.5
        assert result.phases_completed == []

    def test_to_dict(self):
        """Test result serialization."""
        result = TrainingResult(
            success=True,
            final_loss=0.5,
            phases_completed=[TrainingPhase.EXPERT_BOOTSTRAP],
        )
        d = result.to_dict()

        assert d["success"] is True
        assert d["final_loss"] == 0.5
        assert "expert_bootstrap" in d["phases_completed"]


# ============================================
# Test EvaluatorTrainingPipeline
# ============================================


class TestEvaluatorTrainingPipeline:
    """Tests for EvaluatorTrainingPipeline."""

    def test_init_basic(self, model):
        """Test basic initialization."""
        pipeline = EvaluatorTrainingPipeline(model=model)

        assert pipeline.model is model
        assert pipeline.generator is None
        assert pipeline.calibrator is None

    def test_init_with_components(self, model, generator, calibrator, config):
        """Test initialization with all components."""
        pipeline = EvaluatorTrainingPipeline(
            model=model,
            generator=generator,
            calibrator=calibrator,
            config=config,
        )

        assert pipeline.model is model
        assert pipeline.generator is generator
        assert pipeline.calibrator is calibrator

    def test_init_requires_model(self):
        """Test that model is required."""
        with pytest.raises(ValueError, match="model is required"):
            EvaluatorTrainingPipeline(model=None)


class TestExpertToPairs:
    """Tests for _expert_to_pairs conversion."""

    def test_convert_annotations(self, pipeline, sample_plan, sample_context):
        """Test converting expert annotations to pairs."""
        # Create annotations with different ratings
        annotations = [
            ExpertAnnotation(
                annotation_id=f"ann_{i}",
                plan=sample_plan,
                context=sample_context,
                rating=0.9 - (i * 0.2),
            )
            for i in range(5)
        ]

        pairs = pipeline._expert_to_pairs(annotations)

        assert len(pairs) > 0
        # Check pair structure
        pair = pairs[0]
        assert pair.source == "expert"
        assert pair.chosen_score > pair.rejected_score

    def test_empty_annotations(self, pipeline):
        """Test handling empty annotations."""
        pairs = pipeline._expert_to_pairs([])

        assert pairs == []

    def test_single_annotation(self, pipeline, sample_annotation):
        """Test handling single annotation."""
        pairs = pipeline._expert_to_pairs([sample_annotation])

        assert pairs == []  # Need at least 2 for pairing

    def test_filters_low_margin(self, pipeline, sample_plan, sample_context):
        """Test that low-margin pairs are filtered."""
        # Create annotations with close ratings
        annotations = [
            ExpertAnnotation(
                annotation_id="ann_1",
                plan=sample_plan,
                context=sample_context,
                rating=0.5,
            ),
            ExpertAnnotation(
                annotation_id="ann_2",
                plan=sample_plan,
                context=sample_context,
                rating=0.45,  # Very close
            ),
        ]

        pipeline.config.min_margin = 0.1
        pairs = pipeline._expert_to_pairs(annotations)

        # Should be filtered due to low margin
        assert len(pairs) == 0


class TestOutcomesToPairs:
    """Tests for _outcomes_to_pairs conversion."""

    def test_convert_outcomes(self, pipeline, sample_plan, sample_context):
        """Test converting outcomes to pairs."""
        outcomes = [
            HistoricalOutcome(
                outcome_id=f"out_{i}",
                plan=sample_plan,
                context=sample_context,
                realized_return=0.1 - (i * 0.05),  # Decreasing returns
            )
            for i in range(10)
        ]

        pairs = pipeline._outcomes_to_pairs(outcomes)

        assert len(pairs) > 0
        # Check stratification worked
        pair = pairs[0]
        assert pair.source == "historical_outcome"
        assert "return_diff" in pair.metadata

    def test_stratified_sampling(self, pipeline, sample_plan, sample_context):
        """Test stratified sampling selects top/bottom percentiles."""
        outcomes = [
            HistoricalOutcome(
                outcome_id=f"out_{i}",
                plan=sample_plan,
                context=sample_context,
                realized_return=i * 0.01,  # 0% to 9%
            )
            for i in range(10)
        ]

        pipeline.config.top_percentile = 0.3
        pipeline.config.bottom_percentile = 0.3
        pairs = pipeline._outcomes_to_pairs(outcomes)

        # Top 3 × Bottom 3 = 9 pairs max
        assert len(pairs) > 0

        # Check all pairs have positive return_diff
        for pair in pairs:
            assert pair.metadata["return_diff"] > 0

    def test_empty_outcomes(self, pipeline):
        """Test handling empty outcomes."""
        pairs = pipeline._outcomes_to_pairs([])

        assert pairs == []


class TestOutcomeToScore:
    """Tests for _outcome_to_score conversion."""

    def test_positive_return(self, pipeline, sample_outcome):
        """Test score for positive return."""
        score = pipeline._outcome_to_score(sample_outcome)

        assert 0.0 <= score <= 1.0
        assert score > 0.5  # Positive return should be > 0.5

    def test_negative_return(self, pipeline, sample_plan, sample_context):
        """Test score for negative return."""
        outcome = HistoricalOutcome(
            outcome_id="out_neg",
            plan=sample_plan,
            context=sample_context,
            realized_return=-0.1,
            hit_stop=True,
        )

        score = pipeline._outcome_to_score(outcome)

        assert 0.0 <= score <= 1.0
        assert score < 0.5  # Negative return should be < 0.5

    def test_target_hit_bonus(self, pipeline, sample_plan, sample_context):
        """Test bonus for hitting target."""
        outcome_no_target = HistoricalOutcome(
            outcome_id="out_1",
            plan=sample_plan,
            context=sample_context,
            realized_return=0.05,
            hit_target=False,
        )
        outcome_with_target = HistoricalOutcome(
            outcome_id="out_2",
            plan=sample_plan,
            context=sample_context,
            realized_return=0.05,
            hit_target=True,
        )

        score_no_target = pipeline._outcome_to_score(outcome_no_target)
        score_with_target = pipeline._outcome_to_score(outcome_with_target)

        assert score_with_target > score_no_target


class TestSyntheticPairGeneration:
    """Tests for synthetic pair generation."""

    def test_generate_synthetic_pairs(self, pipeline, sample_plan, sample_context):
        """Test generating synthetic pairs."""
        # Add some base pairs
        pipeline._all_pairs = [
            PreferencePair(
                pair_id="base_1",
                chosen=sample_plan,
                rejected=sample_plan,
                chosen_score=0.8,
                rejected_score=0.3,
                margin=0.5,
                context=sample_context,
            )
        ]

        pairs = pipeline._generate_synthetic_pairs()

        assert len(pairs) > 0

    def test_no_generator(self, model, config, sample_plan, sample_context):
        """Test without generator."""
        pipeline = EvaluatorTrainingPipeline(model=model, config=config)
        pipeline._all_pairs = [
            PreferencePair(
                pair_id="base_1",
                chosen=sample_plan,
                rejected=sample_plan,
                chosen_score=0.8,
                rejected_score=0.3,
                margin=0.5,
                context=sample_context,
            )
        ]

        pairs = pipeline._generate_synthetic_pairs()

        assert pairs == []


class TestTrainPhase:
    """Tests for _train_phase."""

    def test_train_single_epoch(self, pipeline, sample_plan, sample_context):
        """Test training for a single epoch."""
        pairs = [
            PreferencePair(
                pair_id=f"pair_{i}",
                chosen=sample_plan,
                rejected=sample_plan,
                chosen_score=0.8,
                rejected_score=0.3,
                margin=0.5,
                context=sample_context,
            )
            for i in range(10)
        ]

        # Initialize optimizer
        pipeline._optimizer = torch.optim.Adam(
            pipeline.model.parameters(),
            lr=pipeline.config.learning_rate,
        )

        losses = pipeline._train_phase(
            TrainingPhase.EXPERT_BOOTSTRAP,
            pairs,
            epochs=1,
        )

        assert len(losses) == 1
        assert losses[0] > 0  # Loss should be positive

    def test_train_decreasing_loss(self, pipeline, sample_plan, sample_context):
        """Test that loss decreases over training."""
        pairs = [
            PreferencePair(
                pair_id=f"pair_{i}",
                chosen=sample_plan,
                rejected=sample_plan,
                chosen_score=0.9,
                rejected_score=0.1,
                margin=0.8,
                context=sample_context,
            )
            for i in range(20)
        ]

        # Use higher learning rate for faster convergence in test
        pipeline._optimizer = torch.optim.Adam(
            pipeline.model.parameters(),
            lr=1e-2,
        )

        losses = pipeline._train_phase(
            TrainingPhase.EXPERT_BOOTSTRAP,
            pairs,
            epochs=10,
        )

        assert len(losses) == 10
        # Loss should generally decrease (compare first half avg vs second half avg)
        first_half_avg = sum(losses[:5]) / 5
        second_half_avg = sum(losses[5:]) / 5
        assert second_half_avg <= first_half_avg * 1.1  # Allow 10% tolerance

    def test_progress_callback(self, pipeline, sample_plan, sample_context):
        """Test progress callback is called."""
        pairs = [
            PreferencePair(
                pair_id="pair_1",
                chosen=sample_plan,
                rejected=sample_plan,
                chosen_score=0.8,
                rejected_score=0.3,
                margin=0.5,
                context=sample_context,
            )
            for _ in range(8)
        ]

        progress_updates = []

        def callback(progress: PhaseProgress):
            progress_updates.append(progress)

        pipeline.set_progress_callback(callback)
        pipeline._optimizer = torch.optim.Adam(
            pipeline.model.parameters(),
            lr=pipeline.config.learning_rate,
        )

        pipeline._train_phase(TrainingPhase.EXPERT_BOOTSTRAP, pairs, epochs=1)

        assert len(progress_updates) > 0
        assert progress_updates[0].phase == TrainingPhase.EXPERT_BOOTSTRAP


class TestPairsToTensors:
    """Tests for _pairs_to_tensors."""

    def test_convert_pairs(self, pipeline, sample_plan, sample_context):
        """Test converting pairs to tensors."""
        pairs = [
            PreferencePair(
                pair_id="pair_1",
                chosen=sample_plan,
                rejected=sample_plan,
                chosen_score=0.8,
                rejected_score=0.3,
                margin=0.5,
                context=sample_context,
            )
        ]

        chosen, rejected, margins = pipeline._pairs_to_tensors(pairs)

        assert chosen.shape == (1, 128)
        assert rejected.shape == (1, 128)
        assert margins.shape == (1,)
        assert margins[0].item() == 0.5


class TestCalibrateModel:
    """Tests for _calibrate_model."""

    def test_calibration(self, pipeline, sample_plan, sample_context):
        """Test model calibration."""
        outcomes = [
            HistoricalOutcome(
                outcome_id=f"out_{i}",
                plan=sample_plan,
                context=sample_context,
                realized_return=0.05 if i % 2 == 0 else -0.05,
            )
            for i in range(100)
        ]

        metrics = pipeline._calibrate_model(outcomes)

        assert "sample_count" in metrics
        assert metrics["sample_count"] == 100

    def test_no_calibrator(self, model, config, sample_plan, sample_context):
        """Test without calibrator."""
        pipeline = EvaluatorTrainingPipeline(model=model, config=config)

        outcomes = [
            HistoricalOutcome(
                outcome_id="out_1",
                plan=sample_plan,
                context=sample_context,
                realized_return=0.05,
            )
        ]

        metrics = pipeline._calibrate_model(outcomes)

        assert metrics == {}


class TestCheckpointing:
    """Tests for checkpointing."""

    def test_save_checkpoint(self, pipeline):
        """Test saving checkpoint."""
        with tempfile.TemporaryDirectory() as tmpdir:
            pipeline.config.checkpoint_dir = tmpdir
            pipeline.config.save_checkpoints = True

            # Initialize optimizer
            pipeline._optimizer = torch.optim.Adam(
                pipeline.model.parameters(),
                lr=pipeline.config.learning_rate,
            )

            path = pipeline._save_checkpoint("test_phase")

            assert path.exists()
            assert "test_phase" in path.name

    def test_load_checkpoint(self, pipeline):
        """Test loading checkpoint."""
        with tempfile.TemporaryDirectory() as tmpdir:
            pipeline.config.checkpoint_dir = tmpdir
            pipeline._optimizer = torch.optim.Adam(
                pipeline.model.parameters(),
                lr=pipeline.config.learning_rate,
            )

            # Save checkpoint
            path = pipeline._save_checkpoint("test_phase")

            # Modify model
            original_weight = pipeline.model.network[0].weight.clone()
            pipeline.model.network[0].weight.data.fill_(0)

            # Load checkpoint
            pipeline.load_checkpoint(path)

            # Weights should be restored
            restored_weight = pipeline.model.network[0].weight
            assert torch.allclose(original_weight, restored_weight)


class TestFullPipeline:
    """Integration tests for full pipeline."""

    def test_train_expert_only(self, pipeline, sample_plan, sample_context):
        """Test training with expert annotations only."""
        annotations = [
            ExpertAnnotation(
                annotation_id=f"ann_{i}",
                plan=sample_plan,
                context=sample_context,
                rating=0.9 - (i * 0.15),
            )
            for i in range(6)
        ]

        result = pipeline.train(expert_annotations=annotations)

        assert result.success
        assert TrainingPhase.EXPERT_BOOTSTRAP in result.phases_completed
        assert "expert_bootstrap" in result.phase_losses

    def test_train_outcomes_only(self, pipeline, sample_plan, sample_context):
        """Test training with outcomes only."""
        outcomes = [
            HistoricalOutcome(
                outcome_id=f"out_{i}",
                plan=sample_plan,
                context=sample_context,
                realized_return=0.1 - (i * 0.02),
            )
            for i in range(15)
        ]

        result = pipeline.train(historical_outcomes=outcomes)

        assert result.success
        assert TrainingPhase.HISTORICAL_OUTCOMES in result.phases_completed

    def test_train_full_pipeline(self, pipeline, sample_plan, sample_context):
        """Test full four-phase training."""
        annotations = [
            ExpertAnnotation(
                annotation_id=f"ann_{i}",
                plan=sample_plan,
                context=sample_context,
                rating=0.9 - (i * 0.15),
            )
            for i in range(6)
        ]

        outcomes = [
            HistoricalOutcome(
                outcome_id=f"out_{i}",
                plan=sample_plan,
                context=sample_context,
                realized_return=0.1 - (i * 0.02),
            )
            for i in range(15)
        ]

        result = pipeline.train(
            expert_annotations=annotations,
            historical_outcomes=outcomes,
        )

        assert result.success
        assert result.total_pairs_trained > 0
        assert result.training_time_seconds > 0
        # Should have at least expert and outcomes phases
        assert len(result.phases_completed) >= 2

    def test_train_empty_data(self, pipeline):
        """Test training with no data."""
        result = pipeline.train()

        # Should succeed but do nothing
        assert result.success
        assert result.phases_completed == []


class TestEvaluatePairs:
    """Tests for evaluate_pairs."""

    def test_evaluate(self, pipeline, sample_plan, sample_context):
        """Test evaluating pairs."""
        pairs = [
            PreferencePair(
                pair_id="pair_1",
                chosen=sample_plan,
                rejected=sample_plan,
                chosen_score=0.8,
                rejected_score=0.3,
                margin=0.5,
                context=sample_context,
            )
            for _ in range(5)
        ]

        metrics = pipeline.evaluate_pairs(pairs)

        assert "accuracy" in metrics
        assert "loss" in metrics
        assert "count" in metrics
        assert metrics["count"] == 5

    def test_evaluate_empty(self, pipeline):
        """Test evaluating empty pairs."""
        metrics = pipeline.evaluate_pairs([])

        assert metrics["count"] == 0


class TestTrainOnPairs:
    """Tests for train_on_pairs convenience method."""

    def test_train_on_pairs(self, pipeline, sample_plan, sample_context):
        """Test direct training on pairs."""
        pairs = [
            PreferencePair(
                pair_id=f"pair_{i}",
                chosen=sample_plan,
                rejected=sample_plan,
                chosen_score=0.8,
                rejected_score=0.3,
                margin=0.5,
                context=sample_context,
            )
            for i in range(10)
        ]

        losses = pipeline.train_on_pairs(pairs, epochs=2)

        assert len(losses) == 2
        assert all(loss > 0 for loss in losses)
