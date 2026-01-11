"""
Training Data Converters

Functions for converting data types to preference pairs for training.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import numpy as np
import torch
from numpy.typing import NDArray

if TYPE_CHECKING:
    from research.evaluator.synthetic_preferences import PreferencePair
    from research.evaluator.training_config import TrainingConfig
    from research.evaluator.training_data_types import ExpertAnnotation, HistoricalOutcome


logger = logging.getLogger(__name__)


def expert_annotations_to_pairs(
    annotations: list[ExpertAnnotation],
    config: TrainingConfig,
    verbose: bool = True,
) -> list[PreferencePair]:
    """
    Convert expert annotations to preference pairs.

    Creates pairs from annotations by comparing ratings:
    - Higher-rated plans are "chosen"
    - Lower-rated plans are "rejected"

    Args:
        annotations: List of expert annotations
        config: Training configuration for filtering thresholds
        verbose: Whether to log progress

    Returns:
        List of preference pairs
    """
    from research.evaluator.synthetic_preferences import PreferencePair

    if len(annotations) < 2:
        return []

    pairs: list[PreferencePair] = []

    sorted_annotations = sorted(annotations, key=lambda a: a.rating, reverse=True)

    n = len(sorted_annotations)
    mid = n // 2

    for i in range(mid):
        chosen_ann = sorted_annotations[i]
        rejected_ann = sorted_annotations[n - 1 - i]

        margin = chosen_ann.rating - rejected_ann.rating
        if margin < config.min_margin:
            continue

        if chosen_ann.rating < config.min_score:
            continue

        pair = PreferencePair(
            pair_id=f"expert_{chosen_ann.annotation_id}_{rejected_ann.annotation_id}",
            chosen=chosen_ann.plan,
            rejected=rejected_ann.plan,
            chosen_score=chosen_ann.rating,
            rejected_score=rejected_ann.rating,
            margin=margin,
            context=chosen_ann.context,
            source="expert",
            metadata={
                "chosen_annotator": chosen_ann.annotator_id,
                "rejected_annotator": rejected_ann.annotator_id,
            },
        )
        pairs.append(pair)

    if verbose:
        logger.info(
            f"Created {len(pairs)} expert preference pairs from {len(annotations)} annotations"
        )

    return pairs


def historical_outcomes_to_pairs(
    outcomes: list[HistoricalOutcome],
    config: TrainingConfig,
    verbose: bool = True,
) -> list[PreferencePair]:
    """
    Convert historical outcomes to preference pairs using stratified sampling.

    Pairs winners (top percentile by return) with losers (bottom percentile)
    to create clear preference signals.

    Args:
        outcomes: List of historical outcomes
        config: Training configuration for stratification percentiles
        verbose: Whether to log progress

    Returns:
        List of preference pairs
    """
    from research.evaluator.synthetic_preferences import PreferencePair

    if len(outcomes) < 2:
        return []

    sorted_outcomes = sorted(outcomes, key=lambda o: o.realized_return, reverse=True)

    n = len(sorted_outcomes)
    top_count = max(1, int(n * config.top_percentile))
    bottom_count = max(1, int(n * config.bottom_percentile))

    top_outcomes = sorted_outcomes[:top_count]
    bottom_outcomes = sorted_outcomes[-bottom_count:]

    pairs: list[PreferencePair] = []

    for top in top_outcomes:
        for bottom in bottom_outcomes:
            return_diff = top.realized_return - bottom.realized_return
            margin = min(1.0, max(0.0, return_diff * 5))

            if margin < config.min_margin:
                continue

            chosen_score = outcome_to_score(top)
            rejected_score = outcome_to_score(bottom)

            pair = PreferencePair(
                pair_id=f"outcome_{top.outcome_id}_{bottom.outcome_id}",
                chosen=top.plan,
                rejected=bottom.plan,
                chosen_score=chosen_score,
                rejected_score=rejected_score,
                margin=margin,
                context=top.context,
                source="historical_outcome",
                metadata={
                    "chosen_return": top.realized_return,
                    "rejected_return": bottom.realized_return,
                    "return_diff": return_diff,
                },
            )
            pairs.append(pair)

    if verbose:
        logger.info(
            f"Created {len(pairs)} outcome preference pairs "
            f"from {len(outcomes)} outcomes (stratified: top {top_count}, "
            f"bottom {bottom_count})"
        )

    return pairs


def outcome_to_score(outcome: HistoricalOutcome) -> float:
    """
    Convert outcome to composite score.

    Args:
        outcome: Historical outcome

    Returns:
        Score between 0 and 1
    """
    return_score = max(0.0, min(1.0, (outcome.realized_return + 0.2) / 0.4))

    exec_factor = outcome.execution_quality

    target_bonus = 0.1 if outcome.hit_target else 0.0
    stop_penalty = -0.1 if outcome.hit_stop else 0.0

    score = return_score * exec_factor + target_bonus + stop_penalty
    return max(0.0, min(1.0, score))


def pairs_to_tensors(
    pairs: list[PreferencePair],
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    """
    Convert preference pairs to training tensors.

    Args:
        pairs: List of preference pairs

    Returns:
        Tuple of (chosen_features, rejected_features, margins)
    """
    chosen_list: list[NDArray[np.float32]] = []
    rejected_list: list[NDArray[np.float32]] = []
    margins_list: list[float] = []

    for pair in pairs:
        chosen_feat = pair.chosen.to_feature_vector(pair.context)
        rejected_feat = pair.rejected.to_feature_vector(pair.context)

        chosen_list.append(chosen_feat)
        rejected_list.append(rejected_feat)
        margins_list.append(pair.margin)

    chosen_features = torch.tensor(np.stack(chosen_list), dtype=torch.float32)
    rejected_features = torch.tensor(np.stack(rejected_list), dtype=torch.float32)
    margins = torch.tensor(margins_list, dtype=torch.float32)

    return chosen_features, rejected_features, margins


__all__ = [
    "expert_annotations_to_pairs",
    "historical_outcomes_to_pairs",
    "outcome_to_score",
    "pairs_to_tensors",
]
