"""
Evaluator Module - Trading Plan Evaluation

Provides scoring and evaluation of trading plans:
- Rule-based scoring for risk-reward and position sizing
- LLM-based evaluation for qualitative aspects (Phase 12)
"""

from research.evaluator.rule_scorer import RuleBasedScorer, ScoringResult

__all__ = ["RuleBasedScorer", "ScoringResult"]
