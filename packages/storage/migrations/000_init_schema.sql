-- ============================================
-- Consolidated Schema Initialization
-- ============================================
-- Single init file combining all migrations for greenfield deployment.
-- This replaces migrations 001-010 for new database setup.
--
-- Generated from: 001_initial_schema.sql through 010_paper_signals.sql
-- For incremental migrations post-deployment, create new numbered migrations.
--
-- @see docs/plans/ui/04-data-requirements.md
-- @see docs/plans/02-data-layer.md

-- ============================================
-- Schema Migrations Tracking
-- ============================================
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================
-- 1. Core Trading Tables (from 001_initial_schema)
-- ============================================

-- decisions: Trading decisions from OODA loop
CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  action TEXT NOT NULL,
  direction TEXT NOT NULL,
  size REAL NOT NULL,
  size_unit TEXT NOT NULL,
  entry_price REAL,
  stop_loss REAL,
  take_profit REAL,
  status TEXT NOT NULL DEFAULT 'pending',
  rationale TEXT,
  environment TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  executed_at TEXT,
  closed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_decisions_cycle_id ON decisions(cycle_id);
CREATE INDEX IF NOT EXISTS idx_decisions_symbol ON decisions(symbol);
CREATE INDEX IF NOT EXISTS idx_decisions_status ON decisions(status);
CREATE INDEX IF NOT EXISTS idx_decisions_created_at ON decisions(created_at);
CREATE INDEX IF NOT EXISTS idx_decisions_symbol_created ON decisions(symbol, created_at);
CREATE INDEX IF NOT EXISTS idx_decisions_environment ON decisions(environment);

-- agent_outputs: Agent votes and reasoning
CREATE TABLE IF NOT EXISTS agent_outputs (
  id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  agent_type TEXT NOT NULL,
  vote TEXT NOT NULL,
  confidence REAL NOT NULL,
  reasoning_summary TEXT,
  full_reasoning TEXT,
  tokens_used INTEGER,
  latency_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (decision_id) REFERENCES decisions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_outputs_decision_id ON agent_outputs(decision_id);
CREATE INDEX IF NOT EXISTS idx_agent_outputs_agent_type ON agent_outputs(agent_type);
CREATE INDEX IF NOT EXISTS idx_agent_outputs_decision_agent ON agent_outputs(decision_id, agent_type);

-- orders: Order submissions and lifecycle
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  decision_id TEXT,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  qty REAL NOT NULL,
  order_type TEXT NOT NULL,
  limit_price REAL,
  stop_price REAL,
  time_in_force TEXT NOT NULL DEFAULT 'day',
  status TEXT NOT NULL DEFAULT 'pending',
  broker_order_id TEXT,
  filled_qty REAL DEFAULT 0,
  filled_avg_price REAL,
  commission REAL,
  environment TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at TEXT,
  filled_at TEXT,
  cancelled_at TEXT,
  FOREIGN KEY (decision_id) REFERENCES decisions(id)
);

CREATE INDEX IF NOT EXISTS idx_orders_decision_id ON orders(decision_id);
CREATE INDEX IF NOT EXISTS idx_orders_symbol ON orders(symbol);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_broker_order_id ON orders(broker_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_environment ON orders(environment);

-- positions: Current open positions
CREATE TABLE IF NOT EXISTS positions (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  qty REAL NOT NULL,
  avg_entry REAL NOT NULL,
  current_price REAL,
  unrealized_pnl REAL,
  unrealized_pnl_pct REAL,
  realized_pnl REAL DEFAULT 0,
  market_value REAL,
  cost_basis REAL,
  thesis_id TEXT,
  decision_id TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  metadata TEXT,
  environment TEXT NOT NULL,
  opened_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_positions_symbol ON positions(symbol);
CREATE INDEX IF NOT EXISTS idx_positions_thesis_id ON positions(thesis_id);
CREATE INDEX IF NOT EXISTS idx_positions_decision_id ON positions(decision_id);
CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status);
CREATE INDEX IF NOT EXISTS idx_positions_environment ON positions(environment);
CREATE UNIQUE INDEX IF NOT EXISTS idx_positions_symbol_env ON positions(symbol, environment) WHERE closed_at IS NULL;

-- position_history: Historical snapshots for P&L tracking
CREATE TABLE IF NOT EXISTS position_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  position_id TEXT NOT NULL,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  price REAL NOT NULL,
  qty REAL NOT NULL,
  unrealized_pnl REAL,
  market_value REAL,
  FOREIGN KEY (position_id) REFERENCES positions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_position_history_position_id ON position_history(position_id);
CREATE INDEX IF NOT EXISTS idx_position_history_timestamp ON position_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_position_history_position_ts ON position_history(position_id, timestamp);

-- portfolio_snapshots: Point-in-time portfolio state
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  environment TEXT NOT NULL,
  nav REAL NOT NULL,
  cash REAL NOT NULL,
  equity REAL NOT NULL,
  gross_exposure REAL NOT NULL,
  net_exposure REAL NOT NULL,
  long_exposure REAL,
  short_exposure REAL,
  open_positions INTEGER,
  day_pnl REAL,
  day_return_pct REAL,
  total_return_pct REAL,
  max_drawdown REAL,
  UNIQUE(timestamp, environment)
);

CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_timestamp ON portfolio_snapshots(timestamp);
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_environment ON portfolio_snapshots(environment);

-- config_versions: Version-controlled configuration
CREATE TABLE IF NOT EXISTS config_versions (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL,
  config_json TEXT NOT NULL,
  description TEXT,
  active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_config_versions_environment ON config_versions(environment);
CREATE INDEX IF NOT EXISTS idx_config_versions_active ON config_versions(active);
CREATE INDEX IF NOT EXISTS idx_config_versions_created_at ON config_versions(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_config_versions_env_active ON config_versions(environment) WHERE active = 1;

-- ============================================
-- 2. Dashboard Tables (from 002_dashboard_tables)
-- ============================================

-- alerts: System and trading alerts
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  severity TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata TEXT,
  acknowledged INTEGER NOT NULL DEFAULT 0,
  acknowledged_by TEXT,
  acknowledged_at TEXT,
  environment TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(type);
CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged ON alerts(acknowledged);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at);
CREATE INDEX IF NOT EXISTS idx_alerts_environment ON alerts(environment);
CREATE INDEX IF NOT EXISTS idx_alerts_unack_env ON alerts(environment, acknowledged) WHERE acknowledged = 0;

-- system_state: Current system state per environment
CREATE TABLE IF NOT EXISTS system_state (
  environment TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'stopped',
  last_cycle_id TEXT,
  last_cycle_time TEXT,
  current_phase TEXT,
  phase_started_at TEXT,
  next_cycle_at TEXT,
  error_message TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO system_state (environment, status) VALUES ('BACKTEST', 'stopped');
INSERT OR IGNORE INTO system_state (environment, status) VALUES ('PAPER', 'stopped');
INSERT OR IGNORE INTO system_state (environment, status) VALUES ('LIVE', 'stopped');

-- backtests: Backtest configurations and results
CREATE TABLE IF NOT EXISTS backtests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  initial_capital REAL NOT NULL,
  universe TEXT,
  config_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  progress_pct REAL DEFAULT 0,
  total_return REAL,
  cagr REAL,
  sharpe_ratio REAL,
  sortino_ratio REAL,
  calmar_ratio REAL,
  max_drawdown REAL,
  win_rate REAL,
  profit_factor REAL,
  total_trades INTEGER,
  avg_trade_pnl REAL,
  metrics_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT,
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_backtests_status ON backtests(status);
CREATE INDEX IF NOT EXISTS idx_backtests_start_date ON backtests(start_date);
CREATE INDEX IF NOT EXISTS idx_backtests_created_at ON backtests(created_at);

-- backtest_trades: Individual trades from backtests
CREATE TABLE IF NOT EXISTS backtest_trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  backtest_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  symbol TEXT NOT NULL,
  action TEXT NOT NULL,
  qty REAL NOT NULL,
  price REAL NOT NULL,
  commission REAL DEFAULT 0,
  pnl REAL,
  pnl_pct REAL,
  decision_rationale TEXT,
  FOREIGN KEY (backtest_id) REFERENCES backtests(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_backtest_trades_backtest_id ON backtest_trades(backtest_id);
CREATE INDEX IF NOT EXISTS idx_backtest_trades_timestamp ON backtest_trades(timestamp);
CREATE INDEX IF NOT EXISTS idx_backtest_trades_symbol ON backtest_trades(symbol);
CREATE INDEX IF NOT EXISTS idx_backtest_trades_bt_ts ON backtest_trades(backtest_id, timestamp);

-- backtest_equity: Equity curve for visualization
CREATE TABLE IF NOT EXISTS backtest_equity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  backtest_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  nav REAL NOT NULL,
  cash REAL NOT NULL,
  equity REAL NOT NULL,
  drawdown REAL,
  drawdown_pct REAL,
  day_return_pct REAL,
  cumulative_return_pct REAL,
  FOREIGN KEY (backtest_id) REFERENCES backtests(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_backtest_equity_backtest_id ON backtest_equity(backtest_id);
CREATE INDEX IF NOT EXISTS idx_backtest_equity_timestamp ON backtest_equity(timestamp);
CREATE INDEX IF NOT EXISTS idx_backtest_equity_bt_ts ON backtest_equity(backtest_id, timestamp);

-- user_preferences: User settings
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY,
  preferences_json TEXT NOT NULL DEFAULT '{}',
  theme TEXT DEFAULT 'system',
  default_environment TEXT DEFAULT 'PAPER',
  sidebar_collapsed INTEGER DEFAULT 0,
  chart_settings TEXT,
  alert_settings TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================
-- 3. Market Data Tables (from 003_market_data_tables)
-- ============================================

-- candles: OHLCV data
CREATE TABLE IF NOT EXISTS candles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  open REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  close REAL NOT NULL,
  volume REAL NOT NULL DEFAULT 0,
  vwap REAL,
  trade_count INTEGER,
  adjusted INTEGER NOT NULL DEFAULT 0,
  split_adjusted INTEGER NOT NULL DEFAULT 0,
  dividend_adjusted INTEGER NOT NULL DEFAULT 0,
  quality_flags TEXT,
  provider TEXT NOT NULL DEFAULT 'polygon',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_candles_symbol_timeframe_ts ON candles(symbol, timeframe, timestamp);
CREATE INDEX IF NOT EXISTS idx_candles_timestamp ON candles(timestamp);
CREATE INDEX IF NOT EXISTS idx_candles_symbol ON candles(symbol);
CREATE INDEX IF NOT EXISTS idx_candles_timeframe ON candles(timeframe);

-- corporate_actions: Splits, dividends, mergers
CREATE TABLE IF NOT EXISTS corporate_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  action_type TEXT NOT NULL,
  ex_date TEXT NOT NULL,
  record_date TEXT,
  pay_date TEXT,
  ratio REAL,
  amount REAL,
  details TEXT,
  provider TEXT NOT NULL DEFAULT 'polygon',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_corporate_actions_symbol_date ON corporate_actions(symbol, ex_date);
CREATE INDEX IF NOT EXISTS idx_corporate_actions_ex_date ON corporate_actions(ex_date);
CREATE INDEX IF NOT EXISTS idx_corporate_actions_type ON corporate_actions(action_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_corporate_actions_unique ON corporate_actions(symbol, action_type, ex_date);

-- universe_cache: Cached universe resolution
CREATE TABLE IF NOT EXISTS universe_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  tickers TEXT NOT NULL,
  ticker_count INTEGER NOT NULL,
  metadata TEXT,
  cached_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  provider TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_universe_cache_source ON universe_cache(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_universe_cache_expires ON universe_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_universe_cache_hash ON universe_cache(source_hash);

-- features: Computed indicators
CREATE TABLE IF NOT EXISTS features (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  indicator_name TEXT NOT NULL,
  raw_value REAL NOT NULL,
  normalized_value REAL,
  parameters TEXT,
  quality_score REAL,
  computed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_features_symbol_ts_indicator ON features(symbol, timestamp, timeframe, indicator_name);
CREATE INDEX IF NOT EXISTS idx_features_symbol_indicator_ts ON features(symbol, indicator_name, timestamp);
CREATE INDEX IF NOT EXISTS idx_features_timestamp ON features(timestamp);
CREATE INDEX IF NOT EXISTS idx_features_indicator ON features(indicator_name);

-- regime_labels: Market regime classifications
CREATE TABLE IF NOT EXISTS regime_labels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  regime TEXT NOT NULL,
  confidence REAL NOT NULL,
  trend_strength REAL,
  volatility_percentile REAL,
  correlation_to_market REAL,
  model_name TEXT NOT NULL DEFAULT 'hmm_regime',
  model_version TEXT,
  computed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_regime_labels_symbol_ts_tf ON regime_labels(symbol, timestamp, timeframe);
CREATE INDEX IF NOT EXISTS idx_regime_labels_symbol_ts ON regime_labels(symbol, timestamp);
CREATE INDEX IF NOT EXISTS idx_regime_labels_regime ON regime_labels(regime);
CREATE INDEX IF NOT EXISTS idx_regime_labels_market ON regime_labels(symbol, timestamp) WHERE symbol = '_MARKET';

-- ============================================
-- 4. Thesis State (from 004_thesis_state)
-- ============================================

CREATE TABLE IF NOT EXISTS thesis_state (
  thesis_id TEXT PRIMARY KEY,
  instrument_id TEXT NOT NULL,
  state TEXT NOT NULL,
  entry_price REAL,
  entry_date TEXT,
  current_stop REAL,
  current_target REAL,
  conviction REAL,
  entry_thesis TEXT,
  invalidation_conditions TEXT,
  add_count INTEGER NOT NULL DEFAULT 0,
  max_position_reached INTEGER NOT NULL DEFAULT 0,
  peak_unrealized_pnl REAL,
  close_reason TEXT,
  exit_price REAL,
  realized_pnl REAL,
  realized_pnl_pct REAL,
  environment TEXT NOT NULL,
  notes TEXT,
  last_updated TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_thesis_state_instrument ON thesis_state(instrument_id);
CREATE INDEX IF NOT EXISTS idx_thesis_state_state ON thesis_state(state);
CREATE INDEX IF NOT EXISTS idx_thesis_state_environment ON thesis_state(environment);
CREATE INDEX IF NOT EXISTS idx_thesis_state_created_at ON thesis_state(created_at);
CREATE INDEX IF NOT EXISTS idx_thesis_state_closed_at ON thesis_state(closed_at);
CREATE INDEX IF NOT EXISTS idx_thesis_state_active ON thesis_state(environment, state) WHERE state != 'CLOSED';
CREATE INDEX IF NOT EXISTS idx_thesis_state_instrument_active ON thesis_state(instrument_id, environment) WHERE state != 'CLOSED';

CREATE TABLE IF NOT EXISTS thesis_state_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thesis_id TEXT NOT NULL,
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  trigger_reason TEXT,
  cycle_id TEXT,
  price_at_transition REAL,
  conviction_at_transition REAL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (thesis_id) REFERENCES thesis_state(thesis_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_thesis_history_thesis_id ON thesis_state_history(thesis_id);
CREATE INDEX IF NOT EXISTS idx_thesis_history_created_at ON thesis_state_history(created_at);
CREATE INDEX IF NOT EXISTS idx_thesis_history_thesis_created ON thesis_state_history(thesis_id, created_at);

-- ============================================
-- 5. Historical Universe (from 005_historical_universe)
-- ============================================

CREATE TABLE IF NOT EXISTS index_constituents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  index_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  date_added TEXT NOT NULL,
  date_removed TEXT,
  reason_added TEXT,
  reason_removed TEXT,
  sector TEXT,
  industry TEXT,
  market_cap_at_add REAL,
  provider TEXT NOT NULL DEFAULT 'fmp',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_index_constituents_pit ON index_constituents(index_id, date_added, date_removed);
CREATE INDEX IF NOT EXISTS idx_index_constituents_symbol ON index_constituents(symbol, index_id);
CREATE INDEX IF NOT EXISTS idx_index_constituents_current ON index_constituents(index_id, date_removed) WHERE date_removed IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_index_constituents_unique ON index_constituents(index_id, symbol, date_added);

CREATE TABLE IF NOT EXISTS ticker_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  old_symbol TEXT NOT NULL,
  new_symbol TEXT NOT NULL,
  change_date TEXT NOT NULL,
  change_type TEXT NOT NULL,
  conversion_ratio REAL,
  reason TEXT,
  acquiring_company TEXT,
  provider TEXT NOT NULL DEFAULT 'fmp',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ticker_changes_old ON ticker_changes(old_symbol, change_date);
CREATE INDEX IF NOT EXISTS idx_ticker_changes_new ON ticker_changes(new_symbol, change_date);
CREATE INDEX IF NOT EXISTS idx_ticker_changes_date ON ticker_changes(change_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ticker_changes_unique ON ticker_changes(old_symbol, new_symbol, change_date);

CREATE TABLE IF NOT EXISTS universe_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_date TEXT NOT NULL,
  index_id TEXT NOT NULL,
  tickers TEXT NOT NULL,
  ticker_count INTEGER NOT NULL,
  source_version TEXT,
  computed_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_universe_snapshots_pit ON universe_snapshots(index_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_universe_snapshots_date ON universe_snapshots(snapshot_date);

-- ============================================
-- 6. Prediction Markets (from 006_prediction_markets)
-- ============================================

CREATE TABLE IF NOT EXISTS prediction_market_snapshots (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  market_ticker TEXT NOT NULL,
  market_type TEXT NOT NULL,
  market_question TEXT,
  snapshot_time TEXT NOT NULL,
  data JSON NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pm_snapshots_platform ON prediction_market_snapshots(platform);
CREATE INDEX IF NOT EXISTS idx_pm_snapshots_ticker ON prediction_market_snapshots(market_ticker);
CREATE INDEX IF NOT EXISTS idx_pm_snapshots_type ON prediction_market_snapshots(market_type);
CREATE INDEX IF NOT EXISTS idx_pm_snapshots_time ON prediction_market_snapshots(snapshot_time);

CREATE TABLE IF NOT EXISTS prediction_market_signals (
  id TEXT PRIMARY KEY,
  signal_type TEXT NOT NULL,
  signal_value REAL NOT NULL,
  confidence REAL,
  computed_at TEXT NOT NULL,
  inputs JSON NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pm_signals_type ON prediction_market_signals(signal_type);
CREATE INDEX IF NOT EXISTS idx_pm_signals_time ON prediction_market_signals(computed_at);

CREATE TABLE IF NOT EXISTS prediction_market_arbitrage (
  id TEXT PRIMARY KEY,
  kalshi_ticker TEXT NOT NULL,
  polymarket_token TEXT NOT NULL,
  kalshi_price REAL NOT NULL,
  polymarket_price REAL NOT NULL,
  divergence_pct REAL NOT NULL,
  market_type TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  resolved_at TEXT,
  resolution_price REAL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pm_arbitrage_divergence ON prediction_market_arbitrage(divergence_pct);
CREATE INDEX IF NOT EXISTS idx_pm_arbitrage_detected ON prediction_market_arbitrage(detected_at);
CREATE INDEX IF NOT EXISTS idx_pm_arbitrage_unresolved ON prediction_market_arbitrage(resolved_at) WHERE resolved_at IS NULL;

-- ============================================
-- 7. External Events (from 007_external_events)
-- ============================================

CREATE TABLE IF NOT EXISTS external_events (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_time TEXT NOT NULL,
  processed_at TEXT NOT NULL,
  sentiment TEXT NOT NULL,
  confidence REAL NOT NULL,
  importance INTEGER NOT NULL,
  summary TEXT NOT NULL,
  key_insights JSON NOT NULL,
  entities JSON NOT NULL,
  data_points JSON NOT NULL,
  sentiment_score REAL NOT NULL,
  importance_score REAL NOT NULL,
  surprise_score REAL NOT NULL,
  related_instruments JSON NOT NULL,
  original_content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_external_events_event_time ON external_events(event_time);
CREATE INDEX IF NOT EXISTS idx_external_events_source_type ON external_events(source_type);
CREATE INDEX IF NOT EXISTS idx_external_events_event_type ON external_events(event_type);
CREATE INDEX IF NOT EXISTS idx_external_events_processed_at ON external_events(processed_at);
CREATE INDEX IF NOT EXISTS idx_external_events_sentiment ON external_events(sentiment);
CREATE INDEX IF NOT EXISTS idx_external_events_importance ON external_events(importance_score);

-- ============================================
-- 8. Indicator Synthesis (from 008_indicator_synthesis)
-- ============================================

CREATE TABLE IF NOT EXISTS indicators (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'staging',
  hypothesis TEXT NOT NULL,
  economic_rationale TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  generated_by TEXT NOT NULL,
  code_hash TEXT,
  ast_signature TEXT,
  validation_report TEXT,
  paper_trading_start TEXT,
  paper_trading_end TEXT,
  paper_trading_report TEXT,
  promoted_at TEXT,
  pr_url TEXT,
  merged_at TEXT,
  retired_at TEXT,
  retirement_reason TEXT,
  similar_to TEXT REFERENCES indicators(id),
  replaces TEXT REFERENCES indicators(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_indicators_status ON indicators(status);
CREATE INDEX IF NOT EXISTS idx_indicators_category ON indicators(category);
CREATE INDEX IF NOT EXISTS idx_indicators_code_hash ON indicators(code_hash);
CREATE INDEX IF NOT EXISTS idx_indicators_active ON indicators(status) WHERE status IN ('paper', 'production');

CREATE TABLE IF NOT EXISTS indicator_trials (
  id TEXT PRIMARY KEY,
  indicator_id TEXT NOT NULL REFERENCES indicators(id) ON DELETE CASCADE,
  trial_number INTEGER NOT NULL,
  hypothesis TEXT NOT NULL,
  parameters TEXT NOT NULL,
  sharpe_ratio REAL,
  information_coefficient REAL,
  max_drawdown REAL,
  calmar_ratio REAL,
  sortino_ratio REAL,
  selected INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(indicator_id, trial_number)
);

CREATE INDEX IF NOT EXISTS idx_trials_indicator ON indicator_trials(indicator_id);

CREATE TABLE IF NOT EXISTS indicator_ic_history (
  id TEXT PRIMARY KEY,
  indicator_id TEXT NOT NULL REFERENCES indicators(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  ic_value REAL NOT NULL,
  ic_std REAL NOT NULL,
  decisions_used_in INTEGER NOT NULL DEFAULT 0,
  decisions_correct INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(indicator_id, date)
);

CREATE INDEX IF NOT EXISTS idx_ic_history_indicator_date ON indicator_ic_history(indicator_id, date);

-- ============================================
-- 9. Factor Zoo (from 009_factor_zoo)
-- ============================================

CREATE TABLE IF NOT EXISTS hypotheses (
  hypothesis_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  economic_rationale TEXT NOT NULL,
  market_mechanism TEXT NOT NULL,
  target_regime TEXT,
  falsification_criteria TEXT,
  status TEXT NOT NULL DEFAULT 'proposed',
  iteration INTEGER NOT NULL DEFAULT 1,
  parent_hypothesis_id TEXT REFERENCES hypotheses(hypothesis_id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_hypotheses_status ON hypotheses(status);

CREATE TABLE IF NOT EXISTS factors (
  factor_id TEXT PRIMARY KEY,
  hypothesis_id TEXT REFERENCES hypotheses(hypothesis_id),
  name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'research',
  version INTEGER NOT NULL DEFAULT 1,
  author TEXT NOT NULL DEFAULT 'claude-code',
  python_module TEXT,
  typescript_module TEXT,
  symbolic_length INTEGER,
  parameter_count INTEGER,
  feature_count INTEGER,
  originality_score REAL,
  hypothesis_alignment REAL,
  stage1_sharpe REAL,
  stage1_ic REAL,
  stage1_max_drawdown REAL,
  stage1_completed_at TEXT,
  stage2_pbo REAL,
  stage2_dsr_pvalue REAL,
  stage2_wfe REAL,
  stage2_completed_at TEXT,
  paper_validation_passed INTEGER DEFAULT 0,
  paper_start_date TEXT,
  paper_end_date TEXT,
  paper_realized_sharpe REAL,
  paper_realized_ic REAL,
  current_weight REAL DEFAULT 0.0,
  last_ic REAL,
  decay_rate REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  promoted_at TEXT,
  retired_at TEXT,
  last_updated TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_factors_status ON factors(status);
CREATE INDEX IF NOT EXISTS idx_factors_hypothesis ON factors(hypothesis_id);
CREATE INDEX IF NOT EXISTS idx_factors_active ON factors(status) WHERE status IN ('active', 'decaying');

CREATE TABLE IF NOT EXISTS factor_performance (
  id TEXT PRIMARY KEY,
  factor_id TEXT NOT NULL REFERENCES factors(factor_id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  ic REAL NOT NULL,
  icir REAL,
  sharpe REAL,
  weight REAL NOT NULL DEFAULT 0.0,
  signal_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(factor_id, date)
);

CREATE INDEX IF NOT EXISTS idx_factor_perf_factor_date ON factor_performance(factor_id, date);

CREATE TABLE IF NOT EXISTS factor_correlations (
  factor_id_1 TEXT NOT NULL REFERENCES factors(factor_id) ON DELETE CASCADE,
  factor_id_2 TEXT NOT NULL REFERENCES factors(factor_id) ON DELETE CASCADE,
  correlation REAL NOT NULL,
  computed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(factor_id_1, factor_id_2)
);

CREATE TABLE IF NOT EXISTS research_runs (
  run_id TEXT PRIMARY KEY,
  trigger_type TEXT NOT NULL,
  trigger_metadata TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  hypotheses_generated INTEGER DEFAULT 0,
  factors_generated INTEGER DEFAULT 0,
  factors_validated INTEGER DEFAULT 0,
  factors_promoted INTEGER DEFAULT 0,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_research_runs_status ON research_runs(status);
CREATE INDEX IF NOT EXISTS idx_research_runs_started ON research_runs(started_at);

CREATE TABLE IF NOT EXISTS factor_weights (
  factor_id TEXT PRIMARY KEY REFERENCES factors(factor_id) ON DELETE CASCADE,
  weight REAL NOT NULL DEFAULT 0.0,
  last_ic REAL,
  last_updated TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================
-- 10. Paper Signals (from 010_paper_signals)
-- ============================================

CREATE TABLE IF NOT EXISTS paper_signals (
  id TEXT PRIMARY KEY,
  factor_id TEXT NOT NULL REFERENCES factors(factor_id) ON DELETE CASCADE,
  signal_date TEXT NOT NULL,
  symbol TEXT NOT NULL,
  signal_value REAL NOT NULL,
  direction TEXT NOT NULL,
  entry_price REAL,
  exit_price REAL,
  actual_return REAL,
  predicted_return REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(factor_id, signal_date, symbol)
);

CREATE INDEX IF NOT EXISTS idx_paper_signals_factor ON paper_signals(factor_id);
CREATE INDEX IF NOT EXISTS idx_paper_signals_date ON paper_signals(signal_date);
CREATE INDEX IF NOT EXISTS idx_paper_signals_factor_date ON paper_signals(factor_id, signal_date);

-- ============================================
-- Record consolidated migration
-- ============================================
INSERT INTO schema_migrations (version, name) VALUES (0, 'consolidated_init');
