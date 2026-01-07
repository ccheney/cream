"""
PR Creator for Factor Promotion

Creates GitHub PRs with full validation context for human review
before promoting factors to production.

See: docs/plans/20-research-to-production-pipeline.md - Phase 8
"""

from __future__ import annotations

import logging
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..hypothesis_alignment import Hypothesis
    from ..paper_validation import PaperValidationResult
    from ..stage_validation.stage1_vectorbt import Stage1Results
    from ..stage_validation.stage2_nautilus import Stage2Results

logger = logging.getLogger(__name__)


@dataclass
class PromotionPR:
    """Result of creating a promotion PR."""

    factor_id: str
    """Factor being promoted."""

    hypothesis_id: str
    """Associated hypothesis ID."""

    branch_name: str
    """Git branch name."""

    pr_url: str
    """URL of the created PR."""

    # Included files
    python_files: list[str] = field(default_factory=list)
    """Python implementation files."""

    typescript_files: list[str] = field(default_factory=list)
    """TypeScript implementation files."""

    test_files: list[str] = field(default_factory=list)
    """Test files."""

    golden_files: list[str] = field(default_factory=list)
    """Golden data files."""

    # Validation results are stored as metadata
    stage1_sharpe: float = 0.0
    """Stage 1 Sharpe ratio."""

    stage2_pbo: float = 0.0
    """Stage 2 PBO value."""

    paper_days: int = 0
    """Paper validation days."""

    equivalence_passed: bool = False
    """Whether equivalence testing passed."""

    def summary(self) -> str:
        """Get human-readable summary."""
        return (
            f"Promotion PR for {self.factor_id}\n"
            f"Branch: {self.branch_name}\n"
            f"URL: {self.pr_url}\n"
            f"Files: {len(self.python_files)} Python, {len(self.typescript_files)} TypeScript"
        )


@dataclass
class PRCreatorConfig:
    """Configuration for PR creation."""

    repo_path: Path = field(default_factory=lambda: Path("."))
    """Path to repository root."""

    base_branch: str = "master"
    """Base branch for PRs."""

    dry_run: bool = False
    """If True, don't actually create PR."""

    python_factor_dir: str = "packages/research/research/strategies"
    """Directory containing Python factors."""

    typescript_factor_dir: str = "packages/indicators/src/factors"
    """Directory containing TypeScript factors."""

    golden_dir: str = "packages/research/golden"
    """Directory containing golden files."""


class PRCreator:
    """
    Create promotion PRs for validated factors.

    This is the human-in-the-loop gate requiring review before deployment.

    Example:
        creator = PRCreator()
        pr = await creator.create_promotion_pr(
            factor_id="momentum-001",
            hypothesis=hypothesis,
            stage1=stage1_results,
            stage2=stage2_results,
            paper=paper_results,
        )
        print(f"Created PR: {pr.pr_url}")
    """

    def __init__(self, config: PRCreatorConfig | None = None) -> None:
        """
        Initialize PR creator.

        Args:
            config: PR creation configuration
        """
        self.config = config or PRCreatorConfig()

    async def create_promotion_pr(
        self,
        factor_id: str,
        hypothesis: Hypothesis,
        stage1: Stage1Results,
        stage2: Stage2Results,
        paper: PaperValidationResult,
    ) -> PromotionPR:
        """
        Create PR for promoting factor to production.

        Args:
            factor_id: Factor ID to promote
            hypothesis: Associated hypothesis
            stage1: Stage 1 validation results
            stage2: Stage 2 validation results
            paper: Paper validation results

        Returns:
            PromotionPR with PR details
        """
        branch_name = f"factor/{factor_id}"

        # Collect files to include
        files_to_add = self._collect_files(factor_id)

        if not files_to_add:
            raise ValueError(f"No files found for factor {factor_id}")

        # Ensure we're on base branch first
        self._run_git(["checkout", self.config.base_branch])
        self._run_git(["pull", "origin", self.config.base_branch])

        # Create and checkout branch
        try:
            self._run_git(["checkout", "-b", branch_name])
        except RuntimeError:
            # Branch may already exist
            self._run_git(["checkout", branch_name])

        # Stage all factor files
        for f in files_to_add:
            self._run_git(["add", f])

        # Create commit with detailed message
        commit_msg = self._build_commit_message(factor_id, hypothesis, stage1, stage2, paper)
        self._run_git(["commit", "-m", commit_msg])

        # Push branch
        self._run_git(["push", "-u", "origin", branch_name])

        # Create PR via gh CLI
        pr_body = self._build_pr_body(factor_id, hypothesis, stage1, stage2, paper)
        pr_url = self._create_pr(branch_name, factor_id, pr_body)

        # Categorize files
        python_files = [f for f in files_to_add if f.endswith(".py")]
        typescript_files = [f for f in files_to_add if f.endswith(".ts")]
        test_files = [f for f in files_to_add if "test" in f.lower()]
        golden_files = [f for f in files_to_add if "golden" in f.lower()]

        return PromotionPR(
            factor_id=factor_id,
            hypothesis_id=hypothesis.hypothesis_id,
            branch_name=branch_name,
            pr_url=pr_url,
            python_files=python_files,
            typescript_files=typescript_files,
            test_files=test_files,
            golden_files=golden_files,
            stage1_sharpe=stage1.sharpe,
            stage2_pbo=stage2.pbo,
            paper_days=paper.total_days,
            equivalence_passed=True,
        )

    def _collect_files(self, factor_id: str) -> list[str]:
        """
        Collect all files for the factor.

        Args:
            factor_id: Factor ID

        Returns:
            List of file paths relative to repo root
        """
        files = []

        # Python files
        python_dir = self.config.repo_path / self.config.python_factor_dir / factor_id
        if python_dir.exists():
            for f in python_dir.rglob("*"):
                if f.is_file() and not f.name.startswith("."):
                    files.append(str(f.relative_to(self.config.repo_path)))

        # TypeScript files
        ts_dir = self.config.repo_path / self.config.typescript_factor_dir / factor_id
        if ts_dir.exists():
            for f in ts_dir.rglob("*"):
                if f.is_file() and not f.name.startswith("."):
                    files.append(str(f.relative_to(self.config.repo_path)))

        # Golden files
        golden_dir = self.config.repo_path / self.config.golden_dir / factor_id
        if golden_dir.exists():
            for f in golden_dir.rglob("*"):
                if f.is_file() and not f.name.startswith("."):
                    files.append(str(f.relative_to(self.config.repo_path)))

        return files

    def _build_commit_message(
        self,
        factor_id: str,
        hypothesis: Hypothesis,
        stage1: Stage1Results,
        stage2: Stage2Results,
        paper: PaperValidationResult,
    ) -> str:
        """Build commit message with validation summary."""
        return f"""feat(factors): add {factor_id}

Hypothesis: {hypothesis.title}

Validation Results:
- Stage 1 (VectorBT): Sharpe={stage1.sharpe:.2f}, IC={stage1.ic_mean:.3f}
- Stage 2 (Nautilus): PBO={stage2.pbo:.2f}, DSR p={stage2.dsr_pvalue:.3f}, WFE={stage2.wfe:.2f}
- Paper Validation: {paper.total_days} days, {paper.divergent_days} divergences

Co-authored-by: Claude Code <claude@anthropic.com>
"""

    def _build_pr_body(
        self,
        factor_id: str,
        hypothesis: Hypothesis,
        stage1: Stage1Results,
        stage2: Stage2Results,
        paper: PaperValidationResult,
    ) -> str:
        """Build PR body with detailed results."""
        # Truncate long rationale
        rationale = hypothesis.economic_rationale
        if len(rationale) > 500:
            rationale = rationale[:497] + "..."

        return f"""## Summary

New alpha factor `{factor_id}` ready for production deployment.

### Hypothesis

**Title**: {hypothesis.title}

**Economic Rationale**: {rationale}

**Target Regime**: {hypothesis.target_regime}

### Validation Results

#### Stage 1: VectorBT Parameter Scan

| Metric | Value | Gate |
|--------|-------|------|
| Sharpe | {stage1.sharpe:.2f} | > 1.0 |
| Sortino | {stage1.sortino:.2f} | > 1.2 |
| Win Rate | {stage1.win_rate:.1%} | > 45% |
| Max Drawdown | {stage1.max_drawdown:.1%} | < 25% |
| IC | {stage1.ic_mean:.3f} | > 0.03 |

#### Stage 2: NautilusTrader Statistical Validation

| Metric | Value | Gate |
|--------|-------|------|
| PBO | {stage2.pbo:.2f} | < 0.5 |
| DSR p-value | {stage2.dsr_pvalue:.3f} | > 0.95 |
| Walk-Forward Efficiency | {stage2.wfe:.2f} | > 0.5 |
| MC Sharpe 5th pct | {stage2.mc_sharpe_5th_pct:.2f} | > 0.5 |

#### Paper Validation

- **Duration**: {paper.total_days} days
- **Divergent Days**: {paper.divergent_days} (max: 5)
- **Correlation**: {paper.correlation:.4f}
- **Result**: {"PASSED" if paper.passed else "FAILED"}

### Test Plan

- [ ] Review factor implementation logic
- [ ] Verify equivalence test coverage
- [ ] Check regularization metrics (complexity, originality)
- [ ] Review hypothesis alignment
- [ ] Approve for production deployment

### Files Changed

**Python Implementation**:
- `{self.config.python_factor_dir}/{factor_id}/`

**TypeScript Implementation**:
- `{self.config.typescript_factor_dir}/{factor_id}/`

---
*Automatically generated by Research-to-Production Pipeline*
"""

    def _create_pr(
        self,
        _branch: str,
        factor_id: str,
        body: str,
    ) -> str:
        """
        Create PR using gh CLI.

        Args:
            _branch: Branch name (unused - PR created from current branch)
            factor_id: Factor ID for title
            body: PR body content

        Returns:
            PR URL
        """
        if self.config.dry_run:
            logger.info(f"Dry run: would create PR for {factor_id}")
            return f"https://github.com/example/repo/pull/dry-run-{factor_id}"

        result = subprocess.run(
            [
                "gh",
                "pr",
                "create",
                "--title",
                f"feat(factors): add {factor_id}",
                "--body",
                body,
                "--base",
                self.config.base_branch,
            ],
            capture_output=True,
            text=True,
            cwd=self.config.repo_path,
            check=False,
        )

        if result.returncode != 0:
            raise RuntimeError(f"Failed to create PR: {result.stderr}")

        # gh pr create outputs the URL
        pr_url = result.stdout.strip()
        logger.info(f"Created PR: {pr_url}")

        return pr_url

    def _run_git(self, args: list[str]) -> str:
        """
        Run git command.

        Args:
            args: Git command arguments

        Returns:
            Command output
        """
        if self.config.dry_run and args[0] not in ["status", "log", "diff"]:
            logger.info(f"Dry run: git {' '.join(args)}")
            return ""

        result = subprocess.run(
            ["git"] + args,
            capture_output=True,
            text=True,
            cwd=self.config.repo_path,
            check=False,
        )

        if result.returncode != 0:
            raise RuntimeError(f"Git command failed: {result.stderr}")

        return result.stdout.strip()

    def check_prerequisites(self) -> tuple[bool, list[str]]:
        """
        Check if prerequisites for PR creation are met.

        Returns:
            Tuple of (all_met, list of issues)
        """
        issues = []

        # Check gh CLI
        try:
            subprocess.run(
                ["gh", "--version"],
                capture_output=True,
                check=True,
            )
        except (subprocess.CalledProcessError, FileNotFoundError):
            issues.append("GitHub CLI (gh) not found or not configured")

        # Check git
        try:
            subprocess.run(
                ["git", "--version"],
                capture_output=True,
                check=True,
            )
        except (subprocess.CalledProcessError, FileNotFoundError):
            issues.append("Git not found")

        # Check repo
        if not (self.config.repo_path / ".git").exists():
            issues.append(f"Not a git repository: {self.config.repo_path}")

        return len(issues) == 0, issues
