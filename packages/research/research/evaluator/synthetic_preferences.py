"""
Synthetic Preference Generator for Evaluator Training

Implements West-of-N approach and counterfactual analysis to generate
synthetic preference pairs for training the Bradley-Terry reward model.

See: docs/plans/10-research.md - Training Data for Evaluator (Synthetic Preference Pairs)

Example:
    from research.evaluator.synthetic_preferences import SyntheticPreferenceGenerator

    generator = SyntheticPreferenceGenerator()

    # West-of-N: Generate preference pair from context
    context = MarketContext(symbol="AAPL", regime="BULL_TREND", vix=18.5, ...)
    pair = generator.generate_preference_pair(context, n_candidates=8)
    print(f"Chosen score: {pair.chosen_score}, Rejected score: {pair.rejected_score}")

    # Counterfactual: Generate from actual trade outcome
    actual_plan = TradingPlan(action="BUY", entry=150.0, stop=145.0, target=165.0, ...)
    actual_outcome = TradeOutcome(pnl=0.05, slippage=0.001, filled=True, ...)
    pairs = generator.generate_from_counterfactuals(actual_plan, actual_outcome)
"""

from __future__ import annotations

import random

import numpy as np
from numpy.random import PCG64, Generator

from research.evaluator.context_generator import generate_random_contexts
from research.evaluator.counterfactual import CounterfactualEstimator
from research.evaluator.perturbation import (
    PlanPerturbationGenerator,
    identify_perturbation_type,
)
from research.evaluator.plan_generator import PlanGenerator
from research.evaluator.plan_scorer import PlanScorer
from research.evaluator.preference_types import (
    Action,
    Direction,
    MarketContext,
    PreferencePair,
    SizeUnit,
    TradeOutcome,
    TradingPlan,
)

__all__ = [
    "Action",
    "Direction",
    "MarketContext",
    "PreferencePair",
    "SizeUnit",
    "SyntheticPreferenceGenerator",
    "TradeOutcome",
    "TradingPlan",
    "generate_random_contexts",
]


class SyntheticPreferenceGenerator:
    """
    Generator for synthetic preference pairs.

    Implements two approaches:
    1. West-of-N: Generate N candidate plans, rank by rule-based score
    2. Counterfactual: Generate perturbations of actual trades

    Attributes:
        random_seed: Random seed for reproducibility
    """

    def __init__(self, random_seed: int | None = 42) -> None:
        """
        Initialize the preference generator.

        Args:
            random_seed: Random seed for reproducibility. None for random.
        """
        self.random_seed = random_seed
        if random_seed is not None:
            self._rng = random.Random(random_seed)
            self._np_rng = Generator(PCG64(random_seed))
        else:
            self._rng = random.Random()
            self._np_rng = Generator(PCG64())

        self._plan_generator = PlanGenerator(self._rng)
        self._plan_scorer = PlanScorer()
        self._perturbation_gen = PlanPerturbationGenerator(self._rng)
        self._counterfactual_est = CounterfactualEstimator(self._rng)

    def generate_preference_pair(
        self,
        context: MarketContext,
        n_candidates: int = 8,
    ) -> PreferencePair:
        """
        Generate a preference pair using West-of-N approach.

        Generates N candidate plans for the given context, scores each
        using rule-based metrics, then selects the best as "chosen"
        and worst as "rejected".

        Args:
            context: Market context for plan generation
            n_candidates: Number of candidate plans to generate (default: 8)

        Returns:
            PreferencePair with chosen, rejected, and margin

        Raises:
            ValueError: If n_candidates < 2
        """
        if n_candidates < 2:
            raise ValueError("n_candidates must be at least 2")

        candidates = self._plan_generator.generate_candidates(context, n_candidates)
        scored = [(c, self._plan_scorer.rule_based_score(c, context)) for c in candidates]
        scored.sort(key=lambda x: x[1], reverse=True)

        chosen, chosen_score = scored[0]
        rejected, rejected_score = scored[-1]

        return PreferencePair.create(
            chosen=chosen,
            rejected=rejected,
            chosen_score=chosen_score,
            rejected_score=rejected_score,
            context=context,
            source="west_of_n",
            metadata={
                "n_candidates": n_candidates,
                "all_scores": [s for _, s in scored],
            },
        )

    def generate_from_counterfactuals(
        self,
        actual_plan: TradingPlan,
        actual_outcome: TradeOutcome,
        context: MarketContext,
        n_perturbations: int = 4,
    ) -> list[PreferencePair]:
        """
        Generate preference pairs from counterfactual analysis.

        Creates perturbations of the actual plan (entry, exit, sizing)
        and estimates counterfactual outcomes.

        Args:
            actual_plan: The plan that was actually executed
            actual_outcome: The outcome of the actual trade
            context: Market context at execution time
            n_perturbations: Number of perturbations to generate

        Returns:
            List of PreferencePairs based on counterfactual analysis
        """
        pairs: list[PreferencePair] = []

        perturbations = self._perturbation_gen.generate_perturbations(
            actual_plan, context, n_perturbations
        )

        for perturbation in perturbations:
            cf_outcome = self._counterfactual_est.estimate_outcome(
                perturbation, actual_plan, actual_outcome, context
            )

            actual_score = self._plan_scorer.outcome_based_score(
                actual_plan, actual_outcome, context
            )
            cf_score = self._plan_scorer.outcome_based_score(perturbation, cf_outcome, context)

            if actual_score >= cf_score:
                chosen, rejected = actual_plan, perturbation
                chosen_score, rejected_score = actual_score, cf_score
            else:
                chosen, rejected = perturbation, actual_plan
                chosen_score, rejected_score = cf_score, actual_score

            raw_margin = chosen_score - rejected_score
            margin = min(1.0, max(0.0, raw_margin / 100.0))

            if margin < 0.05:
                continue

            pairs.append(
                PreferencePair.create(
                    chosen=chosen,
                    rejected=rejected,
                    chosen_score=chosen_score,
                    rejected_score=rejected_score,
                    context=context,
                    source="counterfactual",
                    metadata={
                        "actual_pnl": actual_outcome.realized_pnl,
                        "cf_pnl": cf_outcome.realized_pnl,
                        "perturbation_type": identify_perturbation_type(actual_plan, perturbation),
                    },
                )
            )

        return pairs

    def generate_batch(
        self,
        contexts: list[MarketContext],
        n_candidates: int = 8,
    ) -> list[PreferencePair]:
        """
        Generate preference pairs for multiple contexts (batch processing).

        Args:
            contexts: List of market contexts
            n_candidates: Number of candidates per context

        Returns:
            List of PreferencePairs
        """
        return [self.generate_preference_pair(ctx, n_candidates) for ctx in contexts]

    def _generate_perturbations(
        self,
        plan: TradingPlan,
        context: MarketContext,
        n_perturbations: int,
    ) -> list[TradingPlan]:
        """Generate perturbations of the original plan."""
        return self._perturbation_gen.generate_perturbations(plan, context, n_perturbations)

    def _identify_perturbation_type(
        self,
        original: TradingPlan,
        perturbation: TradingPlan,
    ) -> str:
        """Identify what type of perturbation was applied."""
        return identify_perturbation_type(original, perturbation)

    def _estimate_counterfactual_outcome(
        self,
        perturbation: TradingPlan,
        original_plan: TradingPlan,
        actual_outcome: TradeOutcome,
        context: MarketContext,
    ) -> TradeOutcome:
        """Estimate counterfactual outcome for a perturbed plan."""
        return self._counterfactual_est.estimate_outcome(
            perturbation, original_plan, actual_outcome, context
        )

    def _rule_based_score(self, plan: TradingPlan, context: MarketContext) -> float:
        """Score a plan using rule-based metrics. Returns score on 0-100 scale."""
        return self._plan_scorer.rule_based_score(plan, context)

    def _outcome_based_score(
        self,
        plan: TradingPlan,
        outcome: TradeOutcome,
        context: MarketContext,
    ) -> float:
        """Score a plan based on its actual or estimated outcome."""
        return self._plan_scorer.outcome_based_score(plan, outcome, context)

    def get_feature_vectors(self, pair: PreferencePair) -> tuple[np.ndarray, np.ndarray]:
        """
        Extract feature vectors from a preference pair.

        Returns tuple of (chosen_features, rejected_features) suitable
        for BradleyTerryRewardModel training.
        """
        chosen_features = pair.chosen.to_feature_vector(pair.context)
        rejected_features = pair.rejected.to_feature_vector(pair.context)
        return chosen_features, rejected_features

    def prepare_training_batch(
        self,
        pairs: list[PreferencePair],
    ) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """
        Prepare a batch of preference pairs for training.

        Args:
            pairs: List of PreferencePairs

        Returns:
            Tuple of (chosen_features, rejected_features, margins)
            Each is a numpy array with shape (batch_size, 128) or (batch_size,)
        """
        chosen_list = []
        rejected_list = []
        margins_list = []

        for pair in pairs:
            chosen_feat, rejected_feat = self.get_feature_vectors(pair)
            chosen_list.append(chosen_feat)
            rejected_list.append(rejected_feat)
            margins_list.append(pair.margin)

        return (
            np.array(chosen_list, dtype=np.float32),
            np.array(rejected_list, dtype=np.float32),
            np.array(margins_list, dtype=np.float32),
        )
