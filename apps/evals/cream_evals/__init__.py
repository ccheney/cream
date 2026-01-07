"""Cream Evaluations - Agent Evaluation Framework.

This package provides DeepEval integration for evaluating the 8-agent
trading network in the Cream trading system.

Features:
- G-Eval custom metrics for each agent type
- Golden test datasets with expected outputs
- Async evaluation runner with parallel execution
- JSON and HTML report generation

Usage:
    from cream_evals import (
        AgentEvaluator,
        get_metric_for_agent,
        get_tests_for_agent,
        run_evaluation,
    )

    # Create evaluator
    evaluator = AgentEvaluator(model="gemini-3-pro-preview")

    # Evaluate a single agent
    summary = await evaluator.evaluate_agent(
        "technical_analyst",
        my_technical_analyst_fn,
    )

    # Or run full evaluation
    report = await run_evaluation(
        agent_fns={"technical_analyst": my_fn, ...},
        output_json="results.json",
        output_html="report.html",
    )
"""

__version__ = "0.1.0"

# Metrics
# Datasets
from .datasets import (
    ALL_GOLDEN_TESTS,
    CRITIC_TESTS,
    FUNDAMENTALS_ANALYST_TESTS,
    NEWS_ANALYST_TESTS,
    RISK_MANAGER_TESTS,
    TECHNICAL_ANALYST_TESTS,
    TRADER_TESTS,
    GoldenTestCase,
    get_all_tests,
    get_tests_by_tag,
    get_tests_for_agent,
)
from .metrics import (
    AGENT_METRICS,
    create_critic_metric,
    create_fundamentals_analyst_metric,
    create_news_analyst_metric,
    create_researcher_metric,
    create_risk_manager_metric,
    create_technical_analyst_metric,
    create_trader_metric,
    get_all_metrics,
    get_metric_for_agent,
)

# Runner
from .runner import (
    AgentEvaluationSummary,
    AgentEvaluator,
    EvaluationResult,
    FullEvaluationReport,
    generate_html_report,
    main,
    run_evaluation,
    save_report_json,
)

__all__ = [
    # Version
    "__version__",
    # Metrics
    "AGENT_METRICS",
    "create_critic_metric",
    "create_fundamentals_analyst_metric",
    "create_news_analyst_metric",
    "create_researcher_metric",
    "create_risk_manager_metric",
    "create_technical_analyst_metric",
    "create_trader_metric",
    "get_all_metrics",
    "get_metric_for_agent",
    # Datasets
    "ALL_GOLDEN_TESTS",
    "CRITIC_TESTS",
    "FUNDAMENTALS_ANALYST_TESTS",
    "GoldenTestCase",
    "NEWS_ANALYST_TESTS",
    "RISK_MANAGER_TESTS",
    "TECHNICAL_ANALYST_TESTS",
    "TRADER_TESTS",
    "get_all_tests",
    "get_tests_by_tag",
    "get_tests_for_agent",
    # Runner
    "AgentEvaluationSummary",
    "AgentEvaluator",
    "EvaluationResult",
    "FullEvaluationReport",
    "generate_html_report",
    "main",
    "run_evaluation",
    "save_report_json",
]
