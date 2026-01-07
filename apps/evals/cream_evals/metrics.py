"""DeepEval Metrics for Agent Evaluation.

This module provides custom G-Eval metrics for evaluating each agent type
in the Cream trading system.

Agent Types:
- Technical Analyst: Indicator interpretation accuracy
- News Analyst: Sentiment classification accuracy
- Fundamentals Analyst: Valuation reasoning quality
- Researchers (Bull/Bear): Argument quality and evidence usage
- Trader: Decision plan completeness
- Risk Manager: Constraint enforcement accuracy
- Critic: Bias detection accuracy
"""

from deepeval.metrics import GEval  # type: ignore[import-not-found]
from deepeval.test_case import LLMTestCaseParams  # type: ignore[import-not-found]


def create_technical_analyst_metric(model: str = "gemini-3-pro-preview") -> GEval:
    """Create G-Eval metric for Technical Analyst evaluation.

    Evaluates:
    - Correct identification of chart patterns
    - Accurate support/resistance level calculation
    - Proper regime classification
    - Valid invalidation conditions
    """
    return GEval(
        name="TechnicalAnalystAccuracy",
        criteria="""Evaluate the technical analyst's output for accuracy and completeness.
        The analysis should correctly identify chart patterns, calculate meaningful
        support/resistance levels from the price data, properly classify the market
        regime, and provide valid invalidation conditions.""",
        evaluation_params=[
            LLMTestCaseParams.INPUT,
            LLMTestCaseParams.ACTUAL_OUTPUT,
            LLMTestCaseParams.EXPECTED_OUTPUT,
        ],
        evaluation_steps=[
            "Check if the setup classification matches the price action patterns",
            "Verify support/resistance levels are derived from actual price data",
            "Confirm regime labels are from valid set: "
            "BULL_TREND, BEAR_TREND, RANGE, HIGH_VOL, LOW_VOL",
            "Assess if invalidation conditions logically follow from the analysis",
            "Verify technical thesis is grounded in provided indicators",
        ],
        threshold=0.75,
        model=model,
        strict_mode=False,
    )


def create_news_analyst_metric(model: str = "gemini-3-pro-preview") -> GEval:
    """Create G-Eval metric for News Analyst evaluation.

    Evaluates:
    - Correct event type classification
    - Accurate sentiment direction assessment
    - Appropriate impact magnitude estimation
    - Valid duration expectations
    """
    return GEval(
        name="NewsAnalystAccuracy",
        criteria="""Evaluate the news analyst's sentiment analysis for accuracy.
        The analysis should correctly classify event types, accurately assess
        sentiment direction and magnitude, and provide reasonable duration
        expectations based on the type of news event.""",
        evaluation_params=[
            LLMTestCaseParams.INPUT,
            LLMTestCaseParams.ACTUAL_OUTPUT,
            LLMTestCaseParams.EXPECTED_OUTPUT,
        ],
        evaluation_steps=[
            "Check if event types match the actual news content (EARNINGS, GUIDANCE, M&A, etc.)",
            "Verify sentiment direction aligns with the news tone and content",
            "Assess if impact magnitude is proportional to the event significance",
            "Confirm duration expectation matches the event type characteristics",
            "Check that linked_event_ids reference valid events from context",
        ],
        threshold=0.8,
        model=model,
        strict_mode=False,
    )


def create_fundamentals_analyst_metric(model: str = "gemini-3-pro-preview") -> GEval:
    """Create G-Eval metric for Fundamentals Analyst evaluation.

    Evaluates:
    - Accurate valuation context assessment
    - Correct macro factor identification
    - Proper event risk assessment
    - Valid prediction market signal interpretation
    """
    return GEval(
        name="FundamentalsAnalystAccuracy",
        criteria="""Evaluate the fundamentals analyst's analysis for accuracy and insight.
        The analysis should accurately assess valuation context using provided metrics,
        correctly identify relevant macro factors, properly assess event risks, and
        validly interpret prediction market signals when available.""",
        evaluation_params=[
            LLMTestCaseParams.INPUT,
            LLMTestCaseParams.ACTUAL_OUTPUT,
            LLMTestCaseParams.EXPECTED_OUTPUT,
        ],
        evaluation_steps=[
            "Check if fundamental drivers are grounded in provided financial data",
            "Verify valuation context references actual metrics (P/E, growth rate)",
            "Assess if macro context is relevant to the specific instrument",
            "Confirm event risk assessments have appropriate impact ratings",
            "Check prediction market signal interpretation follows documented rules",
        ],
        threshold=0.8,
        model=model,
        strict_mode=False,
    )


def create_researcher_metric(model: str = "gemini-3-pro-preview") -> GEval:
    """Create G-Eval metric for Researcher (Bull/Bear) evaluation.

    Evaluates:
    - Argument quality and coherence
    - Evidence usage from analyst outputs
    - Valid memory case references
    - Honest acknowledgment of counterarguments
    """
    return GEval(
        name="ResearcherArgumentQuality",
        criteria="""Evaluate the researcher's thesis construction for argument quality.
        The thesis should present coherent arguments, properly reference evidence
        from analyst outputs, include valid memory case references, and honestly
        acknowledge the strongest counterarguments.""",
        evaluation_params=[
            LLMTestCaseParams.INPUT,
            LLMTestCaseParams.ACTUAL_OUTPUT,
            LLMTestCaseParams.EXPECTED_OUTPUT,
        ],
        evaluation_steps=[
            "Check if supporting factors are traced to actual analyst outputs",
            "Verify the thesis narrative logically connects evidence to conclusion",
            "Assess if conviction level is justified by evidence strength",
            "Confirm strongest_counterargument is genuine and not a strawman",
            "Check that memory_case_ids reference retrievable historical cases",
        ],
        threshold=0.75,
        model=model,
        strict_mode=False,
    )


def create_trader_metric(model: str = "gemini-3-pro-preview") -> GEval:
    """Create G-Eval metric for Trader evaluation.

    Evaluates:
    - Decision plan completeness
    - Stop-loss and take-profit validity
    - Size calculation appropriateness
    - Rationale coherence with analyst inputs
    """
    return GEval(
        name="TraderDecisionQuality",
        criteria="""Evaluate the trader's decision plan for completeness and validity.
        Every new position must have stop-loss and take-profit levels. Sizes should
        follow Kelly-inspired methodology. The rationale should logically follow
        from the bull/bear debate resolution.""",
        evaluation_params=[
            LLMTestCaseParams.INPUT,
            LLMTestCaseParams.ACTUAL_OUTPUT,
            LLMTestCaseParams.EXPECTED_OUTPUT,
        ],
        evaluation_steps=[
            "Verify every BUY/SELL decision has stopLoss and takeProfit defined",
            "Check if direction matches the debate resolution (bullish > bearish = LONG)",
            "Assess if position sizes respect portfolio constraints",
            "Confirm risk/reward ratio is at least 1.5:1",
            "Verify rationale references actual factors from analyst outputs",
            "Check prediction market sizing adjustments if PM data was provided",
        ],
        threshold=0.8,
        model=model,
        strict_mode=False,
    )


def create_risk_manager_metric(model: str = "gemini-3-pro-preview") -> GEval:
    """Create G-Eval metric for Risk Manager evaluation.

    Evaluates:
    - Constraint violation detection accuracy
    - Correct severity classification
    - Actionable required_changes
    - Proper APPROVE/REJECT logic
    """
    return GEval(
        name="RiskManagerAccuracy",
        criteria="""Evaluate the risk manager's validation for accuracy and completeness.
        All constraint violations should be detected and correctly classified by
        severity. Required changes should be specific and actionable. The verdict
        should logically follow from the violations found.""",
        evaluation_params=[
            LLMTestCaseParams.INPUT,
            LLMTestCaseParams.ACTUAL_OUTPUT,
            LLMTestCaseParams.EXPECTED_OUTPUT,
        ],
        evaluation_steps=[
            "Check if all constraint violations in the plan were detected",
            "Verify severity classification follows documented rules (CRITICAL vs WARNING)",
            "Assess if required_changes are specific enough to be actionable",
            "Confirm verdict logic: REJECT if any CRITICAL, APPROVE if only WARNINGs",
            "Check prediction market risk rules are applied when PM data present",
        ],
        threshold=0.85,
        model=model,
        strict_mode=False,
    )


def create_critic_metric(model: str = "gemini-3-pro-preview") -> GEval:
    """Create G-Eval metric for Critic evaluation.

    Evaluates:
    - Hallucination detection accuracy
    - Logic inconsistency identification
    - Evidence tracing validity
    - Proper APPROVE/REJECT logic
    """
    return GEval(
        name="CriticAccuracy",
        criteria="""Evaluate the critic's audit for accuracy in detecting inconsistencies.
        The critic should correctly identify hallucinated evidence, detect logic
        reversals (bullish evidence -> bearish action), and properly trace claims
        back to analyst outputs.""",
        evaluation_params=[
            LLMTestCaseParams.INPUT,
            LLMTestCaseParams.ACTUAL_OUTPUT,
            LLMTestCaseParams.EXPECTED_OUTPUT,
        ],
        evaluation_steps=[
            "Check if hallucinated claims were correctly flagged",
            "Verify logic inconsistencies were detected (direction vs evidence mismatch)",
            "Assess if evidence tracing correctly identifies unsupported claims",
            "Confirm verdict follows rejection criteria (hallucination = REJECT)",
            "Check that fabricated memory references are flagged",
        ],
        threshold=0.8,
        model=model,
        strict_mode=False,
    )


# Metric registry for easy access
AGENT_METRICS = {
    "technical_analyst": create_technical_analyst_metric,
    "news_analyst": create_news_analyst_metric,
    "fundamentals_analyst": create_fundamentals_analyst_metric,
    "bullish_researcher": create_researcher_metric,
    "bearish_researcher": create_researcher_metric,
    "trader": create_trader_metric,
    "risk_manager": create_risk_manager_metric,
    "critic": create_critic_metric,
}


def get_metric_for_agent(agent_type: str, model: str = "gemini-3-pro-preview") -> GEval:
    """Get the appropriate G-Eval metric for an agent type.

    Args:
        agent_type: One of the 8 agent types
        model: LLM model to use for evaluation

    Returns:
        Configured G-Eval metric for the agent type

    Raises:
        ValueError: If agent_type is not recognized
    """
    if agent_type not in AGENT_METRICS:
        raise ValueError(
            f"Unknown agent type: {agent_type}. Valid types: {list(AGENT_METRICS.keys())}"
        )
    return AGENT_METRICS[agent_type](model=model)


def get_all_metrics(model: str = "gemini-3-pro-preview") -> dict[str, GEval]:
    """Get all agent metrics.

    Args:
        model: LLM model to use for evaluation

    Returns:
        Dictionary mapping agent types to their metrics
    """
    return {agent: factory(model=model) for agent, factory in AGENT_METRICS.items()}
