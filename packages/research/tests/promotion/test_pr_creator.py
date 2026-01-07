"""Tests for PR Creator."""

from __future__ import annotations

import tempfile
from datetime import datetime
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from research.hypothesis_alignment import Hypothesis
from research.paper_validation import PaperValidationResult
from research.promotion import (
    PRCreator,
    PRCreatorConfig,
    PromotionPR,
)
from research.stage_validation.stage1_vectorbt import Stage1Results
from research.stage_validation.stage2_nautilus import Stage2Results


@pytest.fixture
def mock_hypothesis() -> Hypothesis:
    """Create a mock hypothesis."""
    return Hypothesis(
        hypothesis_id="hypo-001",
        title="Test Momentum Hypothesis",
        economic_rationale="Price momentum reflects investor behavior patterns",
        market_mechanism="Trend continuation from under-reaction",
        target_regime="TRENDING",
    )


@pytest.fixture
def mock_stage1() -> Stage1Results:
    """Create mock Stage 1 results."""
    return Stage1Results(
        factor_id="test-factor-001",
        best_params={"period": 14},
        parameter_sensitivity={"period": 0.1},
        sharpe=1.5,
        sortino=2.0,
        calmar=1.2,
        max_drawdown=0.15,
        win_rate=0.55,
        profit_factor=1.5,
        ic_mean=0.05,
        icir=0.8,
        rank_ic=0.04,
        passed_gates=True,
        gate_violations=[],
    )


@pytest.fixture
def mock_stage2() -> Stage2Results:
    """Create mock Stage 2 results."""
    return Stage2Results(
        factor_id="test-factor-001",
        sharpe_realistic=1.3,
        sortino_realistic=1.8,
        max_drawdown_realistic=0.15,
        avg_slippage_bps=2.5,
        fill_rate=0.98,
        total_trades=500,
        pbo=0.3,
        dsr_pvalue=0.97,
        observed_sharpe=1.3,
        wfe=0.7,
        cpcv_sharpe_dist=[1.2, 1.3, 1.4, 1.1, 1.5],
        mc_sharpe_5th_pct=0.8,
        mc_drawdown_95th_pct=0.20,
        passed_gates=True,
        gate_violations=[],
    )


@pytest.fixture
def mock_paper() -> PaperValidationResult:
    """Create mock paper validation results."""
    return PaperValidationResult(
        factor_id="test-factor-001",
        start_date=datetime.now(),
        end_date=datetime.now(),
        total_days=14,
        total_comparisons=14,
        divergent_days=0,
        max_divergence=0.0001,
        mean_divergence=0.00005,
        correlation=0.999,
        python_sharpe=1.5,
        typescript_sharpe=1.5,
        passed=True,
        recommendation="PROMOTE",
    )


@pytest.fixture
def temp_repo() -> Path:
    """Create a temporary repository structure."""
    with tempfile.TemporaryDirectory() as tmpdir:
        repo_path = Path(tmpdir)

        # Create .git directory
        (repo_path / ".git").mkdir()

        # Create factor directories
        python_dir = repo_path / "packages/research/research/strategies/test-factor-001"
        python_dir.mkdir(parents=True)
        (python_dir / "factor.py").write_text("# Test factor")
        (python_dir / "__init__.py").write_text("")

        ts_dir = repo_path / "packages/indicators/src/factors/test-factor-001"
        ts_dir.mkdir(parents=True)
        (ts_dir / "index.ts").write_text("// Test factor")
        (ts_dir / "schema.ts").write_text("// Schema")

        golden_dir = repo_path / "packages/research/golden/test-factor-001"
        golden_dir.mkdir(parents=True)
        (golden_dir / "input.parquet").write_bytes(b"")
        (golden_dir / "output.parquet").write_bytes(b"")

        yield repo_path


def test_promotion_pr_dataclass() -> None:
    """Test PromotionPR dataclass."""
    pr = PromotionPR(
        factor_id="test-001",
        hypothesis_id="hypo-001",
        branch_name="factor/test-001",
        pr_url="https://github.com/example/repo/pull/1",
        python_files=["factor.py"],
        typescript_files=["index.ts"],
        test_files=["test_factor.py"],
        golden_files=["input.parquet"],
        stage1_sharpe=1.5,
        stage2_pbo=0.3,
        paper_days=14,
        equivalence_passed=True,
    )

    assert pr.factor_id == "test-001"
    assert pr.branch_name == "factor/test-001"
    assert "test-001" in pr.summary()


def test_pr_creator_config_defaults() -> None:
    """Test PRCreatorConfig defaults."""
    config = PRCreatorConfig()

    assert config.base_branch == "master"
    assert config.dry_run is False


def test_pr_creator_config_custom() -> None:
    """Test PRCreatorConfig with custom values."""
    config = PRCreatorConfig(
        repo_path=Path("/custom/path"),
        base_branch="main",
        dry_run=True,
    )

    assert config.base_branch == "main"
    assert config.dry_run is True


def test_pr_creator_creation() -> None:
    """Test PRCreator creation."""
    creator = PRCreator()

    assert creator.config.base_branch == "master"


def test_pr_creator_with_config() -> None:
    """Test PRCreator with custom config."""
    config = PRCreatorConfig(dry_run=True)
    creator = PRCreator(config)

    assert creator.config.dry_run is True


def test_collect_files(temp_repo: Path) -> None:
    """Test file collection."""
    config = PRCreatorConfig(repo_path=temp_repo)
    creator = PRCreator(config)

    files = creator._collect_files("test-factor-001")

    assert len(files) > 0
    assert any("factor.py" in f for f in files)
    assert any("index.ts" in f for f in files)


def test_collect_files_empty() -> None:
    """Test file collection when no files exist."""
    with tempfile.TemporaryDirectory() as tmpdir:
        config = PRCreatorConfig(repo_path=Path(tmpdir))
        creator = PRCreator(config)

        files = creator._collect_files("nonexistent-factor")

        assert files == []


def test_build_commit_message(
    mock_hypothesis: Hypothesis,
    mock_stage1: Stage1Results,
    mock_stage2: Stage2Results,
    mock_paper: PaperValidationResult,
) -> None:
    """Test commit message building."""
    creator = PRCreator()

    message = creator._build_commit_message(
        "test-factor-001",
        mock_hypothesis,
        mock_stage1,
        mock_stage2,
        mock_paper,
    )

    assert "test-factor-001" in message
    assert "Test Momentum Hypothesis" in message
    assert "Stage 1" in message
    assert "Stage 2" in message
    assert "Paper Validation" in message
    assert "Claude Code" in message


def test_build_pr_body(
    mock_hypothesis: Hypothesis,
    mock_stage1: Stage1Results,
    mock_stage2: Stage2Results,
    mock_paper: PaperValidationResult,
) -> None:
    """Test PR body building."""
    creator = PRCreator()

    body = creator._build_pr_body(
        "test-factor-001",
        mock_hypothesis,
        mock_stage1,
        mock_stage2,
        mock_paper,
    )

    assert "test-factor-001" in body
    assert "Summary" in body
    assert "Hypothesis" in body
    assert "Validation Results" in body
    assert "Test Plan" in body


def test_build_pr_body_truncates_long_rationale(
    mock_hypothesis: Hypothesis,
    mock_stage1: Stage1Results,
    mock_stage2: Stage2Results,
    mock_paper: PaperValidationResult,
) -> None:
    """Test PR body truncates long rationale."""
    mock_hypothesis.economic_rationale = "A" * 600

    creator = PRCreator()
    body = creator._build_pr_body(
        "test-factor-001",
        mock_hypothesis,
        mock_stage1,
        mock_stage2,
        mock_paper,
    )

    # Should be truncated with ...
    assert "..." in body


def test_check_prerequisites_git_not_found() -> None:
    """Test prerequisites check when git not found."""
    with tempfile.TemporaryDirectory() as tmpdir:
        config = PRCreatorConfig(repo_path=Path(tmpdir))
        creator = PRCreator(config)

        passed, issues = creator.check_prerequisites()

        # Should fail because not a git repo
        assert passed is False
        assert any("git repository" in i.lower() for i in issues)


@patch("subprocess.run")
def test_check_prerequisites_all_met(mock_run: MagicMock, temp_repo: Path) -> None:
    """Test prerequisites check when all met."""
    mock_run.return_value = MagicMock(returncode=0)

    config = PRCreatorConfig(repo_path=temp_repo)
    creator = PRCreator(config)

    passed, issues = creator.check_prerequisites()

    assert passed is True
    assert issues == []


@patch("subprocess.run")
def test_create_pr_dry_run(
    mock_run: MagicMock,
    temp_repo: Path,
    mock_hypothesis: Hypothesis,
    mock_stage1: Stage1Results,
    mock_stage2: Stage2Results,
    mock_paper: PaperValidationResult,
) -> None:
    """Test PR creation in dry run mode."""
    config = PRCreatorConfig(repo_path=temp_repo, dry_run=True)
    creator = PRCreator(config)

    pr_url = creator._create_pr("factor/test", "test-001", "Test body")

    assert "dry-run" in pr_url
    # subprocess should not be called in dry run
    mock_run.assert_not_called()


@patch("subprocess.run")
def test_run_git_dry_run(mock_run: MagicMock, temp_repo: Path) -> None:
    """Test git command in dry run mode."""
    config = PRCreatorConfig(repo_path=temp_repo, dry_run=True)
    creator = PRCreator(config)

    # Write commands should not execute in dry run
    result = creator._run_git(["checkout", "-b", "test-branch"])

    assert result == ""
    mock_run.assert_not_called()


@patch("subprocess.run")
def test_run_git_read_commands_in_dry_run(mock_run: MagicMock, temp_repo: Path) -> None:
    """Test read-only git commands execute even in dry run."""
    mock_run.return_value = MagicMock(returncode=0, stdout="status output")

    config = PRCreatorConfig(repo_path=temp_repo, dry_run=True)
    creator = PRCreator(config)

    # Status should execute even in dry run
    creator._run_git(["status"])

    mock_run.assert_called_once()
