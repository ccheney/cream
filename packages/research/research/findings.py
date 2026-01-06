"""
Research Findings Module

Dataclass for storing parameter scan results and strategy hypotheses.
See: docs/plans/10-research.md - Research Finding Schema
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass
class PerformanceMetrics:
    """Performance metrics for a backtest result."""

    sharpe: float
    """Sharpe ratio (annualized, risk-free rate = 0)."""

    sortino: float
    """Sortino ratio (downside deviation only)."""

    max_drawdown: float
    """Maximum peak-to-trough drawdown as decimal (0.25 = 25%)."""

    win_rate: float
    """Percentage of winning trades as decimal (0.55 = 55%)."""

    avg_return: float
    """Average return per trade as decimal (0.02 = 2%)."""

    total_return: float = 0.0
    """Total cumulative return as decimal (1.5 = 150%)."""

    num_trades: int = 0
    """Total number of trades executed."""

    profit_factor: float = 0.0
    """Ratio of gross profits to gross losses."""

    avg_win: float = 0.0
    """Average winning trade return."""

    avg_loss: float = 0.0
    """Average losing trade return."""

    max_consecutive_wins: int = 0
    """Maximum consecutive winning trades."""

    max_consecutive_losses: int = 0
    """Maximum consecutive losing trades."""

    calmar_ratio: float = 0.0
    """Annual return / max drawdown."""


@dataclass
class StrategyCondition:
    """Entry or exit condition for a strategy."""

    indicator: str
    """Indicator name (e.g., 'rsi_14', 'sma_cross')."""

    operator: str
    """Comparison operator ('>', '<', '>=', '<=', '==', 'crosses_above', 'crosses_below')."""

    value: float | str
    """Threshold value or reference indicator name."""

    description: str = ""
    """Human-readable description of the condition."""


@dataclass
class ResearchFinding:
    """
    Research finding from parameter scan or hypothesis generation.

    Represents a promising strategy candidate discovered through
    vectorbt parameter sweeps or manual research.
    """

    finding_id: str
    """Unique identifier for this finding (UUID)."""

    setup_name: str
    """Short name for the strategy setup (e.g., 'RSI_Mean_Reversion')."""

    description: str
    """Detailed description of the strategy hypothesis."""

    entry_conditions: list[StrategyCondition]
    """List of conditions that trigger entry."""

    exit_conditions: list[StrategyCondition]
    """List of conditions that trigger exit."""

    parameters: dict[str, Any]
    """Strategy parameters (e.g., {'rsi_period': 14, 'entry_threshold': 30})."""

    metrics: PerformanceMetrics
    """Backtest performance metrics."""

    # Context fields
    regime_compatibility: list[str] = field(default_factory=list)
    """Regimes where strategy performs well (e.g., ['BULL_TREND', 'RANGE'])."""

    failure_modes: list[str] = field(default_factory=list)
    """Known failure conditions (e.g., ['high_volatility', 'trending_market'])."""

    # Metadata
    scan_date: str = ""
    """ISO-8601 timestamp when scan was performed."""

    data_range: tuple[str, str] = ("", "")
    """Start and end dates of backtest data (ISO-8601)."""

    symbols_tested: list[str] = field(default_factory=list)
    """List of symbols used in the scan."""

    model_version: str = "vectorbt-0.28"
    """Version of the backtesting framework used."""

    notes: str = ""
    """Additional notes or observations."""

    def __post_init__(self) -> None:
        """Set defaults after initialization."""
        if not self.scan_date:
            self.scan_date = datetime.now().isoformat()

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "finding_id": self.finding_id,
            "setup_name": self.setup_name,
            "description": self.description,
            "entry_conditions": [
                {
                    "indicator": c.indicator,
                    "operator": c.operator,
                    "value": c.value,
                    "description": c.description,
                }
                for c in self.entry_conditions
            ],
            "exit_conditions": [
                {
                    "indicator": c.indicator,
                    "operator": c.operator,
                    "value": c.value,
                    "description": c.description,
                }
                for c in self.exit_conditions
            ],
            "parameters": self.parameters,
            "metrics": {
                "sharpe": self.metrics.sharpe,
                "sortino": self.metrics.sortino,
                "max_drawdown": self.metrics.max_drawdown,
                "win_rate": self.metrics.win_rate,
                "avg_return": self.metrics.avg_return,
                "total_return": self.metrics.total_return,
                "num_trades": self.metrics.num_trades,
                "profit_factor": self.metrics.profit_factor,
                "calmar_ratio": self.metrics.calmar_ratio,
            },
            "regime_compatibility": self.regime_compatibility,
            "failure_modes": self.failure_modes,
            "scan_date": self.scan_date,
            "data_range": list(self.data_range),
            "symbols_tested": self.symbols_tested,
            "model_version": self.model_version,
            "notes": self.notes,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ResearchFinding:
        """Create from dictionary."""
        entry_conditions = [
            StrategyCondition(
                indicator=c["indicator"],
                operator=c["operator"],
                value=c["value"],
                description=c.get("description", ""),
            )
            for c in data.get("entry_conditions", [])
        ]
        exit_conditions = [
            StrategyCondition(
                indicator=c["indicator"],
                operator=c["operator"],
                value=c["value"],
                description=c.get("description", ""),
            )
            for c in data.get("exit_conditions", [])
        ]
        metrics_data = data.get("metrics", {})
        metrics = PerformanceMetrics(
            sharpe=metrics_data.get("sharpe", 0.0),
            sortino=metrics_data.get("sortino", 0.0),
            max_drawdown=metrics_data.get("max_drawdown", 0.0),
            win_rate=metrics_data.get("win_rate", 0.0),
            avg_return=metrics_data.get("avg_return", 0.0),
            total_return=metrics_data.get("total_return", 0.0),
            num_trades=metrics_data.get("num_trades", 0),
            profit_factor=metrics_data.get("profit_factor", 0.0),
            calmar_ratio=metrics_data.get("calmar_ratio", 0.0),
        )
        data_range = data.get("data_range", ["", ""])
        return cls(
            finding_id=data["finding_id"],
            setup_name=data["setup_name"],
            description=data["description"],
            entry_conditions=entry_conditions,
            exit_conditions=exit_conditions,
            parameters=data.get("parameters", {}),
            metrics=metrics,
            regime_compatibility=data.get("regime_compatibility", []),
            failure_modes=data.get("failure_modes", []),
            scan_date=data.get("scan_date", ""),
            data_range=(data_range[0], data_range[1]) if len(data_range) >= 2 else ("", ""),
            symbols_tested=data.get("symbols_tested", []),
            model_version=data.get("model_version", "vectorbt-0.28"),
            notes=data.get("notes", ""),
        )


@dataclass
class ParameterScanConfig:
    """Configuration for a parameter scan."""

    strategy_name: str
    """Name of the strategy to scan."""

    parameter_space: dict[str, list[Any]]
    """Parameter names and their possible values."""

    symbols: list[str]
    """Symbols to test."""

    start_date: str
    """Start date for backtest (ISO-8601)."""

    end_date: str
    """End date for backtest (ISO-8601)."""

    timeframe: str = "1h"
    """Candle timeframe."""

    initial_capital: float = 100000.0
    """Starting capital."""

    position_size_pct: float = 0.1
    """Position size as percentage of portfolio (0.1 = 10%)."""

    commission_pct: float = 0.001
    """Commission as percentage of trade value (0.001 = 0.1%)."""

    slippage_pct: float = 0.0005
    """Slippage as percentage of price (0.0005 = 0.05%)."""

    search_method: str = "grid"
    """Search method: 'grid' or 'random'."""

    random_samples: int = 100
    """Number of random samples (if search_method='random')."""

    top_k: int = 10
    """Number of top results to return."""

    min_trades: int = 30
    """Minimum number of trades for valid result."""

    min_sharpe: float = 0.5
    """Minimum Sharpe ratio filter."""


@dataclass
class ScanResult:
    """Result of a parameter scan."""

    config: ParameterScanConfig
    """Configuration used for the scan."""

    findings: list[ResearchFinding]
    """Top findings from the scan."""

    total_combinations: int
    """Total parameter combinations tested."""

    valid_combinations: int
    """Combinations meeting minimum trade requirement."""

    scan_duration_seconds: float
    """Time taken to run the scan."""

    scan_date: str = ""
    """ISO-8601 timestamp when scan completed."""

    def __post_init__(self) -> None:
        """Set defaults after initialization."""
        if not self.scan_date:
            self.scan_date = datetime.now().isoformat()
