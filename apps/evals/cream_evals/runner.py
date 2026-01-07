"""Evaluation Runner for Agent Testing.

This module provides the main entry point for running agent evaluations
using DeepEval metrics and golden test datasets.
"""

import asyncio
import json
from collections.abc import Awaitable, Callable
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path

from deepeval.test_case import LLMTestCase  # type: ignore[import-not-found]

from .datasets import GoldenTestCase, get_tests_for_agent
from .metrics import get_all_metrics


@dataclass
class EvaluationResult:
    """Result of a single test case evaluation."""

    agent_type: str
    test_name: str
    passed: bool
    score: float
    threshold: float
    reason: str | None
    input_preview: str
    actual_output_preview: str


@dataclass
class AgentEvaluationSummary:
    """Summary of all evaluations for an agent type."""

    agent_type: str
    total_tests: int
    passed_tests: int
    failed_tests: int
    average_score: float
    threshold: float
    results: list[EvaluationResult]


@dataclass
class FullEvaluationReport:
    """Complete evaluation report across all agents."""

    timestamp: str
    model: str
    total_tests: int
    total_passed: int
    total_failed: int
    overall_pass_rate: float
    agent_summaries: dict[str, AgentEvaluationSummary]


class AgentEvaluator:
    """Evaluates trading agents using DeepEval metrics."""

    def __init__(
        self,
        model: str = "gemini-3-pro-preview",
        max_workers: int = 4,
        timeout: int = 60,
    ):
        """Initialize the evaluator.

        Args:
            model: LLM model to use for G-Eval judgments
            max_workers: Maximum parallel evaluations
            timeout: Timeout per evaluation in seconds
        """
        self.model = model
        self.max_workers = max_workers
        self.timeout = timeout
        self._metrics = get_all_metrics(model)

    async def evaluate_agent(
        self,
        agent_type: str,
        agent_fn: Callable[[str], Awaitable[str]],
        tests: list[GoldenTestCase] | None = None,
    ) -> AgentEvaluationSummary:
        """Evaluate a single agent type.

        Args:
            agent_type: The type of agent to evaluate
            agent_fn: Async function that takes input and returns agent output
            tests: Optional list of test cases (defaults to golden tests)

        Returns:
            AgentEvaluationSummary with all results
        """
        if tests is None:
            tests = get_tests_for_agent(agent_type)

        if not tests:
            return AgentEvaluationSummary(
                agent_type=agent_type,
                total_tests=0,
                passed_tests=0,
                failed_tests=0,
                average_score=0.0,
                threshold=0.0,
                results=[],
            )

        metric = self._metrics[agent_type]
        results: list[EvaluationResult] = []

        # Run evaluations with concurrency limit
        semaphore = asyncio.Semaphore(self.max_workers)

        async def run_single(test: GoldenTestCase) -> EvaluationResult:
            async with semaphore:
                try:
                    # Get agent output
                    actual_output = await asyncio.wait_for(
                        agent_fn(test.input_context),
                        timeout=self.timeout,
                    )

                    # Create test case
                    test_case = LLMTestCase(
                        input=test.input_context,
                        actual_output=actual_output,
                        expected_output=test.expected_output,
                    )

                    # Run metric
                    metric.measure(test_case)

                    return EvaluationResult(
                        agent_type=agent_type,
                        test_name=test.name,
                        passed=metric.score >= metric.threshold,
                        score=metric.score,
                        threshold=metric.threshold,
                        reason=metric.reason,
                        input_preview=test.input_context[:200] + "...",
                        actual_output_preview=actual_output[:200] + "...",
                    )
                except TimeoutError:
                    return EvaluationResult(
                        agent_type=agent_type,
                        test_name=test.name,
                        passed=False,
                        score=0.0,
                        threshold=metric.threshold,
                        reason="Evaluation timed out",
                        input_preview=test.input_context[:200] + "...",
                        actual_output_preview="TIMEOUT",
                    )
                except Exception as e:
                    return EvaluationResult(
                        agent_type=agent_type,
                        test_name=test.name,
                        passed=False,
                        score=0.0,
                        threshold=metric.threshold,
                        reason=f"Error: {e!s}",
                        input_preview=test.input_context[:200] + "...",
                        actual_output_preview="ERROR",
                    )

        # Run all tests concurrently
        results = await asyncio.gather(*[run_single(test) for test in tests])

        # Compute summary
        passed = sum(1 for r in results if r.passed)
        scores = [r.score for r in results if r.score > 0]
        avg_score = sum(scores) / len(scores) if scores else 0.0

        return AgentEvaluationSummary(
            agent_type=agent_type,
            total_tests=len(results),
            passed_tests=passed,
            failed_tests=len(results) - passed,
            average_score=avg_score,
            threshold=metric.threshold,
            results=list(results),
        )

    async def evaluate_all_agents(
        self,
        agent_fns: dict[str, Callable[[str], Awaitable[str]]],
    ) -> FullEvaluationReport:
        """Evaluate all agent types.

        Args:
            agent_fns: Dictionary mapping agent types to their functions

        Returns:
            FullEvaluationReport with all results
        """
        summaries: dict[str, AgentEvaluationSummary] = {}

        for agent_type, agent_fn in agent_fns.items():
            summary = await self.evaluate_agent(agent_type, agent_fn)
            summaries[agent_type] = summary

        # Compute totals
        total_tests = sum(s.total_tests for s in summaries.values())
        total_passed = sum(s.passed_tests for s in summaries.values())
        total_failed = sum(s.failed_tests for s in summaries.values())

        return FullEvaluationReport(
            timestamp=datetime.now().isoformat(),
            model=self.model,
            total_tests=total_tests,
            total_passed=total_passed,
            total_failed=total_failed,
            overall_pass_rate=total_passed / total_tests if total_tests > 0 else 0.0,
            agent_summaries=summaries,
        )


def save_report_json(report: FullEvaluationReport, path: str | Path) -> None:
    """Save evaluation report to JSON file.

    Args:
        report: The evaluation report
        path: Output file path
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    # Convert dataclasses to dicts
    data = {
        "timestamp": report.timestamp,
        "model": report.model,
        "total_tests": report.total_tests,
        "total_passed": report.total_passed,
        "total_failed": report.total_failed,
        "overall_pass_rate": report.overall_pass_rate,
        "agent_summaries": {
            agent: {
                "agent_type": summary.agent_type,
                "total_tests": summary.total_tests,
                "passed_tests": summary.passed_tests,
                "failed_tests": summary.failed_tests,
                "average_score": summary.average_score,
                "threshold": summary.threshold,
                "results": [asdict(r) for r in summary.results],
            }
            for agent, summary in report.agent_summaries.items()
        },
    }

    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def generate_html_report(report: FullEvaluationReport, path: str | Path) -> None:
    """Generate HTML report from evaluation results.

    Args:
        report: The evaluation report
        path: Output HTML file path
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    # Generate HTML
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Agent Evaluation Report - {report.timestamp}</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f5f5;
        }}
        .header {{
            background: #1a1a2e;
            color: white;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
        }}
        .summary {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }}
        .stat-card {{
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }}
        .stat-value {{
            font-size: 2em;
            font-weight: bold;
            color: #1a1a2e;
        }}
        .stat-label {{
            color: #666;
        }}
        .agent-section {{
            background: white;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 15px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }}
        .agent-header {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }}
        .pass-rate {{
            font-size: 1.5em;
            font-weight: bold;
        }}
        .pass-rate.good {{ color: #22c55e; }}
        .pass-rate.warning {{ color: #f59e0b; }}
        .pass-rate.bad {{ color: #ef4444; }}
        table {{
            width: 100%;
            border-collapse: collapse;
        }}
        th, td {{
            text-align: left;
            padding: 10px;
            border-bottom: 1px solid #eee;
        }}
        th {{
            background: #f9f9f9;
        }}
        .pass {{ color: #22c55e; }}
        .fail {{ color: #ef4444; }}
    </style>
</head>
<body>
    <div class="header">
        <h1>Agent Evaluation Report</h1>
        <p>Generated: {report.timestamp}</p>
        <p>Model: {report.model}</p>
    </div>

    <div class="summary">
        <div class="stat-card">
            <div class="stat-value">{report.total_tests}</div>
            <div class="stat-label">Total Tests</div>
        </div>
        <div class="stat-card">
            <div class="stat-value pass">{report.total_passed}</div>
            <div class="stat-label">Passed</div>
        </div>
        <div class="stat-card">
            <div class="stat-value fail">{report.total_failed}</div>
            <div class="stat-label">Failed</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">{report.overall_pass_rate:.1%}</div>
            <div class="stat-label">Pass Rate</div>
        </div>
    </div>
"""

    for agent_type, summary in report.agent_summaries.items():
        if summary.total_tests == 0:
            continue

        pass_rate = summary.passed_tests / summary.total_tests
        rate_class = "good" if pass_rate >= 0.8 else "warning" if pass_rate >= 0.5 else "bad"

        html += f"""
    <div class="agent-section">
        <div class="agent-header">
            <h2>{agent_type}</h2>
            <span class="pass-rate {rate_class}">{pass_rate:.0%}</span>
        </div>
        <p>Threshold: {summary.threshold:.2f} | Average Score: {summary.average_score:.2f}</p>
        <table>
            <tr>
                <th>Test</th>
                <th>Score</th>
                <th>Status</th>
                <th>Reason</th>
            </tr>
"""
        for result in summary.results:
            status = "PASS" if result.passed else "FAIL"
            status_class = "pass" if result.passed else "fail"
            reason = (
                result.reason[:100] + "..."
                if result.reason and len(result.reason) > 100
                else result.reason or ""
            )

            html += f"""
            <tr>
                <td>{result.test_name}</td>
                <td>{result.score:.2f}</td>
                <td class="{status_class}">{status}</td>
                <td>{reason}</td>
            </tr>
"""

        html += """
        </table>
    </div>
"""

    html += """
</body>
</html>
"""

    with open(path, "w") as f:
        f.write(html)


async def run_evaluation(
    agent_fns: dict[str, Callable[[str], Awaitable[str]]],
    model: str = "gemini-3-pro-preview",
    output_json: str | None = "eval-results.json",
    output_html: str | None = "eval-report.html",
) -> FullEvaluationReport:
    """Run full evaluation suite.

    Args:
        agent_fns: Dictionary mapping agent types to their async functions
        model: LLM model for G-Eval judgments
        output_json: Path for JSON report (None to skip)
        output_html: Path for HTML report (None to skip)

    Returns:
        FullEvaluationReport with all results
    """
    evaluator = AgentEvaluator(model=model)
    report = await evaluator.evaluate_all_agents(agent_fns)

    if output_json:
        save_report_json(report, output_json)

    if output_html:
        generate_html_report(report, output_html)

    return report


# CLI entry point
def main() -> None:
    """CLI entry point for running evaluations."""
    import argparse

    parser = argparse.ArgumentParser(description="Run agent evaluations")
    parser.add_argument(
        "--model",
        default="gemini-3-pro-preview",
        help="LLM model for evaluation",
    )
    parser.add_argument(
        "--output-json",
        default="eval-results.json",
        help="Path for JSON report",
    )
    parser.add_argument(
        "--output-html",
        default="eval-report.html",
        help="Path for HTML report",
    )
    parser.add_argument(
        "--agent",
        help="Evaluate specific agent type only",
    )

    args = parser.parse_args()

    # For CLI usage, we need mock agent functions
    # In production, these would be the actual agent implementations
    async def mock_agent(input_context: str) -> str:
        """Mock agent for testing the evaluation framework."""
        return '{"mock": "output"}'

    agent_types = [
        "technical_analyst",
        "news_analyst",
        "fundamentals_analyst",
        "bullish_researcher",
        "bearish_researcher",
        "trader",
        "risk_manager",
        "critic",
    ]

    if args.agent:
        agent_fns: dict[str, Callable[[str], Awaitable[str]]] = {args.agent: mock_agent}
    else:
        agent_fns = {agent: mock_agent for agent in agent_types}  # noqa: C420

    asyncio.run(
        run_evaluation(
            agent_fns,
            model=args.model,
            output_json=args.output_json,
            output_html=args.output_html,
        )
    )


if __name__ == "__main__":
    main()
